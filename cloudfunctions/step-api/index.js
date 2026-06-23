const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const DAILY_STEP_GOAL = 6000
const DEFAULT_WEEKLY_GOAL = 50000
const CHINA_TIME_OFFSET = 8 * 60 * 60 * 1000

const toChinaDate = (date = new Date()) => {
  const source = new Date(date)
  return new Date(source.getTime() + CHINA_TIME_OFFSET)
}

const formatDate = (date) => {
  const d = toChinaDate(date)
  const year = d.getUTCFullYear()
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const formatTimestampDate = (timestamp) => {
  if (!timestamp) return null
  return formatDate(new Date(timestamp * 1000))
}

const getWeekStartDate = (baseDate = new Date()) => {
  const date = toChinaDate(baseDate)
  const day = date.getUTCDay()
  date.setUTCDate(date.getUTCDate() - day)
  date.setUTCHours(0, 0, 0, 0)
  return date
}

const getWeekDateList = (weekStart) => {
  const start = typeof weekStart === 'string'
    ? new Date(`${weekStart}T00:00:00.000Z`)
    : new Date(weekStart)
  const list = []
  for (let i = 0; i < 7; i++) {
    const current = new Date(start)
    current.setUTCDate(start.getUTCDate() + i)
    list.push(formatDate(current))
  }
  return list
}

const getTodayDateStr = () => formatDate(new Date())

const sumSteps = (records = []) => records.reduce((sum, item) => sum + (Number(item.stepCount) || 0), 0)

async function getUserByOpenId(openid) {
  const res = await db.collection('users').where({ _openid: openid }).get()
  return res.data[0] || null
}

async function updateUserSettings(openid, patch) {
  const user = await getUserByOpenId(openid)
  if (!user) {
    return null
  }

  const mergedSettings = {
    ...(user.settings || {}),
    ...patch
  }

  await db.collection('users').doc(user._id).update({
    data: {
      settings: mergedSettings,
      updatedAt: db.serverDate()
    }
  })

  return mergedSettings
}

async function ensureTeamMember(teamId, userId) {
  const res = await db.collection('team_members').where({ teamId, userId }).count()
  return res.total > 0
}

async function getTeamWithMembers(teamId) {
  const [teamRes, membersRes] = await Promise.all([
    db.collection('teams').doc(teamId).get(),
    db.collection('team_members').aggregate()
      .match({ teamId })
      .lookup({
        from: 'users',
        localField: 'userId',
        foreignField: '_openid',
        as: 'userInfo'
      })
      .project({
        userId: 1,
        role: 1,
        userInfo: 1
      })
      .limit(200)
      .end()
  ])

  const team = teamRes.data || {}
  const members = (membersRes.list || []).map(item => {
    const user = Array.isArray(item.userInfo) && item.userInfo.length > 0 ? item.userInfo[0] : {}
    return {
      userId: item.userId,
      role: item.role || 'member',
      nickName: user.nickName || '神秘用户',
      avatarUrl: user.avatarUrl || '',
      settings: user.settings || {}
    }
  })

  return { team, members }
}

async function getMyStepSummary(userId) {
  const user = await getUserByOpenId(userId)
  if (!user) {
    return { code: 404, msg: '用户不存在' }
  }

  const today = getTodayDateStr()
  const weekDateList = getWeekDateList(getWeekStartDate())
  const recordsRes = await db.collection('user_steps_daily').aggregate()
    .match({
      _openid: userId,
      date: _.in(weekDateList)
    })
    .limit(100)
    .end()

  const records = recordsRes.list || []
  const todayRecord = records.find(item => item.date === today)
  const recordMap = {}
  records.forEach(item => {
    recordMap[item.date] = Number(item.stepCount) || 0
  })

  let streakDays = 0
  const cursor = new Date()
  while (true) {
    const key = formatDate(cursor)
    if ((recordMap[key] || 0) >= DAILY_STEP_GOAL) {
      streakDays += 1
      cursor.setDate(cursor.getDate() - 1)
    } else {
      break
    }
  }

  return {
    code: 200,
    data: {
      todayStep: todayRecord ? Number(todayRecord.stepCount) || 0 : 0,
      weekTotal: sumSteps(records),
      streakDays,
      dailyGoal: DAILY_STEP_GOAL,
      settings: user.settings || {}
    }
  }
}

async function syncMySteps(userId, event) {
  const user = await getUserByOpenId(userId)
  if (!user) {
    return { code: 404, msg: '用户不存在' }
  }

  const { weRunData } = event
  if (!weRunData || weRunData.errCode) {
    return { code: 400, msg: '微信运动数据获取失败，请稍后重试' }
  }

  const stepInfoList = (weRunData.data && weRunData.data.stepInfoList) || []
  if (!stepInfoList.length) {
    return { code: 400, msg: '未获取到有效步数数据' }
  }

  const visibleToTeam = (user.settings || {}).stepPrivacy !== 'hidden'
  const now = new Date()
  const dateList = stepInfoList.map(item => formatTimestampDate(item.timestamp)).filter(Boolean)
  const existingRes = await db.collection('user_steps_daily').aggregate()
    .match({
      _openid: userId,
      date: _.in(dateList)
    })
    .limit(100)
    .end()

  const existingMap = {}
  ;(existingRes.list || []).forEach(item => {
    existingMap[item.date] = item
  })

  for (const item of stepInfoList) {
    const date = formatTimestampDate(item.timestamp)
    if (!date) continue

    const payload = {
      date,
      stepCount: Number(item.step) || 0,
      source: 'wechat',
      isVisibleToTeam: visibleToTeam,
      syncDate: now,
      updatedAt: now
    }

    if (existingMap[date] && existingMap[date]._id) {
      await db.collection('user_steps_daily').doc(existingMap[date]._id).update({
        data: payload
      })
    } else {
      await db.collection('user_steps_daily').add({
        data: {
          _openid: userId,
          createdAt: now,
          ...payload
        }
      })
    }
  }

  const settings = await updateUserSettings(userId, {
    stepEnabled: true,
    lastStepSyncAt: now
  })

  const summary = await getMyStepSummary(userId)
  return {
    code: 200,
    data: {
      syncedDays: dateList.length,
      todayStep: summary.data.todayStep,
      weekTotal: summary.data.weekTotal,
      streakDays: summary.data.streakDays,
      lastStepSyncAt: settings ? settings.lastStepSyncAt : now
    },
    msg: '同步成功'
  }
}

async function getTeamStepStats(userId, { teamId, weekStart }) {
  const isMember = await ensureTeamMember(teamId, userId)
  if (!isMember) {
    return { code: 403, msg: '你不在该团队中' }
  }

  const { team, members } = await getTeamWithMembers(teamId)
  const memberIds = members.map(item => item.userId)
  if (!memberIds.length) {
    return {
      code: 200,
      data: {
        weekStart: weekStart || formatDate(getWeekStartDate()),
        weeklyGoal: DEFAULT_WEEKLY_GOAL,
        completionRate: 0,
        totalSteps: 0,
        participantCount: 0,
        memberCount: 0,
        goalType: 'total',
        enabled: team.stepChallengeEnabled !== false
      }
    }
  }

  const weekStartDate = weekStart || formatDate(getWeekStartDate())
  const weekDateList = getWeekDateList(weekStartDate)
  const recordsRes = await db.collection('user_steps_daily').aggregate()
    .match({
      _openid: _.in(memberIds),
      date: _.in(weekDateList),
      isVisibleToTeam: true
    })
    .limit(2000)
    .end()

  const records = recordsRes.list || []
  const participantSet = new Set()
  records.forEach(item => {
    if ((Number(item.stepCount) || 0) > 0) {
      participantSet.add(item._openid)
    }
  })

  const totalSteps = sumSteps(records)
  const weeklyGoal = Number(team.stepWeeklyGoal) > 0 ? Number(team.stepWeeklyGoal) : DEFAULT_WEEKLY_GOAL
  const completionRate = weeklyGoal > 0 ? Math.min(totalSteps / weeklyGoal, 9.99) : 0

  return {
    code: 200,
    data: {
      weekStart: weekStartDate,
      weeklyGoal,
      goalType: team.stepGoalType || 'total',
      enabled: team.stepChallengeEnabled !== false,
      totalSteps,
      participantCount: participantSet.size,
      memberCount: members.length,
      completionRate
    }
  }
}

async function getTeamStepLeaderboard(userId, { teamId, mode = 'week', weekStart, date }) {
  const isMember = await ensureTeamMember(teamId, userId)
  if (!isMember) {
    return { code: 403, msg: '你不在该团队中' }
  }

  const { members } = await getTeamWithMembers(teamId)
  const memberIds = members.map(item => item.userId)
  if (!memberIds.length) {
    return { code: 200, data: { mode, list: [] } }
  }

  let dateList = []
  if (mode === 'day') {
    dateList = [date || getTodayDateStr()]
  } else {
    dateList = getWeekDateList(weekStart || formatDate(getWeekStartDate()))
  }

  const recordsRes = await db.collection('user_steps_daily').aggregate()
    .match({
      _openid: _.in(memberIds),
      date: _.in(dateList),
      isVisibleToTeam: true
    })
    .limit(2000)
    .end()

  const records = recordsRes.list || []
  const scoreMap = {}
  records.forEach(item => {
    scoreMap[item._openid] = (scoreMap[item._openid] || 0) + (Number(item.stepCount) || 0)
  })

  const threshold = mode === 'day' ? DAILY_STEP_GOAL : DAILY_STEP_GOAL * 5
  const list = members
    .map(member => {
      const score = scoreMap[member.userId] || 0
      const privacy = member.settings.stepPrivacy || 'full'
      if (privacy === 'hidden' || score <= 0) {
        return null
      }

      return {
        userId: member.userId,
        name: member.nickName,
        avatar: member.avatarUrl,
        score,
        displayStepCount: privacy === 'full' ? score : null,
        displayText: privacy === 'full'
          ? `${score} 步`
          : score >= threshold ? '已达标' : '进行中',
        privacy,
        isMe: member.userId === userId
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .map((item, index) => ({
      rank: index + 1,
      userId: item.userId,
      name: item.name,
      avatar: item.avatar,
      stepCount: item.displayStepCount,
      displayText: item.displayText,
      isMe: item.isMe
    }))

  return {
    code: 200,
    data: {
      mode,
      date: mode === 'day' ? dateList[0] : null,
      weekStart: mode === 'week' ? dateList[0] : null,
      list
    }
  }
}

async function updateMyStepSettings(userId, { stepEnabled, stepAutoSync, stepPrivacy }) {
  const nextSettings = {}
  if (typeof stepEnabled === 'boolean') nextSettings.stepEnabled = stepEnabled
  if (typeof stepAutoSync === 'boolean') nextSettings.stepAutoSync = stepAutoSync
  if (typeof stepPrivacy === 'string') nextSettings.stepPrivacy = stepPrivacy

  const settings = await updateUserSettings(userId, nextSettings)
  if (!settings) {
    return { code: 404, msg: '用户不存在' }
  }

  if (typeof stepPrivacy === 'string') {
    await db.collection('user_steps_daily').where({
      _openid: userId
    }).update({
      data: {
        isVisibleToTeam: stepPrivacy !== 'hidden',
        updatedAt: db.serverDate()
      }
    })
  }

  return {
    code: 200,
    data: {
      settings
    },
    msg: '设置更新成功'
  }
}

async function updateTeamStepChallenge(userId, { teamId, stepChallengeEnabled, stepWeeklyGoal, stepGoalType }) {
  const adminCheck = await db.collection('team_members').where({
    teamId,
    userId,
    role: 'admin'
  }).count()

  if (adminCheck.total === 0) {
    return { code: 403, msg: '只有管理员可以修改团队步数挑战' }
  }

  const updateData = {
    updatedAt: db.serverDate()
  }

  if (typeof stepChallengeEnabled === 'boolean') {
    updateData.stepChallengeEnabled = stepChallengeEnabled
  }
  if (Number(stepWeeklyGoal) > 0) {
    updateData.stepWeeklyGoal = Number(stepWeeklyGoal)
  }
  if (typeof stepGoalType === 'string') {
    updateData.stepGoalType = stepGoalType
  }

  await db.collection('teams').doc(teamId).update({
    data: updateData
  })

  const team = await db.collection('teams').doc(teamId).get()
  return {
    code: 200,
    data: {
      stepChallengeEnabled: team.data.stepChallengeEnabled !== false,
      stepWeeklyGoal: Number(team.data.stepWeeklyGoal) > 0 ? Number(team.data.stepWeeklyGoal) : DEFAULT_WEEKLY_GOAL,
      stepGoalType: team.data.stepGoalType || 'total'
    },
    msg: '团队步数挑战已更新'
  }
}

exports.main = async (event) => {
  const { action, payload = {} } = event
  const wxContext = cloud.getWXContext()
  const userId = wxContext.OPENID

  try {
    switch (action) {
      case 'syncMySteps':
        return await syncMySteps(userId, event)
      case 'getMyStepSummary':
        return await getMyStepSummary(userId)
      case 'getTeamStepStats':
        return await getTeamStepStats(userId, payload)
      case 'getTeamStepLeaderboard':
        return await getTeamStepLeaderboard(userId, payload)
      case 'updateMyStepSettings':
        return await updateMyStepSettings(userId, payload)
      case 'updateTeamStepChallenge':
        return await updateTeamStepChallenge(userId, payload)
      default:
        return { code: 400, msg: 'Unknown action' }
    }
  } catch (error) {
    console.error('[step-api] error:', action, error)
    return {
      code: 500,
      msg: error.message || '步数服务异常',
      error
    }
  }
}
