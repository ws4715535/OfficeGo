const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const $ = db.command.aggregate;

// --- 邀请码生成算法 (Utils) ---
const generateInviteCode = (length = 6) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去除 I, L, 1, O, 0
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// --- 核心入口 ---
exports.main = async (event, context) => {
  const { action, payload } = event;
  console.log(`[TeamAPI] Action: ${action}`, payload);
  const wxContext = cloud.getWXContext();
  const myOpenId = wxContext.OPENID; // 响应第4点：从 Context 获取 ID 最安全

  try {
    let result;
    switch (action) {
      case 'createTeam':
        result = await createTeam(myOpenId, payload);
        break;
      case 'getTeamByInviteCode': // 新增：预览团队信息
        result = await getTeamByInviteCode(myOpenId, payload);
        break;
      case 'joinTeam':
        result = await joinTeam(myOpenId, payload);
        break;
      case 'getMyTeams':
        result = await getMyTeams(myOpenId);
        break;
      case 'getTeamStatus':
        // result = await getTeamStatus(myOpenId, payload); // 旧逻辑，已废弃
        result = { code: 400, msg: 'API Deprecated, use getDailyAttendance or getTeamStats' };
        break;
      case 'getDailyAttendance': // 新 Action
        result = await getDailyAttendance(myOpenId, payload);
        break;
      case 'getTeamDetail':
        result = await getTeamDetail(myOpenId, payload); // 简化版
        break;
      case 'getTeamStats':
        result = await getTeamStats(myOpenId, payload); // 新增统计
        break;
      case 'updateTeam':
        result = await updateTeam(myOpenId, payload);
        break;
      case 'leaveTeam':
        result = await leaveTeam(myOpenId, payload);
        break;
      case 'deleteTeam':
        result = await deleteTeam(myOpenId, payload);
        break;
      default:
        result = { code: 400, msg: 'Unknown action' };
    }
    console.log(`[TeamAPI] Success: ${action}`, result);
    return result;
  } catch (err) {
    console.error(`[TeamAPI] Error: ${action}`, err);
    return { code: 500, msg: err.message, error: err };
  }
};

// 1. 创建团队
async function createTeam(userId, { name, userInfo }) {
  // 循环尝试生成唯一邀请码
  let inviteCode = '';
  let isUnique = false;
  let retry = 0;

  while (!isUnique && retry < 5) {
    inviteCode = generateInviteCode();
    const countResult = await db.collection('teams').where({ inviteCode }).count();
    if (countResult.total === 0) isUnique = true;
    retry++;
  }

  if (!isUnique) return { code: 500, msg: '生成邀请码失败，请重试' };

  const now = new Date();
  const transaction = await db.startTransaction();

  try {
    // A. 创建团队记录
    const teamRes = await transaction.collection('teams').add({
      data: {
        name,
        inviteCode,
        ownerId: userId,
        createdAt: now,
        updatedAt: now
      }
    });

    const teamId = teamRes._id;

    // B. 将自己加入成员表 (Admin)
    await transaction.collection('team_members').add({
      data: {
        teamId,
        userId,
        role: 'admin',
        nickName: userInfo.nickName || '',
        avatarUrl: userInfo.avatarUrl || '',
        joinedAt: now
      }
    });

    await transaction.commit();
    return { code: 200, data: { teamId, inviteCode }, msg: '创建成功' };
  } catch (e) {
    await transaction.rollback();
    return { code: 500, msg: '创建失败', error: e };
  }
}

// 1.5 根据邀请码获取团队信息 (预览)
async function getTeamByInviteCode(userId, { inviteCode }) {
  // A. 查团队是否存在
  const teamRes = await db.collection('teams').where({ inviteCode }).get();
  if (teamRes.data.length === 0) {
    return { code: 404, msg: '邀请码无效，请检查' };
  }
  const team = teamRes.data[0];

  // B. 获取成员数量
  const countRes = await db.collection('team_members').where({ teamId: team._id }).count();
  
  // C. 检查是否已加入
  const isMember = await db.collection('team_members').where({ teamId: team._id, userId }).count();

  return {
    code: 200,
    data: {
      teamId: team._id,
      name: team.name,
      ownerId: team.ownerId, // 可以查一下 owner name，暂时只返回 ID
      memberCount: countRes.total,
      isJoined: isMember.total > 0
    },
    msg: '获取成功'
  };
}

