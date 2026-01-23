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
        updatedAt: now // 新增字段
      }
    });

    const teamId = teamRes._id;

    // B. 将自己加入成员表 (Admin)
    await transaction.collection('team_members').add({
      data: {
        teamId,
        userId,
        role: 'admin',
        userInfo, // 保存快照
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

// 4. 获取团队今日状态 (核心：为 UI 供数)
async function getTeamStatus(myUserId, { teamId, dateStr }) {
  // dateStr 格式: "2026-01-23"
  
  // 第一步：获取团队所有成员
  const membersRes = await db.collection('team_members')
    .where({ teamId })
    .limit(100) // 假设团队不超过100人
    .get();
  
  const members = membersRes.data;
  const memberIds = members.map(m => m.userId);

  // 第二步：批量获取这些成员在指定日期的考勤状态
  const attendanceRes = await db.collection('attendance_records')
    .where({
      _openid: _.in(memberIds),
      date: dateStr // 修正: 原代码是 dateStr: dateStr，但数据库字段是 date
    })
    .get();

  const attendanceMap = {};
  attendanceRes.data.forEach(r => {
    attendanceMap[r._openid] = r.status; // status: 'office', 'leave', 'remote'
  });

  // 第三步：数据组装 (Merge)
  const resultList = [];
  members.forEach(m => {
    const status = attendanceMap[m.userId];
    if (status) { // 只保留有状态的成员
      resultList.push({
        userId: m.userId,
        name: m.userInfo.nickName || 'Unknown',
        avatar: m.userInfo.avatarUrl || '',
        status: status,
        isMe: m.userId === myUserId
      });
    }
  });

  // 第四步：排序 (Office > Remote > Leave)
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
