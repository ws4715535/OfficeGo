import { useCallback, useEffect, useState } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { View, Text, Button, Image } from '@tarojs/components'
import { getMyTeams } from '../../services/team'
import { getMyStepSummary, getTeamStepLeaderboard, syncMySteps, updateMyStepSettings } from '../../services/steps'
import './index.scss'

const formatToday = () => {
  const date = new Date()
  const month = date.getMonth() + 1
  const day = date.getDate()
  return `${month}月${day}日`
}

const getCurrentTeam = (teams = []) => {
  if (!teams.length) return null

  const lastTeamId = Taro.getStorageSync('last_team_id')
  if (lastTeamId) {
    const matched = teams.find(item => item.teamId === lastTeamId)
    if (matched) return matched
  }

  return teams[0]
}

const formatSyncTime = (value) => {
  if (!value) return '还没同步过'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '还没同步过'

  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `最近同步 ${hours}:${minutes}`
}

export default function ChallengePage() {
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [currentTeam, setCurrentTeam] = useState(null)
  const [leaderboard, setLeaderboard] = useState([])
  const [stepEnabled, setStepEnabled] = useState(false)
  const [hasPermission, setHasPermission] = useState(false)
  const [summary, setSummary] = useState({
    todayStep: 0,
    dailyGoal: 8000,
    lastStepSyncAt: null
  })

  const loadLeaderboard = useCallback(async (teamId) => {
    const result = await getTeamStepLeaderboard(teamId, 'day')
    setLeaderboard(result.list || [])
  }, [])

  const loadPage = useCallback(async ({ withSync = false } = {}) => {
    setLoading(true)

    try {
      const [teams, stepSummary, settingRes] = await Promise.all([
        getMyTeams(),
        getMyStepSummary(),
        Taro.getSetting()
      ])

      const team = getCurrentTeam(teams || [])
      const granted = Boolean(settingRes.authSetting['scope.werun'])
      const enabled = Boolean(stepSummary?.settings?.stepEnabled)

      setCurrentTeam(team)
      setHasPermission(granted)
      setStepEnabled(enabled)
      setSummary({
        todayStep: stepSummary?.todayStep || 0,
        dailyGoal: stepSummary?.dailyGoal || 8000,
        lastStepSyncAt: stepSummary?.settings?.lastStepSyncAt || null
      })

      if (!team) {
        setLeaderboard([])
        return
      }

      if (withSync && granted && enabled) {
        const syncRes = await syncMySteps()
        setSummary(prev => ({
          ...prev,
          todayStep: syncRes.todayStep || 0,
          lastStepSyncAt: syncRes.lastStepSyncAt || new Date().toISOString()
        }))
      }

      await loadLeaderboard(team.teamId)
    } catch (error) {
      console.error('Load challenge page failed', error)
      Taro.showToast({ title: error.message || '加载失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }, [loadLeaderboard])

  const requestWeRunAuth = useCallback(async () => {
    const settingRes = await Taro.getSetting()
    if (settingRes.authSetting['scope.werun']) {
      setHasPermission(true)
      return true
    }

    try {
      await Taro.authorize({ scope: 'scope.werun' })
      setHasPermission(true)
      return true
    } catch (error) {
      const modalRes = await Taro.showModal({
        title: '开启微信运动权限',
        content: '开启后才能自动同步你的步数，并参与今日团队排行。',
        confirmText: '去设置'
      })

      if (!modalRes.confirm) {
        return false
      }

      const openRes = await Taro.openSetting()
      const granted = Boolean(openRes.authSetting['scope.werun'])
      setHasPermission(granted)
      return granted
    }
  }, [])

  const enableAndSync = useCallback(async (silent = false) => {
    if (syncing) return

    try {
      setSyncing(true)

      const granted = await requestWeRunAuth()
      if (!granted) return

      await updateMyStepSettings({
        stepEnabled: true,
        stepAutoSync: true
      })

      setStepEnabled(true)

      const result = await syncMySteps()
      setSummary(prev => ({
        ...prev,
        todayStep: result.todayStep || 0,
        lastStepSyncAt: result.lastStepSyncAt || new Date().toISOString()
      }))

      if (currentTeam?.teamId) {
        await loadLeaderboard(currentTeam.teamId)
      }

      const localUser = Taro.getStorageSync('userInfo') || {}
      Taro.setStorageSync('userInfo', {
        ...localUser,
        settings: {
          ...(localUser.settings || {}),
          stepEnabled: true,
          stepAutoSync: true,
          lastStepSyncAt: result.lastStepSyncAt || new Date().toISOString()
        }
      })

      if (!silent) {
        Taro.showToast({ title: '同步成功', icon: 'success' })
      }
    } catch (error) {
      console.error('Sync challenge steps failed', error)
      if (!silent) {
        Taro.showToast({ title: error.message || '同步失败', icon: 'none' })
      }
    } finally {
      setSyncing(false)
    }
  }, [currentTeam?.teamId, loadLeaderboard, requestWeRunAuth, syncing])

  useDidShow(() => {
    loadPage({ withSync: true })
  })

  useEffect(() => {
    const promptForPermission = async () => {
      try {
        const settingRes = await Taro.getSetting()
        const granted = Boolean(settingRes.authSetting['scope.werun'])
        setHasPermission(granted)

        if (!granted) {
          await Taro.showModal({
            title: '开启微信运动权限',
            content: '开启后可自动同步步数，并参与团队今日排行。',
            showCancel: false,
            confirmText: '知道了'
          })
        }
      } catch (error) {
        console.error('Check werun permission failed', error)
      }
    }

    promptForPermission()
  }, [])

  const myRank = leaderboard.find(item => item.isMe)
  const leader = leaderboard[0]
  const leaderStepCount = Number(leader?.stepCount) || 0
  const myStepCount = Number(myRank?.stepCount) || summary.todayStep || 0
  const gapToLeader = myRank ? Math.max(leaderStepCount - myStepCount, 0) : leaderStepCount
  const topThree = leaderboard.slice(0, 3)

  return (
    <View className='challenge-page'>
      <View className='hero-card'>
        <View className='hero-copy'>
          <Text className='hero-team-name'>{currentTeam?.name || '团队'}</Text>
          <Text className='hero-title'>今日步数排行</Text>
          <Text className='hero-subtitle'>{formatToday()}，走一点也算今天赢一点</Text>
        </View>
        <View className='hero-pills'>
          <Text className='hero-pill'>{leaderboard.length} 人参与</Text>
        </View>
        <View className='hero-footer'>
          <Text className='hero-footer-text'>{formatSyncTime(summary.lastStepSyncAt)}</Text>
          <Button className='sync-btn' onClick={() => enableAndSync(false)} loading={syncing}>
            {syncing ? '同步中' : '刷新步数'}
          </Button>
        </View>
      </View>

      {!currentTeam ? (
        <View className='empty-card'>
          <Text className='empty-title'>你还没有加入团队</Text>
          <Text className='empty-desc'>先加入一个团队，大家的今日排行才会出现。</Text>
          <Button className='primary-btn' onClick={() => Taro.switchTab({ url: '/pages/team/index' })}>
            去团队页
          </Button>
        </View>
      ) : (
        <>
          {(!hasPermission || !stepEnabled) && (
            <View className='permission-card'>
              <Text className='card-title'>先开启微信运动权限</Text>
              <Text className='card-desc'>开启后会自动同步你的步数，并参与团队今日排行。</Text>
              <Button className='primary-btn' onClick={() => enableAndSync(false)} loading={syncing}>
                {syncing ? '开启中...' : '开启并同步'}
              </Button>
            </View>
          )}

          <View className='summary-card'>
            <View className='summary-item'>
              <Text className='summary-value'>{summary.todayStep}</Text>
              <Text className='summary-label'>我的今日步数</Text>
            </View>
            <View className='summary-item'>
              <Text className='summary-value'>{myRank?.rank ? `#${myRank.rank}` : '--'}</Text>
              <Text className='summary-label'>我的当前排名</Text>
            </View>
            <View className='summary-item'>
              <Text className='summary-value'>{leader ? `${gapToLeader}` : '--'}</Text>
              <Text className='summary-label'>{myRank ? '距离榜首' : '榜首步数'}</Text>
            </View>
          </View>

          {topThree.length > 0 && (
            <View className='highlight-card'>
              <View className='card-header'>
                <Text className='card-title'>今日领跑</Text>
                <Text className='card-note'>前 3 名冲刺中</Text>
              </View>
              <View className='top-list'>
                {topThree.map(item => (
                  <View key={item.userId} className={`top-item top-${item.rank}`}>
                    <Text className='top-rank'>{item.rank === 1 ? '🥇' : item.rank === 2 ? '🥈' : '🥉'}</Text>
                    <Image
                      className='top-avatar'
                      src={item.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${item.name}`}
                    />
                    <Text className='top-name'>{item.name}</Text>
                    <Text className='top-step'>{item.displayText || `${item.stepCount || 0} 步`}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <View className='ranking-card'>
            <View className='ranking-header'>
              <Text className='card-title'>今日排行榜</Text>
              <Text className='card-note'>{loading ? '加载中...' : `共 ${leaderboard.length} 人上榜`}</Text>
            </View>

            {leaderboard.length > 0 ? (
              leaderboard.map(item => (
                <View key={item.userId} className={`rank-item ${item.isMe ? 'is-me' : ''} ${item.rank <= 3 ? `top-${item.rank}` : ''}`}>
                  <View className='rank-left'>
                    <Text className='rank-index'>{item.rank === 1 ? '🥇' : item.rank === 2 ? '🥈' : item.rank === 3 ? '🥉' : `#${item.rank}`}</Text>
                    <Image
                      className='rank-avatar'
                      src={item.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${item.name}`}
                    />
                    <View className='rank-meta'>
                      <View className='rank-name-row'>
                        <Text className='rank-name'>{item.name}</Text>
                        {item.isMe && <Text className='rank-me-tag'>我</Text>}
                      </View>
                      <Text className='rank-subtext'>{item.rank === 1 ? '暂时领跑' : `距离榜首 ${Math.max(leaderStepCount - (Number(item.stepCount) || 0), 0)} 步`}</Text>
                    </View>
                  </View>
                  <Text className='rank-value'>{item.displayText || `${item.stepCount || 0} 步`}</Text>
                </View>
              ))
            ) : (
              <View className='empty-ranking'>
                <Text className='empty-title'>今天还没人上榜</Text>
                <Text className='empty-desc'>你可以先走两步，给 team 开个好头。</Text>
              </View>
            )}
          </View>
        </>
      )}
    </View>
  )
}
