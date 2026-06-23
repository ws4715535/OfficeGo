import Taro from '@tarojs/taro'

const callStepApi = async (action, payload = {}) => {
  const res = await Taro.cloud.callFunction({
    name: 'step-api',
    data: { action, payload }
  })

  if (res.result.code === 200) {
    return res.result.data
  }

  throw new Error(res.result.msg || '步数服务调用失败')
}

export const syncMySteps = async () => {
  const weRunRes = await Taro.getWeRunData()
  if (!weRunRes.cloudID) {
    throw new Error('当前环境未返回微信运动 cloudID')
  }

  const res = await Taro.cloud.callFunction({
    name: 'step-api',
    data: {
      action: 'syncMySteps',
      weRunData: Taro.cloud.CloudID(weRunRes.cloudID)
    }
  })

  if (res.result.code === 200) {
    return res.result.data
  }

  throw new Error(res.result.msg || '步数同步失败')
}

export const getMyStepSummary = () => callStepApi('getMyStepSummary')

export const getTeamStepStats = (teamId, weekStart) => callStepApi('getTeamStepStats', { teamId, weekStart })

export const getTeamStepLeaderboard = (teamId, mode = 'week', options = {}) =>
  callStepApi('getTeamStepLeaderboard', { teamId, mode, ...options })

export const updateMyStepSettings = (payload) => callStepApi('updateMyStepSettings', payload)

export const updateTeamStepChallenge = (payload) => callStepApi('updateTeamStepChallenge', payload)