// 2. 加入团队
async function joinTeam(userId, { inviteCode, teamId, userInfo }) {
  // 允许通过 inviteCode 或 teamId 加入
  let team;
  
  if (teamId) {
      const teamRes = await db.collection('teams').doc(teamId).get();
      team = teamRes.data;
  } else if (inviteCode) {
      const teamRes = await db.collection('teams').where({ inviteCode }).get();
      if (teamRes.data.length === 0) return { code: 404, msg: '邀请码无效' };
      team = teamRes.data[0];
  } else {
      return { code: 400, msg: '参数缺失' };
  }

  // B. 查是否已加入
  const memberCheck = await db.collection('team_members').where({
    teamId: team._id,
    userId
  }).count();

  if (memberCheck.total > 0) {
    return { code: 400, msg: '你已经在该团队中了' };
  }

  // C. 写入成员表
  await db.collection('team_members').add({
    data: {
      teamId: team._id,
      userId, 
      role: 'member',
      nickName: userInfo.nickName || '',
      avatarUrl: userInfo.avatarUrl || '',
      joinedAt: new Date()
    }
  });

  return { code: 200, data: { teamId: team._id }, msg: '加入成功' };
}

// 3. 获取我的团队列表 (用于切换团队)
async function getMyTeams(userId) {
  // 联表查询：先查关系表，再聚合团队详情
  const res = await db.collection('team_members').aggregate()
    .match({ userId })
    .lookup({
      from: 'teams',
      localField: 'teamId',
      foreignField: '_id',
      as: 'teamInfo'
    })
    .end();

  const list = res.list.map(item => {
    return item.teamInfo[0] ? {
      teamId: item.teamId,
      name: item.teamInfo[0].name,
      role: item.role,
      inviteCode: item.role === 'admin' ? item.teamInfo[0].inviteCode : '***' // 只有管理员能看码
    } : null;
  }).filter(i => i);

  return { code: 200, data: list };
}

