import { useState, useCallback, useRef, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { 
  getMyTeams, 
  getTeamDetail, 
  getTeamStats, 
  getDailyAttendance 
} from '../services/team'
import AuthService from '../services/auth'

// 工具函数：获取周的开始日期（周日）
const getStartOfWeek = (date) => {
  const d = new Date(date)
  const day = d.getDay() // 0 is Sunday
  const diff = d.getDate() - day
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

// 工具函数：获取日期在周中的索引（0=周日, 1=周一...）
const getDayIndex = (date) => {
  return new Date(date).getDay()
}

// 工具函数：解析 YYYY-MM-DD 为本地 Date（避免 new Date('YYYY-MM-DD') 的 UTC 解析差异）
const parseLocalDate = (dateStr) => {
  if (!dateStr) return null
  const [y, m, d] = dateStr.split('-').map(n => Number(n))
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d, 0, 0, 0, 0)
}

// 工具函数：格式化日期为 YYYY-MM-DD
const formatDateStr = (date) => {
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// 工具函数：获取今天的日期字符串
const getTodayDateStr = () => {
  return formatDateStr(new Date())
}

// 工具函数：获取周参考日期字符串（用于 getTeamStats）
const getWeekRefDateStr = (weekStart) => {
  return formatDateStr(weekStart || getStartOfWeek(new Date()))
}

// 工具函数：格式化成员列表
const formatMembers = (memberList) => {
  const getStatusText = (status) => {
    switch(status) {
      case 'office': return '来了'
      case 'remote': return '远程'
      case 'leave': return '请假'
      default: return '未知'
    }
  }

  const getTagText = (status) => {
    switch(status) {
      case 'office': return 'Office'
      case 'remote': return 'Remote'
      case 'leave': return 'Leave'
      default: return 'office'
    }
  }

  return memberList.map(m => ({
    id: m.userId,
    name: m.name,
    avatar: m.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${m.name}`,
    status: (m.status || 'unknown').toUpperCase(),
    statusText: getStatusText(m.status),
    tagText: getTagText(m.status),
    isMe: m.isMe,
    isOnline: true
  }))
}

// 工具函数：格式化最佳工作日信息
const formatBestDay = (bestDay) => {
  if (bestDay && bestDay.count > 0) {
    return {
      dayName: bestDay.dayName,
      count: bestDay.count,
      desc: `本周${bestDay.dayName}最热闹，有${bestDay.count}位小伙伴在办公室, 线下活动约起来！`
    }
  }
  return { 
    dayName: '暂无数据', 
    count: 0, 
    desc: '大家似乎都很喜欢远程办公呢' 
  }
}

// 工具函数：把后端状态统一成小写字符串
const normalizeStatus = (s) => {
  if (s === undefined || s === null) return null
  const v = String(s).toLowerCase()
  return v === 'null' ? null : v
}

// 工具函数：构造“我”的成员展示对象（用于本地增量更新）
const buildMeMember = (status) => {
  const userInfo = Taro.getStorageSync('userInfo') || {}
  const userId = Taro.getStorageSync('userId') || userInfo._openid || userInfo.openid
  const name = userInfo.nickName || '我'
  const avatar = userInfo.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`

  const getStatusText = (st) => {
    switch (st) {
      case 'office': return '来了'
      case 'remote': return '远程'
      case 'leave': return '请假'
      default: return '未知'
    }
  }

  const getTagText = (st) => {
    switch (st) {
      case 'office': return 'Office'
      case 'remote': return 'Remote'
      case 'leave': return 'Leave'
      default: return 'office'
    }
  }

  return {
    id: userId || 'me',
    name,
    avatar,
    status: (status || 'unknown').toUpperCase(),
    statusText: getStatusText(status),
    tagText: getTagText(status),
    isMe: true,
    isOnline: true
  }
}

// 工具函数：获取缓存键
const getCacheKey = (userId, teamId) => {
  return userId && teamId ? `team_detail_${userId}_${teamId}` : null
}

// 工具函数：获取缓存数据
const getCachedTeamData = (userId, teamId) => {
  const cacheKey = getCacheKey(userId, teamId)
  if (!cacheKey) return null
  
  const cached = Taro.getStorageSync(cacheKey)
  if (cached && cached.teamId) {
    return cached
  }
  return null
}

// 工具函数：更新缓存
const updateCache = (userId, teamId, baseInfo, members) => {
  const cacheKey = getCacheKey(userId, teamId)
  if (!cacheKey) return
  
  Taro.setStorageSync(cacheKey, {
    teamId,
    baseInfo,
    members,
    cachedAt: Date.now()
  })
}

// 工具函数：清除缓存
const clearCache = (userId, teamId) => {
  const cacheKey = getCacheKey(userId, teamId)
  if (cacheKey) {
    Taro.removeStorageSync(cacheKey)
  }
}

// 工具函数：获取目标团队（优先使用上次选择的团队）
const getTargetTeam = (teams, lastTeamId) => {
  if (!teams || teams.length === 0) return null
  
  if (lastTeamId) {
    const lastTeam = teams.find(t => t.teamId === lastTeamId)
    if (lastTeam) return lastTeam
  }
  
  return teams[0]
}

/**
 * useTeam Hook - 统一管理团队数据获取逻辑
 */
export const useTeam = () => {
  // 统一状态管理
  const [state, setState] = useState({
    viewState: 'loading', // 'loading' | 'empty' | 'active'
    currentTeam: null,
    myTeams: [],
    members: [],
    weeklyStats: [],
    bestDayInfo: { dayName: '加载中...', count: 0, desc: '正在获取数据' },
    topWorker: null,
    selectedDay: getDayIndex(new Date()),
    currentWeekStart: getStartOfWeek(new Date()),
  })

  // Loading 状态
  const [loading, setLoading] = useState({
    teams: false,
    detail: false,
    stats: false,
    members: false,
  })

  // 请求去重：追踪正在进行的请求
  const pendingRequests = useRef(new Set())
  
  // 已加载标记（避免重复初始化）
  const isInitialized = useRef(false)
  
  // 最后加载的团队ID（避免重复加载）
  const lastLoadedTeamId = useRef(null)
  
  // 保存最新的 state，避免闭包陷阱
  const stateRef = useRef(state)

  /**
   * 请求去重包装器
   */
  const requestWithDedup = useCallback(async (requestKey, fetcher) => {
    // 如果已有相同请求在进行，直接返回
    if (pendingRequests.current.has(requestKey)) {
      console.log(`[useTeam] Request ${requestKey} already pending, skipping`)
      return null
    }

    pendingRequests.current.add(requestKey)
    try {
      const result = await fetcher()
      return result
    } catch (error) {
      console.error(`[useTeam] Request ${requestKey} failed:`, error)
      throw error
    } finally {
      pendingRequests.current.delete(requestKey)
    }
  }, [])

  /**
   * 加载团队列表
   */
  const loadTeams = useCallback(async () => {
    const requestKey = 'getMyTeams'
    
    return requestWithDedup(requestKey, async () => {
      setLoading(prev => ({ ...prev, teams: true }))
      try {
        const teams = await getMyTeams()
        setState(prev => ({ ...prev, myTeams: teams }))
        return teams
      } finally {
        setLoading(prev => ({ ...prev, teams: false }))
      }
    })
  }, [requestWithDedup])

  /**
   * 加载团队详情（并行请求优化）
   */
  const loadTeamDetail = useCallback(async (teamId, options = {}) => {
    const { 
      silent = false, 
      refDate = null,
      skipMembers = false 
    } = options

    // 如果团队ID没变，且不是强制刷新，跳过
    if (!silent && lastLoadedTeamId.current === teamId) {
      console.log(`[useTeam] Team ${teamId} already loaded, skipping`)
      return
    }

    const weekRefDate = refDate || getWeekRefDateStr(state.currentWeekStart)
    const todayStr = getTodayDateStr()
    
    // 构建请求键（用于去重）
    const baseRequestKey = `teamDetail_${teamId}`
    const statsRequestKey = `${baseRequestKey}_stats_${weekRefDate}`
    const membersRequestKey = `${baseRequestKey}_members_${todayStr}`

    // 并行请求：基础信息 + 统计数据 + 今日考勤
    const requests = []
    
    // 1. 基础信息（总是需要）
    requests.push(
      requestWithDedup(baseRequestKey, async () => {
        if (!silent) setLoading(prev => ({ ...prev, detail: true }))
        try {
          const baseRes = await getTeamDetail(teamId)
          return { type: 'base', data: baseRes }
        } finally {
          if (!silent) setLoading(prev => ({ ...prev, detail: false }))
        }
      })
    )

    // 2. 统计数据（总是需要）
    requests.push(
      requestWithDedup(statsRequestKey, async () => {
        if (!silent) setLoading(prev => ({ ...prev, stats: true }))
        try {
          const statsRes = await getTeamStats(teamId, 'week', weekRefDate)
          return { type: 'stats', data: statsRes }
        } finally {
          if (!silent) setLoading(prev => ({ ...prev, stats: false }))
        }
      })
    )

    // 3. 今日考勤（如果不需要跳过）
    if (!skipMembers) {
      requests.push(
        requestWithDedup(membersRequestKey, async () => {
          if (!silent) setLoading(prev => ({ ...prev, members: true }))
          try {
            const attendanceRes = await getDailyAttendance(teamId, todayStr)
            return { type: 'members', data: attendanceRes }
          } finally {
            if (!silent) setLoading(prev => ({ ...prev, members: false }))
          }
        })
      )
    }

    // 等待所有请求完成
    const results = await Promise.all(requests.filter(r => r !== null))
    
    // 处理结果
    let baseRes = null
    let statsRes = null
    let attendanceRes = null

    results.forEach(result => {
      if (!result) return
      if (result.type === 'base') baseRes = result.data
      if (result.type === 'stats') statsRes = result.data
      if (result.type === 'members') attendanceRes = result.data
    })

    // 更新状态
    if (baseRes) {
      setState(prev => ({
        ...prev,
        currentTeam: { teamId, name: baseRes.baseInfo.name },
        viewState: 'active',
      }))

      // 更新缓存 (使用 baseRes 中的 members，这才是完整的成员列表)
      const userId = Taro.getStorageSync('userId')
      if (userId && baseRes.baseInfo) {
        updateCache(userId, teamId, baseRes.baseInfo, baseRes.members || [])
      }
    }

    if (statsRes) {
      setState(prev => ({
        ...prev,
        weeklyStats: statsRes.trend || [],
        bestDayInfo: formatBestDay(statsRes.bestDay),
        topWorker: statsRes.topWorker,
      }))
    }

    if (attendanceRes) {
      setState(prev => ({
        ...prev,
        members: formatMembers(attendanceRes.members || []),
      }))
    }

    // 更新标记
    lastLoadedTeamId.current = teamId
    Taro.setStorageSync('last_team_id', teamId)

    return { baseRes, statsRes, attendanceRes }
  }, [state.currentWeekStart, requestWithDedup])

  /**
   * 初始化加载
   */
  const initialize = useCallback(async () => {
    // 检查登录状态
    const userId = AuthService.getUserId()
    if (!userId) {
      Taro.reLaunch({ url: '/pages/onboarding/index' })
      return
    }

    // 如果已初始化，跳过
    if (isInitialized.current) {
      console.log('[useTeam] Already initialized, skipping')
      return
    }

    isInitialized.current = true

    // 尝试从缓存恢复
    const lastTeamId = Taro.getStorageSync('last_team_id')
    const cached = getCachedTeamData(userId, lastTeamId)

    if (cached) {
      console.log('[useTeam] Restoring from cache:', cached.teamId)
      // 恢复基础状态
      setState(prev => ({
        ...prev,
        viewState: 'active',
        currentTeam: { teamId: cached.teamId, name: cached.baseInfo?.name || 'My Team' },
        members: formatMembers(cached.members || []),
        currentWeekStart: getStartOfWeek(new Date()),
        selectedDay: getDayIndex(new Date()),
      }))
      lastLoadedTeamId.current = cached.teamId
    }

    // 加载团队列表
    const teams = await loadTeams()
    
    if (!teams || teams.length === 0) {
      setState(prev => ({ ...prev, viewState: 'empty' }))
      return
    }

    // 确定目标团队
    const targetTeam = getTargetTeam(teams, lastTeamId)
    if (!targetTeam) {
      setState(prev => ({ ...prev, viewState: 'empty' }))
      return
    }

    // 如果有缓存且团队ID匹配，静默刷新统计数据
    if (cached && cached.teamId === targetTeam.teamId) {
      await loadTeamDetail(targetTeam.teamId, { silent: true, skipMembers: true })
      // 单独刷新今日考勤
      const todayStr = getTodayDateStr()
      const membersRequestKey = `teamDetail_${targetTeam.teamId}_members_${todayStr}`
      requestWithDedup(membersRequestKey, async () => {
        try {
          const attendanceRes = await getDailyAttendance(targetTeam.teamId, todayStr)
          setState(prev => ({
            ...prev,
            members: formatMembers(attendanceRes.members || []),
          }))
        } catch (err) {
          console.error('[useTeam] Failed to refresh members:', err)
        }
      })
    } else {
      // 无缓存或团队不匹配，完整加载
      await loadTeamDetail(targetTeam.teamId, { silent: false })
    }
  }, [loadTeams, loadTeamDetail, requestWithDedup])

  /**
   * 刷新数据
   */
  const refresh = useCallback(async (type = 'full') => {
    if (type === 'full') {
      // 全量刷新：清除缓存和标记
      const userId = Taro.getStorageSync('userId')
      if (state.currentTeam) {
        clearCache(userId, state.currentTeam.teamId)
      }
      lastLoadedTeamId.current = null
      isInitialized.current = false
      
      // 重置状态
      setState(prev => ({
        ...prev,
        viewState: 'loading',
        selectedDay: getDayIndex(new Date()),
        currentWeekStart: getStartOfWeek(new Date()),
      }))
      
      // 重新初始化
      await initialize()
    } else if (type === 'stats') {
      // 只刷新统计数据
      if (state.currentTeam) {
        await loadTeamDetail(state.currentTeam.teamId, { 
          silent: true, 
          skipMembers: true 
        })
      }
    } else if (type === 'members') {
      // 只刷新成员列表
      if (state.currentTeam) {
        const selectedDate = new Date(state.currentWeekStart)
        selectedDate.setDate(selectedDate.getDate() + state.selectedDay)
        const dateStr = formatDateStr(selectedDate)
        
        const membersRequestKey = `teamDetail_${state.currentTeam.teamId}_members_${dateStr}`
        await requestWithDedup(membersRequestKey, async () => {
          setLoading(prev => ({ ...prev, members: true }))
          try {
            const attendanceRes = await getDailyAttendance(state.currentTeam.teamId, dateStr)
            setState(prev => ({
              ...prev,
              members: formatMembers(attendanceRes.members || []),
            }))
          } finally {
            setLoading(prev => ({ ...prev, members: false }))
          }
        })
      }
    }
  }, [state.currentTeam, state.currentWeekStart, state.selectedDay, initialize, loadTeamDetail, requestWithDedup])

  /**
   * 切换团队
   */
  const switchTeam = useCallback(async (teamId) => {
    // 重置状态
    setState(prev => ({
      ...prev,
      viewState: 'loading',
      members: [],
      weeklyStats: [],
      bestDayInfo: { dayName: '加载中...', count: 0, desc: '正在获取数据' },
      topWorker: null,
    }))
    
    // 清除旧团队的加载标记
    lastLoadedTeamId.current = null
    
    // 加载新团队
    await loadTeamDetail(teamId, { silent: false })
  }, [loadTeamDetail])

  /**
   * 切换日期
   */
  const changeDate = useCallback(async (dayIndex) => {
    if (dayIndex === state.selectedDay) return
    
    setState(prev => ({ ...prev, selectedDay: dayIndex }))
    
    if (!state.currentTeam) return

    const targetDate = new Date(state.currentWeekStart)
    targetDate.setDate(targetDate.getDate() + dayIndex)
    const dateStr = formatDateStr(targetDate)
    
    const membersRequestKey = `teamDetail_${state.currentTeam.teamId}_members_${dateStr}`
    await requestWithDedup(membersRequestKey, async () => {
      setLoading(prev => ({ ...prev, members: true }))
      try {
        const attendanceRes = await getDailyAttendance(state.currentTeam.teamId, dateStr)
        setState(prev => ({
          ...prev,
          members: formatMembers(attendanceRes.members || []),
        }))
      } finally {
        setLoading(prev => ({ ...prev, members: false }))
      }
    })
  }, [state.currentTeam, state.currentWeekStart, state.selectedDay, requestWithDedup])

  /**
   * 切换周
   */
  const changeWeek = useCallback(async (days) => {
    const newStart = new Date(state.currentWeekStart)
    newStart.setDate(newStart.getDate() + days)
    newStart.setHours(0, 0, 0, 0)
    
    // 默认选中周一
    const newSelectedDay = 1
    
    setState(prev => ({
      ...prev,
      currentWeekStart: newStart,
      selectedDay: newSelectedDay,
    }))

    if (!state.currentTeam) return

    // 并行加载：统计数据 + 选中日期的考勤
    const weekRefDateStr = getWeekRefDateStr(newStart)
    const targetDate = new Date(newStart)
    targetDate.setDate(targetDate.getDate() + newSelectedDay)
    const dateStr = formatDateStr(targetDate)

    const statsRequestKey = `teamDetail_${state.currentTeam.teamId}_stats_${weekRefDateStr}`
    const membersRequestKey = `teamDetail_${state.currentTeam.teamId}_members_${dateStr}`

    setLoading(prev => ({ ...prev, stats: true, members: true }))

    try {
      const [statsRes, attendanceRes] = await Promise.all([
        requestWithDedup(statsRequestKey, () => getTeamStats(state.currentTeam.teamId, 'week', weekRefDateStr)),
        requestWithDedup(membersRequestKey, () => getDailyAttendance(state.currentTeam.teamId, dateStr)),
      ])

      if (statsRes) {
        setState(prev => ({
          ...prev,
          weeklyStats: statsRes.trend || [],
          bestDayInfo: formatBestDay(statsRes.bestDay),
          topWorker: statsRes.topWorker,
        }))
      }

      if (attendanceRes) {
        setState(prev => ({
          ...prev,
          members: formatMembers(attendanceRes.members || []),
        }))
      }
    } finally {
      setLoading(prev => ({ ...prev, stats: false, members: false }))
    }
  }, [state.currentTeam, state.currentWeekStart, requestWithDedup])

  // 同步 stateRef，确保始终是最新的 state
  useEffect(() => {
    stateRef.current = state
  }, [state])

  /**
   * 监听考勤更新事件
   */
  useEffect(() => {
    const onAttendanceUpdate = (data) => {
      if (!data || !data.date) return
      
      // 从 ref 获取最新的 state，避免闭包陷阱
      const currentState = stateRef.current
      
      // 检查页面状态
      if (!currentState.currentTeam || currentState.viewState !== 'active') {
        return
      }

      // 如果页面不可见，标记为待刷新，暂不更新 State
      if (!isVisible.current) {
        console.log('[useTeam] Page hidden, deferring update')
        pendingRefresh.current = true
        return
      }
      
      const modifiedDate = data.date // YYYY-MM-DD
      const prevStatus = normalizeStatus(data.prevStatus)
      const nextStatus = normalizeStatus(
        data.nextStatus !== undefined ? data.nextStatus : data.status
      )
      console.log('[useTeam] Attendance updated:', modifiedDate, prevStatus, '->', nextStatus)

      // 计算当前选中的日期字符串
      const selectedDate = new Date(currentState.currentWeekStart)
      selectedDate.setDate(selectedDate.getDate() + currentState.selectedDay)
      const selectedDateStr = formatDateStr(selectedDate)

      let shouldRefreshStats = false
      let shouldRefreshMembers = false

      // 检查是否需要刷新统计数据（如果修改的日期在当前周）
      // 使用字符串比较，更简单可靠
      const weekStartStr = formatDateStr(currentState.currentWeekStart)
      const weekEndDate = new Date(currentState.currentWeekStart)
      weekEndDate.setDate(weekEndDate.getDate() + 6)
      const weekEndStr = formatDateStr(weekEndDate)
      
      // 字符串比较：YYYY-MM-DD 格式可以直接比较大小
      if (modifiedDate >= weekStartStr && modifiedDate <= weekEndStr) {
        shouldRefreshStats = true
        console.log('[useTeam] Modified date is in current week, will refresh stats')
      }
      
      // 检查是否需要刷新成员列表（如果修改的日期是当前选中的日期）
      if (modifiedDate === selectedDateStr) {
        shouldRefreshMembers = true
        console.log('[useTeam] Modified date matches selected date, will refresh members')
      }

      // 纯本地增量更新（不触发网络请求，不显示 loading，不改变选中/周范围）
      if (!shouldRefreshStats && !shouldRefreshMembers) {
        console.log('[useTeam] Modified date is not in current scope, skipping local update')
        return
      }

      setTimeout(() => {
        const latestState = stateRef.current
        if (!latestState.currentTeam || latestState.viewState !== 'active') return

        // 1) 更新趋势图（本周范围内：根据我自己的 prev/next 做 +1/-1）
        if (shouldRefreshStats && prevStatus !== nextStatus) {
          const weekStartLocal = latestState.currentWeekStart
          const modifiedLocal = parseLocalDate(modifiedDate)
          if (modifiedLocal && weekStartLocal) {
            const dayIndex = Math.floor((modifiedLocal.getTime() - weekStartLocal.getTime()) / 86400000)
            if (dayIndex >= 0 && dayIndex <= 6) {
              setState(prev => {
                const nextWeekly = Array.isArray(prev.weeklyStats) ? [...prev.weeklyStats] : []
                // 确保有 7 项
                for (let i = 0; i < 7; i++) {
                  if (!nextWeekly[i]) nextWeekly[i] = { officeCount: 0, totalCount: 0, ratio: 0 }
                }

                const curItem = nextWeekly[dayIndex] || { officeCount: 0, totalCount: 0, ratio: 0 }
                const totalCount = Number(curItem.totalCount || 0)
                let officeCount = Number(curItem.officeCount || 0)

                const wasOffice = prevStatus === 'office'
                const isOffice = nextStatus === 'office'
                if (wasOffice && !isOffice) officeCount -= 1
                if (!wasOffice && isOffice) officeCount += 1

                if (officeCount < 0) officeCount = 0
                if (totalCount > 0 && officeCount > totalCount) officeCount = totalCount

                const ratio = totalCount > 0 ? officeCount / totalCount : 0
                nextWeekly[dayIndex] = { ...curItem, officeCount, ratio }

                return { ...prev, weeklyStats: nextWeekly }
              })
            }
          }
        }

        // 2) 更新成员列表（仅当更新日期=当前选中日期）
        if (shouldRefreshMembers) {
          setState(prev => {
            const list = Array.isArray(prev.members) ? [...prev.members] : []
            const meIdx = list.findIndex(m => m && m.isMe)

            if (!nextStatus) {
              // 取消记录：移除“我”的条目（与后端 getDailyAttendance 的行为一致：没状态就不返回）
              if (meIdx >= 0) list.splice(meIdx, 1)
              return { ...prev, members: list }
            }

            const meMember = buildMeMember(nextStatus)
            if (meIdx >= 0) list[meIdx] = { ...list[meIdx], ...meMember }
            else list.unshift(meMember)
            return { ...prev, members: list }
          })
        }
      }, 0)
    }

    Taro.eventCenter.on('ATTENDANCE_UPDATED', onAttendanceUpdate)

    return () => {
      Taro.eventCenter.off('ATTENDANCE_UPDATED', onAttendanceUpdate)
    }
  }, [requestWithDedup]) // 只依赖 requestWithDedup，避免重复注册

  return {
    state,
    loading,
    initialize,
    refresh,
    switchTeam,
    changeDate,
    changeWeek,
  }
}
