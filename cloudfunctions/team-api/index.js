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
      case 'joinTeam':
        result = await joinTeam(myOpenId, payload);
        break;
      case 'getMyTeams':
        result = await getMyTeams(myOpenId);
        break;
      case 'getTeamStatus':
        result = await getTeamStatus(myOpenId, payload); // 聚合查询
        break;
      case 'getTeamDetail':
        result = await getTeamDetail(myOpenId, payload); // 新增：首屏大管家
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

// 2. 加入团队
async function joinTeam(userId, { inviteCode, userInfo }) {
  // A. 查团队是否存在
  const teamRes = await db.collection('teams').where({ inviteCode }).get();
  if (teamRes.data.length === 0) {
    return { code: 404, msg: '邀请码无效' };
  }
  const team = teamRes.data[0];

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
      userId, // 响应第4点：这里写入用户ID
      role: 'member',
      userInfo,
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

// 4. 获取团队今日状态 (小兵：只负责按需加载)
async function getTeamStatus(myUserId, { teamId, dateStr }) {
  // dateStr 格式: "2026-01-23"
  
  // 第一步：获取团队所有成员
  const membersRes = await db.collection('team_members')
    .where({ teamId })
    .limit(100)
    .get();
  
  const members = membersRes.data;
  const memberIds = members.map(m => m.userId);

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
  const resultList = [];
  members.forEach(m => {
    const status = attendanceMap[m.userId];
    if (status) { 
      resultList.push({
        userId: m.userId,
        name: m.nickName || 'Unknown',
        avatar: m.avatarUrl || '',
        status: status,
        isMe: m.userId === myUserId
      });
    }
  });

  // 第四步：排序
  const sortScore = { 'office': 4, 'remote': 3, 'leave': 2 };
  resultList.sort((a, b) => (sortScore[b.status] || 0) - (sortScore[a.status] || 0));

  return { 
    code: 200, 
    data: {
      members: resultList,
      totalMembers: members.length
    }
  };
}

// 5. 获取团队详情 (大管家：首屏加载)
async function getTeamDetail(myUserId, { teamId }) {
  console.log(`[TeamAPI] Version: Fix-Scope-v2`);
  console.log(`[TeamAPI] getTeamDetail Start: teamId=${teamId}`);
  const now = new Date();
  // 计算本周周一
  const day = now.getDay(); 
  const diff = now.getDate() - (day === 0 ? 6 : day - 1); 
  const monday = new Date(now);
  monday.setDate(diff);

  // 生成本周7天日期字符串
  const weekDates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    weekDates.push(d.toISOString().split('T')[0]);
  }

  // 并行查询：今日详情 + 本周统计
  const todayStr = now.toISOString().split('T')[0];
  
  // 1. 获取今日状态 (复用 getTeamStatus 逻辑)
  const todayStatusPromise = getTeamStatus(myUserId, { teamId, dateStr: todayStr });

  // 2. 获取本周统计
  // 为了性能，这里我们只查 officeCount，不查具体人
  // 先查出所有成员ID
  const membersRes = await db.collection('team_members').where({ teamId }).limit(100).get();
  const members = membersRes.data;
  const memberIds = members.map(m => m.userId);
  const totalMembers = members.length;

  const weekStatsPromise = db.collection('attendance_records')
    .aggregate()
    .match({
      _openid: _.in(memberIds),
      date: _.in(weekDates),
      status: 'office' // 只统计去办公室的人数
    })
    .group({
      _id: '$date',
      officeCount: $.sum(1)
    })
    .end();

  // 2.1 获取本周 Top Worker (上班王)
  const topWorkerPromise = db.collection('attendance_records')
    .aggregate()
    .match({
      _openid: _.in(memberIds),
      date: _.in(weekDates),
      status: 'office'
    })
    .group({
      _id: '$_openid',
      count: $.sum(1)
    })
    .sort({
      count: -1
    })
    .limit(1)
    .end();

  const [todayRes, weekStatsRes, topWorkerRes] = await Promise.all([todayStatusPromise, weekStatsPromise, topWorkerPromise]);
  
  // 安全获取数据
  const todayMembers = (todayRes && todayRes.data && todayRes.data.members) ? todayRes.data.members : [];
  const weekStatsList = (weekStatsRes && weekStatsRes.list) ? weekStatsRes.list : [];

  console.log(`[TeamAPI] getTeamDetail Fetched Data: todayCount=${todayMembers.length}, weekStatsCount=${weekStatsList.length}`);

  // 3. 获取团队基本信息 (baseInfo)
  const teamInfoRes = await db.collection('teams').doc(teamId).get();
  const teamInfo = teamInfoRes.data;

  // 处理周统计数据
  const statsMap = {};
  weekStatsList.forEach(item => {
    statsMap[item._id] = item.officeCount;
  });

  const weeklyStats = weekDates.map(date => ({
    date,
    officeCount: statsMap[date] || 0,
    totalCount: totalMembers,
    ratio: totalMembers > 0 ? (statsMap[date] || 0) / totalMembers : 0
  }));

  // 计算 bestDay
  let bestDay = { dayName: '', count: 0 };
  let maxCount = -1;
  const weekDays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  
  weeklyStats.forEach((stat, index) => {
    if (stat.officeCount > maxCount) {
      maxCount = stat.officeCount;
      bestDay = {
        dayName: weekDays[index],
        count: maxCount
      };
    }
  });

  // 处理 Top Worker
  let topWorker = null;
  if (topWorkerRes.list.length > 0) {
    const winner = topWorkerRes.list[0];
    const winnerInfo = members.find(m => m.userId === winner._id);
    if (winnerInfo) {
      topWorker = {
        name: winnerInfo.nickName || '神秘人',
        avatar: winnerInfo.avatarUrl || '',
        count: winner.count
      };
    }
  }

  return {
    code: 200,
    data: {
      baseInfo: {
        name: teamInfo.name,
        inviteCode: teamInfo.inviteCode,
        ownerId: teamInfo.ownerId,
        updatedAt: teamInfo.updatedAt
      },
      members: todayMembers, // 今日成员列表（含状态）
      summary: {
        weeklyTrend: weeklyStats, // 包含 ratio, officeCount 等
        bestDay: bestDay,
        topWorker: topWorker,
        totalMembers: totalMembers
      }
    }
  };
}