// 4. 获取单日考勤 (点击某一天) - 原 getTeamStatus 改造
async function getDailyAttendance(myUserId, { teamId, dateStr }) {
  // dateStr 格式: "2026-01-23"
  
  // 第一步：获取团队所有成员
  const membersRes = await db.collection('team_members')
    .where({ teamId })
    .limit(100)
    .get();
  
  const members = membersRes.data;
  const memberIds = members.map(m => m.userId);

  // --- Sync Check: Fetch latest user info from 'users' collection to ensure freshness ---
  // Ideally, 'team_members' should be kept in sync via updateUser hook, but let's be safe
  // and do a join query or separate fetch to get latest avatars/nicknames.
  // Since lookup has limits and might be slow, let's just query 'users' for these IDs.
  
  const usersRes = await db.collection('users')
    .where({
        _openid: _.in(memberIds)
    })
    .get();
    
  const userMap = {};
  usersRes.data.forEach(u => {
      userMap[u._openid] = u;
  });
  // -----------------------------------------------------------------------------------

  // 第二步：获取指定日期的考勤状态
  const attendanceRes = await db.collection('attendance_records')
    .where({
      _openid: _.in(memberIds),
      date: dateStr
    })
    .get();

  const attendanceMap = {};
  attendanceRes.data.forEach(r => {
    attendanceMap[r._openid] = r.status;
  });

  // 第三步：数据组装
  // --- Sync Check & Write Back ---
  // Sync Logic: Check if team_members data is outdated and update it
  const syncUpdates = [];

  const resultList = [];
  members.forEach(m => {
    // Merge latest user info if available
    const latestUser = userMap[m.userId] || {};
    const finalNickName = latestUser.nickName || m.nickName || 'Unknown';
    const finalAvatarUrl = latestUser.avatarUrl || m.avatarUrl || '';

    // Check if sync is needed
    if ((latestUser.nickName && latestUser.nickName !== m.nickName) || 
        (latestUser.avatarUrl && latestUser.avatarUrl !== m.avatarUrl)) {
        
        // Push update promise
        syncUpdates.push(
            db.collection('team_members').doc(m._id).update({
                data: {
                    nickName: latestUser.nickName,
                    avatarUrl: latestUser.avatarUrl
                }
            })
        );
    }

    const status = attendanceMap[m.userId];
    // Always include member even if no status (status will be undefined -> unknown)
    // Wait, UI filters logic? The original code filtered: "if (status) { push }"
    // But usually we want to see all members in the list, right?
    // Let's check UI... The UI filters: "members.filter(m => m.status === 'OFFICE')" for "Who is in Office" section
    // But maybe we want to return everyone so client can filter?
    // The previous implementation ONLY returned people with status.
    // However, if we want to show "All Members" in settings, we need everyone.
    // This function is "getDailyAttendance", primarily for the main page dashboard.
    // BUT, let's keep it consistent: return everyone, let frontend decide.
    // Actually, looking at previous code: "if (status) { ... }"
    // If I change this, I might break the "Who is in Office" count if frontend relies on array length.
    // Let's see frontend...
    // Frontend: "members.filter(m => m.status === 'OFFICE')"
    // So if I return everyone, those without status will be 'unknown'.
    // It is SAFER to return everyone, so we can show "Leave" or "Remote" or "Unknown" users too.
    
    // Original logic only pushed if status existed?
    // "if (status) { resultList.push(...) }"
    // This means if I didn't check in, I am NOT in the list?
    // That seems wrong for a "Team" page. I should be there, just with "Unknown" status.
    // Let's fix this to include everyone.
    
    resultList.push({
      userId: m.userId,
      name: finalNickName,
      avatar: finalAvatarUrl,
      role: m.role || 'member',
      status: status || 'unknown',
      isMe: m.userId === myUserId
    });
  });

  // 第四步：排序
  const sortScore = { 'office': 4, 'remote': 3, 'leave': 2, 'unknown': 1 };
  resultList.sort((a, b) => (sortScore[b.status] || 0) - (sortScore[a.status] || 0));

  // Execute sync updates in background
  if (syncUpdates.length > 0) {
      console.log(`[Sync] Updating ${syncUpdates.length} outdated team members in DailyAttendance...`);
      try {
          await Promise.all(syncUpdates);
          console.log('[Sync] Update complete');
      } catch (e) {
          console.error('[Sync] Update failed', e);
      }
  }

  return { 
    code: 200, 
    data: {
      members: resultList,
      totalMembers: members.length
    }
  };
}

// 5. 获取团队基础详情 (首屏加载，无统计)
async function getTeamDetail(myUserId, { teamId }) {
  console.log(`[TeamAPI] getTeamDetail (Base): teamId=${teamId}`);
  
  // 1. 获取团队基本信息
  const teamInfoRes = await db.collection('teams').doc(teamId).get();
  const teamInfo = teamInfoRes.data;

  // 2. 获取成员列表 (不带今日状态，只带基础信息)
  const membersRes = await db.collection('team_members').where({ teamId }).limit(100).get();
  
  // --- Sync Check & Write Back ---
  const memberIds = membersRes.data.map(m => m.userId);
  const usersRes = await db.collection('users').where({ _openid: _.in(memberIds) }).get();
  const userMap = {};
  usersRes.data.forEach(u => { userMap[u._openid] = u; });
  
  // Sync Logic: Check if team_members data is outdated and update it
  const syncUpdates = [];
  
  const members = membersRes.data.map(m => {
    const latestUser = userMap[m.userId] || {};
    const finalNickName = latestUser.nickName || m.nickName || 'Unknown';
    const finalAvatarUrl = latestUser.avatarUrl || m.avatarUrl || '';
    
    // Check if sync is needed
    if ((latestUser.nickName && latestUser.nickName !== m.nickName) || 
        (latestUser.avatarUrl && latestUser.avatarUrl !== m.avatarUrl)) {
        
        // Push update promise
        syncUpdates.push(
            db.collection('team_members').doc(m._id).update({
                data: {
                    nickName: latestUser.nickName,
                    avatarUrl: latestUser.avatarUrl
                }
            })
        );
    }

    return {
        userId: m.userId,
        name: finalNickName,
        avatar: finalAvatarUrl,
        role: m.role || 'member',
        isMe: m.userId === myUserId,
        joinedAt: m.joinedAt
    };
  });
  
  // Execute sync updates in background (await them to ensure completion in cloud function)
  if (syncUpdates.length > 0) {
      console.log(`[Sync] Updating ${syncUpdates.length} outdated team members...`);
      try {
          await Promise.all(syncUpdates);
          console.log('[Sync] Update complete');
      } catch (e) {
          console.error('[Sync] Update failed', e);
      }
  }

  // 排序：自己 -> Admin -> 其他

  // 排序：自己 -> Admin -> 其他
  members.sort((a, b) => {
    if (a.isMe && !b.isMe) return -1;
    if (!a.isMe && b.isMe) return 1;
    if (a.role === 'admin' && b.role !== 'admin') return -1;
    if (a.role !== 'admin' && b.role === 'admin') return 1;
    return 0;
  });

  return {
    code: 200,
    data: {
      baseInfo: {
        teamId: teamInfo._id,
        name: teamInfo.name,
        inviteCode: teamInfo.inviteCode,
        ownerId: teamInfo.ownerId,
        createdAt: teamInfo.createdAt,
        updatedAt: teamInfo.updatedAt
      },
      members: members
    }
  };
}

// 5.5 获取团队统计 (异步加载：趋势 + 榜单)
async function getTeamStats(myUserId, { teamId, dimension = 'week', refDate }) {
  console.log(`[TeamAPI] getTeamStats: teamId=${teamId}, dim=${dimension}, ref=${refDate}`);
  const now = refDate ? new Date(refDate) : new Date();
  
  let startDate, endDate;
  const dateList = []; // 用于趋势图

  if (dimension === 'week') {
    // 计算本周周日 (Start) 至 周六 (End) - No, standard calendar is Sun-Sat or Mon-Sun?
    // Request: "OfficeDay趋势的显示逻辑应该和日历保持一致，周日开始的。"
    // Standard Calendar: Sunday is 0.
    
    const day = now.getDay(); // 0 (Sun) to 6 (Sat)
    const diff = now.getDate() - day; // Go back to Sunday
    startDate = new Date(now);
    startDate.setDate(diff); // Sunday
    startDate.setHours(0,0,0,0);
    
    // Generate 7 days (Sun to Sat)
    for (let i = 0; i < 7; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      dateList.push(d.toISOString().split('T')[0]);
    }
  } else if (dimension === 'month') {
      // 暂时只支持 week，month 逻辑类似但数据量大
      // ...
  }

  // 1. 获取本周所有 office 记录
  const membersRes = await db.collection('team_members').where({ teamId }).limit(100).get();
  const memberIds = membersRes.data.map(m => m.userId);
  const totalMembers = memberIds.length;

  const statsRes = await db.collection('attendance_records')
    .aggregate()
    .match({
      _openid: _.in(memberIds),
      date: _.in(dateList),
      status: 'office'
    })
    .group({
      _id: '$date',
      officeCount: $.sum(1)
    })
    .end();

  // 2. 获取 Top Worker
  const topWorkerRes = await db.collection('attendance_records')
    .aggregate()
    .match({
      _openid: _.in(memberIds),
      date: _.in(dateList),
      status: 'office'
    })
    .group({
      _id: '$_openid',
      count: $.sum(1)
    })
    .sort({ count: -1 })
    .limit(1)
    .end();

  // 3. 组装趋势图
  const statsMap = {};
  (statsRes.list || []).forEach(item => {
    statsMap[item._id] = item.officeCount;
  });

  const trend = dateList.map(date => ({
    date,
    officeCount: statsMap[date] || 0,
    totalCount: totalMembers,
    ratio: totalMembers > 0 ? (statsMap[date] || 0) / totalMembers : 0
  }));

  // 4. 计算 Best Day
  let bestDay = { dayName: '', count: 0 };
  let maxCount = -1;
  const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']; // Sun-Sat
  trend.forEach((stat, index) => {
    if (stat.officeCount > maxCount) {
      maxCount = stat.officeCount;
      bestDay = {
        dayName: weekDays[index],
        count: maxCount
      };
    }
  });

  // 5. 组装 Top Worker
  let topWorker = null;
  if (topWorkerRes.list && topWorkerRes.list.length > 0) {
    const winnerId = topWorkerRes.list[0]._id;
    const winnerInfo = membersRes.data.find(m => m.userId === winnerId);
    if (winnerInfo) {
      topWorker = {
        name: winnerInfo.nickName || '神秘人',
        avatar: winnerInfo.avatarUrl || '',
        count: topWorkerRes.list[0].count
      };
    }
  }

  return {
    code: 200,
    data: {
      dimension,
      trend,
      bestDay,
      topWorker,
      totalMembers
    }
  };
}

// 6. 更新团队信息 (修改名称/移除成员)
async function updateTeam(userId, { teamId, name, removeMemberId }) {
  const now = new Date();

  // 1. 权限检查：只有管理员/创建者可以操作
  const adminCheck = await db.collection('team_members').where({
    teamId,
    userId,
    role: 'admin'
  }).count();

  if (adminCheck.total === 0) {
    return { code: 403, msg: '只有管理员有权修改团队设置' };
  }

  // 场景 A：修改团队名称
  if (name) {
    await db.collection('teams').doc(teamId).update({
      data: {
        name,
        updatedAt: now // 响应你对数据更新追踪的需求
      }
    });
    return { code: 200, msg: '团队名称更新成功' };
  }

  // 场景 B：删除/踢出成员
  if (removeMemberId) {
    if (removeMemberId === userId) {
      return { code: 400, msg: '不能删除自己（请使用退出团队功能）' };
    }
    
    await db.collection('team_members').where({
      teamId,
      userId: removeMemberId
    }).remove();

    return { code: 200, msg: '成员已移除' };
  }

  return { code: 400, msg: '未指定更新内容' };
}

// 7. 退出团队
async function leaveTeam(userId, { teamId }) {
  // 1. 检查是否是 Owner
  const teamRes = await db.collection('teams').doc(teamId).get();
  const team = teamRes.data;
  
  if (team.ownerId === userId) {
    return { code: 400, msg: '创建者不能退出团队，请选择解散团队' };
  }

  // 2. 移除成员记录
  const removeRes = await db.collection('team_members').where({
    teamId,
    userId
  }).remove();

  if (removeRes.stats.removed > 0) {
    return { code: 200, msg: '已退出团队' };
  } else {
    return { code: 400, msg: '你不在该团队中' };
  }
}

// 8. 解散团队
async function deleteTeam(userId, { teamId }) {
  // 1. 检查是否是 Owner
  const teamRes = await db.collection('teams').doc(teamId).get();
  const team = teamRes.data;
  
  if (team.ownerId !== userId) {
    return { code: 403, msg: '只有创建者可以解散团队' };
  }

  const transaction = await db.startTransaction();
  try {
    // 2. 删除团队记录
    await transaction.collection('teams').doc(teamId).remove();
    
    // 3. 删除所有成员记录
    await transaction.collection('team_members').where({ teamId }).remove();
    
    // 4. (可选) 删除相关考勤记录? 暂时保留吧，或者也可以删。保留作为历史数据更好。
    
    await transaction.commit();
    return { code: 200, msg: '团队已解散' };
  } catch (e) {
    await transaction.rollback();
    return { code: 500, msg: '解散失败', error: e };
  }
}
