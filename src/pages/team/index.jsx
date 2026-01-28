import React, { useState, useEffect, useCallback, useRef } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { View, Text, Button, Image, Input, Swiper, SwiperItem } from '@tarojs/components'
import { Skeleton, pxTransform, PullToRefresh } from '@nutui/nutui-react-taro'
import { getMyTeams, getDailyAttendance, getTeamDetail, getTeamStats, joinTeam, createTeam, getTeamByInviteCode } from '../../services/team'
import EmptyState from './empty/index'
import AuthService from '../../services/auth'
import downIcon from '../../assets/down.png'
import addIcon from '../../assets/add.png'
import settingIcon from '../../assets/setting.png'
import grassIcon from '../../assets/grass.png'
import leftIcon from '../../assets/left.png'
import rightIcon from '../../assets/right.png'
import './index.scss'

export default function Team() {
  const [viewState, setViewState] = useState('loading') // 'loading' | 'empty' | 'active'
  const [currentTeam, setCurrentTeam] = useState(null)
  const [myTeams, setMyTeams] = useState([])
  
  const getStartOfWeek = (date) => {
    const d = new Date(date)
    const day = d.getDay() // 0 is Sunday
    const diff = d.getDate() - day // Adjust to Sunday
    d.setDate(diff)
    d.setHours(0, 0, 0, 0) // Normalize time
    return d
  }
  
  const getDayIndex = (date) => {
    const day = date.getDay()
    return day // 0 (Sun) - 6 (Sat)
  }

  const [selectedDay, setSelectedDay] = useState(getDayIndex(new Date()))
  const [currentWeekStart, setCurrentWeekStart] = useState(getStartOfWeek(new Date()))
  const [members, setMembers] = useState([])
  const [weeklyStats, setWeeklyStats] = useState([])
  const [bestDayInfo, setBestDayInfo] = useState({ dayName: '暂无数据', count: 0, desc: '本周还没有足够的数据来预测黄金日' })
  const [topWorker, setTopWorker] = useState(null)
  const [membersLoading, setMembersLoading] = useState(false)
  const [weekStatsLoading, setWeekStatsLoading] = useState(false)
  const lastLoadedTeamId = useRef(null)
  
  // Modal States
  const [showJoinModal, setShowJoinModal] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [inviteCode, setInviteCode] = useState('') // Reverted to string
  const [newTeamName, setNewTeamName] = useState('')
  // Removed refs and focusIndex

  const todayIndex = getDayIndex(new Date())

  // 1. Initial Load (FSM Trigger)
  // Use a flag to ensure initial load happens only once per session
  const isLoaded = useRef(false)
  const modifiedDatesRef = useRef(new Set()) // Track modified dates from other pages

  // Listen for attendance updates from Calendar page
  useEffect(() => {
    const onAttendanceUpdate = (data) => {
        if (data && data.date) {
            console.log('Received attendance update:', data.date)
            modifiedDatesRef.current.add(data.date)
        }
    }
    Taro.eventCenter.on('ATTENDANCE_UPDATED', onAttendanceUpdate)
    return () => {
        Taro.eventCenter.off('ATTENDANCE_UPDATED', onAttendanceUpdate)
    }
  }, [])

  useDidShow(async () => {
    // Force refresh check on every show
    console.log('useDidShow triggered. Loaded:', isLoaded.current, 'Modified:', modifiedDatesRef.current, 'Team:', currentTeam?.teamId)

    // Check if we need to refresh based on modified dates
    if (isLoaded.current && modifiedDatesRef.current.size > 0 && currentTeam) {
        console.log('Checking modified dates:', modifiedDatesRef.current)
        
        // Calculate current week range
        const start = new Date(currentWeekStart)
        const end = new Date(start)
        end.setDate(end.getDate() + 6)
        
        // Check if any modified date is within current week range
        let shouldRefreshTrend = false
        let shouldRefreshMembers = false
        
        // Calculate current selected date string
        const selectedDateObj = new Date(currentWeekStart)
        selectedDateObj.setDate(selectedDateObj.getDate() + selectedDay)
        
        // Use local date string construction to match event date format
        const sy = selectedDateObj.getFullYear();
        const sm = String(selectedDateObj.getMonth() + 1).padStart(2, '0');
        const sd = String(selectedDateObj.getDate()).padStart(2, '0');
        const selectedDateStr = `${sy}-${sm}-${sd}`;
        
        console.log('Current selected date:', selectedDateStr)

        for (const dateStr of modifiedDatesRef.current) {
            // Check trend refresh (if in week range)
            const d = new Date(dateStr)
            // Reset time part for comparison
            d.setHours(0,0,0,0)
            
            if (d >= start && d <= end) {
                shouldRefreshTrend = true
            }
            
            // Check members refresh (if matches selected day)
            // Note: dateStr from event is usually YYYY-MM-DD
            console.log('Date matches selected date:', dateStr, selectedDateStr)
            if (dateStr === selectedDateStr) {
                shouldRefreshMembers = true
            }
        }
        
        // Clear modified dates
        modifiedDatesRef.current.clear()
        
        if (shouldRefreshTrend) {
            console.log('Refreshing trend stats due to data change')
            // Refresh stats only
            const y = start.getFullYear();
            const m = String(start.getMonth() + 1).padStart(2, '0');
            const d = String(start.getDate()).padStart(2, '0');
            const weekRefDateStr = `${y}-${m}-${d}`;
            
            // Call API directly without setting loading state
            getTeamStats(currentTeam.teamId, 'week', weekRefDateStr).then(statsRes => {
                const { trend, bestDay, topWorker } = statsRes
                setWeeklyStats(trend)
                if (bestDay && bestDay.count > 0) {
                    setBestDayInfo({
                        dayName: bestDay.dayName,
                        count: bestDay.count,
                        desc: `本周${bestDay.dayName}最热闹，有${bestDay.count}位小伙伴在办公室, 线下活动约起来！`
                    })
                } else {
                    setBestDayInfo({ dayName: '暂无数据', count: 0, desc: '大家似乎都很喜欢远程办公呢' })
                }
                setTopWorker(topWorker)
            }).catch(err => console.error('Silent stats refresh failed', err))
        }
        
        if (shouldRefreshMembers) {
            console.log('Refreshing members list due to data change')
            // Silent refresh - do NOT set membersLoading
            // Use selectedDateStr which is calculated from currentWeekStart + selectedDay
            // But if we are refreshing the list, we should probably use the date that was modified if it matches selected
            // The logic above sets shouldRefreshMembers = true if ANY modified date matches selectedDateStr
            // So we just fetch for selectedDateStr
            getDailyAttendance(currentTeam.teamId, selectedDateStr).then(res => {
                 updateMembersList(res.members)
            }).catch(e => {
                console.error('Silent member refresh failed', e)
            })
        }
        
        return // Skip normal init flow
    }

    if (isLoaded.current) {
        // If already loaded, just try silent refresh if needed
        // But for now, let's skip it to save requests as per requirement
        // Or we can check if data is stale (e.g. > 5 mins old)
        console.log('Page already loaded, skipping full refresh')
        return
    }

    // 优先尝试从缓存恢复
    const userId = Taro.getStorageSync('userId')
    const lastTeamId = Taro.getStorageSync('last_team_id')
    let cachedData = null

    console.log('userId:', userId)
    console.log('lastTeamId:', lastTeamId)

    if (userId && lastTeamId) {
       const cacheKey = `team_detail_${userId}_${lastTeamId}`
       cachedData = Taro.getStorageSync(cacheKey)
    }

    if (cachedData && cachedData.teamId) {
      console.log('Cached data found:', cachedData)
        // 如果有缓存，先展示缓存内容
        setViewState('active')
        // 恢复上下文
        const cachedTeam = { teamId: cachedData.teamId, name: cachedData.baseInfo?.name || 'My Team' }
        setCurrentTeam(cachedTeam)
        lastLoadedTeamId.current = cachedData.teamId // 标记缓存已加载
        
        // 恢复数据
        updateMembersList(cachedData.members || [])
        // Stats are NOT cached in base info anymore, need to fetch
        // BUT FIRST check login status before fetching anything
        const userId = AuthService.getUserId()
        if (!userId) {
           // 如果有缓存但没 userId (异常情况)，还是需要登录
           // 重定向到 Onboarding
           Taro.reLaunch({ url: '/pages/onboarding/index' })
           return
        }

        fetchTeamDetail(cachedData.teamId) 
        
        // For now, let's clear stats placeholders
        setWeeklyStats([])
        setTopWorker(null)
        setBestDayInfo({ dayName: '加载中...', count: 0, desc: '正在获取最新数据' })

        // 静默刷新（不显示loading）
        try {
            // Trigger stats fetch specifically
            // We use refreshTeams(true) which calls fetchTeamDetail
            refreshTeams(true) // silent mode
            isLoaded.current = true // Mark as loaded
        } catch (e) {
            console.error('Silent refresh failed', e)
        }
    } else {
        // 无缓存，走常规流程
        console.log('No cached data, fetching normally')
        setViewState('loading')
        try {
            // 检查登录状态
            const userId = AuthService.getUserId()
            if (!userId) {
               console.log('User not logged in, redirecting to Onboarding')
               Taro.reLaunch({ url: '/pages/onboarding/index' })
               return
            }
            await refreshTeams() // Wait for it
            isLoaded.current = true // Mark as loaded
        } catch (e) {
            console.error('Auto login failed', e)
            setViewState('empty')
        }
    }
  })

  // 2. Fetch Teams & Decide State
  const refreshTeams = async (silent = false) => {
    try {
      const teams = await getMyTeams()
      setMyTeams(teams)
      
      if (teams && teams.length > 0) {
        // State Transition: Loading -> Active
        
        // Try to load last used team from storage
        const lastTeamId = Taro.getStorageSync('last_team_id')
        const lastTeam = teams.find(t => t.teamId === lastTeamId)
        
        // Use last used team if valid, otherwise use first team
        const targetTeam = lastTeam || teams[0]
        
        setCurrentTeam(targetTeam)
        Taro.setStorageSync('last_team_id', targetTeam.teamId)
        
        // Optimization: Prevent redundant fetch if ID hasn't changed
        // 如果不是静默刷新（即用户显式操作或首次加载），且目标ID与上次加载的一致，则跳过
        if (!silent && lastLoadedTeamId.current === targetTeam.teamId) {
            console.log('Skip redundant fetch for team:', targetTeam.teamId)
            setViewState('active')
            return
        }

        // Fetch Detail for Initial Load
        await fetchTeamDetail(targetTeam.teamId)

        // Fetch Today's Attendance explicitly for initial view
        const now = new Date();
        // Use local date string construction to avoid UTC issues
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const todayStr = `${year}-${month}-${day}`;
        
        console.log('Fetching attendance for:', todayStr)
        const attendanceRes = await getDailyAttendance(targetTeam.teamId, todayStr)
        updateMembersList(attendanceRes.members)

        setViewState('active')
      } else {
        // State Transition: Loading -> Empty
        setCurrentTeam(null)
        setMembers([])
        setViewState('empty')
      }
    } catch (err) {
      console.error('Fetch teams failed', err)
      if (!silent) {
        Taro.showToast({ title: '加载团队失败', icon: 'none' })
        setViewState('empty') // Fallback
      }
    }
  }

  // 3. Fetch Team Detail (Initial Load - Big Manager)
  const fetchTeamDetail = async (teamId, refDate = null) => {
      try {
          let teamData = null;
          
          if (!refDate) {
              // 1. Initial Load: Fetch Base Info
              const baseRes = await getTeamDetail(teamId)
              teamData = baseRes;
              updateMembersList(baseRes.members)
              
              // Cache Base Data
              const userId = Taro.getStorageSync('userId')
              if (userId) {
                  const cacheKey = `team_detail_${userId}_${teamId}`
                  Taro.setStorageSync(cacheKey, {
                      teamId,
                      baseInfo: baseRes.baseInfo,
                      members: baseRes.members
                  })
              }
              lastLoadedTeamId.current = teamId 
          }

          // 2. Fetch Stats (Async)
          if (refDate) {
              setWeekStatsLoading(true)
              setMembersLoading(true)
          }
          
          const statsRes = await getTeamStats(teamId, 'week', refDate)
          const { trend, bestDay, topWorker } = statsRes
          
          // Update Stats
          setWeeklyStats(trend)
          
          if (bestDay && bestDay.count > 0) {
            setBestDayInfo({
                dayName: bestDay.dayName,
                count: bestDay.count,
                desc: `本周${bestDay.dayName}最热闹，有${bestDay.count}位小伙伴在办公室, 线下活动约起来！`
            })
          } else {
             setBestDayInfo({ dayName: '暂无数据', count: 0, desc: '大家似乎都很喜欢远程办公呢' })
          }

          setTopWorker(topWorker)
          
      } catch (err) {
          console.error('Fetch team detail failed', err)
      } finally {
          if (refDate) {
              setWeekStatsLoading(false)
              setMembersLoading(false)
          }
      }
  }

  const handleDayClick = async (index) => {
      if (index === selectedDay) return
      
      setSelectedDay(index)
      setMembersLoading(true) // Local loading
      
      try {
        // Calculate target date based on currentWeekStart
        // index 0 = Sunday, 1 = Monday, etc.
        const targetDate = new Date(currentWeekStart)
        targetDate.setDate(targetDate.getDate() + index + 1)
        const dateStr = targetDate.toISOString().split('T')[0]

        // Add 1ms to currentWeekStart to prevent stale closure issues if needed,
        // but fetching with dateStr is reliable.
        
        const res = await getDailyAttendance(currentTeam.teamId, dateStr)
        updateMembersList(res.members)
        
      } catch (err) {
          console.error('Fetch daily status failed', err)
      } finally {
          setMembersLoading(false)
      }
  }
  
  const updateMembersList = (memberList) => {
      const uiMembers = memberList.map(m => ({
          id: m.userId,
          name: m.name,
          avatar: m.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + m.name,
          status: (m.status || 'unknown').toUpperCase(),
          statusText: getStatusText(m.status),
          tagText: getTagText(m.status),
          isMe: m.isMe,
          isOnline: true
        }))
        setMembers(uiMembers)
  }

  // --- Helpers ---
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

  // --- Actions ---
  const handleSwitchTeam = () => {
    // Construct options: existing teams + "Join New Team"
    const teamNames = myTeams.map(t => t.name)
    const options = [...teamNames, '加入其他团队']
    
    Taro.showActionSheet({
      itemList: options,
      success: (res) => {
        const index = res.tapIndex
        if (index < myTeams.length) {
            // Switch to existing team
            const targetTeam = myTeams[index]
            if (targetTeam.teamId === currentTeam?.teamId) return // Skip if same team
            
            // Switch team logic
            setViewState('loading') // Show loading
            setCurrentTeam(targetTeam)
            Taro.setStorageSync('last_team_id', targetTeam.teamId)
            
            // Trigger refresh logic manually for the new team
            // Reset state
            setWeeklyStats([])
            setMembers([])
            setBestDayInfo({ dayName: '加载中...', count: 0, desc: '正在获取数据' })
            setTopWorker(null)
            
            // Fetch details
            // We can reuse refreshTeams(false) but we need to ensure it picks up the new last_team_id
            // Or better, just call fetchTeamDetail directly + getDailyAttendance
            
            // Let's use handleReload style logic but specific for switch
            isLoaded.current = false
            lastLoadedTeamId.current = null // Force reload
            
            // Fetch everything
            fetchTeamDetail(targetTeam.teamId).then(() => {
                // Fetch Today's Attendance
                const now = new Date();
                const year = now.getFullYear();
                const month = String(now.getMonth() + 1).padStart(2, '0');
                const day = String(now.getDate()).padStart(2, '0');
                const todayStr = `${year}-${month}-${day}`;
                
                return getDailyAttendance(targetTeam.teamId, todayStr)
            }).then(res => {
                if (res) updateMembersList(res.members)
                setViewState('active')
                isLoaded.current = true
            }).catch(err => {
                console.error('Switch team failed', err)
                Taro.showToast({ title: '切换失败', icon: 'none' })
                setViewState('active') // Revert to active (might show empty/error state ideally)
            })

        } else {
            // "Join New Team" clicked
            // Ensure state update happens after ActionSheet closes to avoid conflict
            // In Taro, ActionSheet callback might fire before animation ends
            // 300ms is usually safe, but let's try a different approach:
            // Force re-render cycle or use nextTick if available (Taro.nextTick)
            
            // Standard setTimeout
            setTimeout(() => {
                setShowJoinModal(true)
            }, 350)
        }
      },
      fail: (res) => {
        // Ignore cancel error
        if (res.errMsg && res.errMsg.includes('cancel')) return
        console.error(res.errMsg)
      }
    })
  }

  const handleReload = () => {
    // Reload Action: Reset to Loading -> Fetch
    setViewState('loading')
    refreshTeams()
  }

  const [previewTeam, setPreviewTeam] = useState(null) // New state for preview modal

  const handleJoinConfirm = async () => {
    // If preview exists, means we are confirming to join
    if (previewTeam) {
        Taro.showLoading({ title: '加入中...' })
        try {
           const userInfo = Taro.getStorageSync('userInfo')
           await joinTeam(null, userInfo, previewTeam.teamId) // Use teamId
           Taro.hideLoading()
           Taro.showToast({ title: '加入成功', icon: 'success' })
           setShowJoinModal(false)
           setPreviewTeam(null)
           setInviteCode('')
           
           // Trigger Reload
           handleReload()
        } catch (err) {
           Taro.hideLoading()
           Taro.showToast({ title: err.message || '加入失败', icon: 'none' })
        }
        return
    }

    // Otherwise, verify code and fetch preview
    const code = inviteCode
    if (code.length < 6) {
       Taro.showToast({ title: '请输入6位团队邀请码', icon: 'none' })
       return
    }
    
    Taro.showLoading({ title: '验证中...' })
    try {
       console.log('Validating invite code:', code);
       const res = await getTeamByInviteCode(code)
       Taro.hideLoading()
       const data = {...res}
       
       // Use functional update to ensure no stale closure issues
       setPreviewTeam(prev => {
           return {...data};
       })
    } catch (err) {
       console.error('Validation error:', err);
       Taro.hideLoading()
       Taro.showToast({ title: err.message || '验证失败', icon: 'none' })
    }
  }

  const handleCloseJoinModal = () => {
      setShowJoinModal(false)
      setPreviewTeam(null)
      setInviteCode('')
  }

  const handleCreateConfirm = async () => {
    if (!newTeamName.trim()) {
      Taro.showToast({ title: '请输入团队名称', icon: 'none' })
      return
    }

    Taro.showLoading({ title: '创建中...' })
    try {
      const userInfo = Taro.getStorageSync('userInfo')
      await createTeam(newTeamName, userInfo)
      Taro.hideLoading()
      Taro.showToast({ title: '创建成功', icon: 'success' })
      setShowCreateModal(false)
      setNewTeamName('')
      
      // Trigger Reload
      handleReload()
    } catch (err) {
      Taro.hideLoading()
      Taro.showToast({ title: err.message || '创建失败', icon: 'none' })
    }
  }

  // --- Renderers ---
  const renderSkeleton = () => (
    <View className='team-page skeleton-mode'>
        {/* Simple Skeleton Layout */}
        <View style={{ marginTop: pxTransform(20), padding: pxTransform(20) }}>
            <Skeleton width="40%" height={pxTransform(32)} animated style={{ marginBottom: pxTransform(40) }} />
            
            <View style={{ display: 'flex', gap: pxTransform(10), marginBottom: pxTransform(40) }}>
                 {[1,2,3,4,5].map(i => <Skeleton key={i} width={pxTransform(40)} height={pxTransform(120)} animated />)}
            </View>

            <View style={{ display: 'flex', flexDirection: 'column', gap: pxTransform(20) }}>
                {[1, 2, 3].map(i => (
                    <View key={i} style={{ display: 'flex', alignItems: 'center', gap: pxTransform(15) }}>
                        <Skeleton width={pxTransform(44)} height={pxTransform(44)} shape="circle" animated />
                        <View style={{ flex: 1 }}>
                            <Skeleton width="60%" height={pxTransform(16)} animated style={{ marginBottom: pxTransform(5) }} />
                            <Skeleton width="30%" height={pxTransform(12)} animated />
                        </View>
                    </View>
                ))}
            </View>
        </View>
    </View>
  )

  const renderEmpty = () => (
      <View className='team-page empty'>
         <EmptyState 
           onJoin={() => setShowJoinModal(true)} 
           onCreate={() => setShowCreateModal(true)} 
         />
         {renderModals()}
      </View>
  )

  const getWeekDateRange = () => {
    const monday = new Date(currentWeekStart)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    
    const formatDate = (date) => `${date.getMonth() + 1}月${date.getDate()}日`
    return `${formatDate(monday)}-${formatDate(sunday)}`
  }

  const changeWeek = async (days) => {
      const newStart = new Date(currentWeekStart)
      newStart.setDate(newStart.getDate() + days)
      newStart.setHours(0, 0, 0, 0) // Normalize time
      setCurrentWeekStart(newStart)

      // 切换周时，默认选中周一 (Index 1)
      // 如果需要选中今天(若今天在当前周)，逻辑会复杂点，这里简单处理为默认周一
      const newSelectedDay = 1 
      setSelectedDay(newSelectedDay)

      // Calculate target date (New Start + selectedDay)
      // currentWeekStart is Sunday (Index 0), so +1 is Monday
      const targetDate = new Date(newStart)
      targetDate.setDate(newStart.getDate() + newSelectedDay) 
      const dateStr = targetDate.toISOString().split('T')[0]
      
      // Fetch trend stats for the new week (using Monday as refDate usually works or start of week)
      // Pass refDate as the start of the week or any day within that week
      // Use local date string construction to avoid UTC issues
      const y = newStart.getFullYear();
      const m = String(newStart.getMonth() + 1).padStart(2, '0');
      const d = String(newStart.getDate()).padStart(2, '0');
      const weekRefDateStr = `${y}-${m}-${d}`;
      fetchTeamDetail(currentTeam.teamId, weekRefDateStr)

      // Fetch daily attendance for the selected day (Monday)
      setMembersLoading(true)
      try {
        const res = await getDailyAttendance(currentTeam.teamId, dateStr)
        updateMembersList(res.members)
      } catch (err) {
        console.error('Fetch daily status failed', err)
      } finally {
        setMembersLoading(false)
      }
  }

  const handleRefresh = async () => {
    return new Promise(async (resolve) => {
      try {
        // Clear cache and ref to force full reload
        const userId = Taro.getStorageSync('userId')
        if (currentTeam && userId) {
            Taro.removeStorageSync(`team_detail_${userId}_${currentTeam.teamId}`)
        }
        lastLoadedTeamId.current = null
        isLoaded.current = false // Reset loaded flag to allow refresh
        
        // Reset day selection to today
        setSelectedDay(todayIndex)
        setCurrentWeekStart(getStartOfWeek(new Date()))
        
        // Trigger refresh
        await refreshTeams(true)

        // Fetch Today's Attendance explicitly for refresh
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const todayStr = `${year}-${month}-${day}`;

        if (currentTeam) {
           const attendanceRes = await getDailyAttendance(currentTeam.teamId, todayStr)
           updateMembersList(attendanceRes.members)
        }

        isLoaded.current = true // Mark as loaded again
        
        Taro.showToast({ title: '刷新成功', icon: 'success' })
        resolve('done')
      } catch (e) {
        console.error('Refresh failed', e)
        Taro.showToast({ title: '刷新失败', icon: 'none' })
        resolve('done')
      }
    })
  }

  const renderActive = () => {
      const weekLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] // Changed to Sun-Sat
      
      // Calculate display date text
      const selectedDateObj = new Date(currentWeekStart)
      selectedDateObj.setDate(selectedDateObj.getDate() + selectedDay)
      const dateText = `${selectedDateObj.getMonth() + 1}月${selectedDateObj.getDate()}日`
      const isToday = selectedDay === todayIndex && currentWeekStart.getTime() === getStartOfWeek(new Date()).getTime()
      const dayLabel = isToday ? '今天' : weekLabels[selectedDay]
      const fullDateText = `${dateText} ${dayLabel}`

      return (
        <PullToRefresh
          style={{
            backgroundColor: 'transparent'
          }}
          onRefresh={handleRefresh}
        >
        <View className='team-page'>
          {/* 1. Header with Team Switcher */}
          <View className='page-header'>
            <View className='team-switcher' onClick={handleSwitchTeam}>
              <Text className='title'>{currentTeam?.name}</Text>
              <Image src={downIcon} className='arrow-icon' />
            </View>
            <View className='header-actions'>
                <View className='action-btn icon-only' onClick={() => Taro.navigateTo({ url: `/pages/team/settings/index?teamId=${currentTeam?.teamId}` })}>
                  <Image src={settingIcon} className='icon' />
                </View>
              </View>
          </View>

          {/* 2. Team Square (Swiper) */}
          <Swiper
            className='team-square-swiper'
            indicatorDots={true}
            indicatorColor='rgba(255, 255, 255, 0.5)'
            indicatorActiveColor='#fff'
            circular
            autoplay
            interval={5000}
            duration={500}
          >
            {/* Slide 1: Best Day */}
            <SwiperItem>
                <View className='best-day-card'>
                    <View className='card-content'>
                    <View className='tag'>
                        <Text className='icon'>🏆</Text>
                        <Text>团队黄金日推荐</Text>
                    </View>
                    <Text className='main-date'>{bestDayInfo.dayName}</Text>
                    <Text className='desc'>{bestDayInfo.desc}</Text>
                    </View>
                    <View className='bg-decoration'>🍚</View>
                </View>
            </SwiperItem>

            {/* Slide 2: Top Worker */}
            <SwiperItem>
                <View className='best-day-card top-worker-card'>
                    <View className='card-content'>
                        <View className='tag'>
                            <Text className='icon'>👑</Text>
                            <Text>本周上班王</Text>
                        </View>
                        {topWorker && Array.isArray(topWorker) && topWorker.length > 0 ? (
                            <Swiper
                                className='winner-swiper'
                                vertical
                                autoplay
                                interval={2000}
                                duration={500}
                                circular
                            >
                                {topWorker.map((worker, index) => (
                                    <SwiperItem key={index}>
                                        <View className='winner-slide'>
                                            <View className='winner-info'>
                                                <Image 
                                                    className='winner-avatar' 
                                                    src={worker.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + worker.name} 
                                                />
                                                <Text className='main-date'>{worker.name}</Text>
                                            </View>
                                            <Text className='desc'>本周标记到办公室 {worker.count} 天，是团队的定海神针！</Text>
                                        </View>
                                    </SwiperItem>
                                ))}
                            </Swiper>
                        ) : topWorker && !Array.isArray(topWorker) ? (
                             // Fallback for single object (legacy)
                            <>
                                <View className='winner-info'>
                                    <Image 
                                        className='winner-avatar' 
                                        src={topWorker.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + topWorker.name} 
                                    />
                                    <Text className='main-date'>{topWorker.name}</Text>
                                </View>
                                <Text className='desc'>本周标记到办公室 {topWorker.count} 天，是团队的定海神针！</Text>
                            </>
                        ) : (
                            <>
                                <Text className='main-date'>虚位以待</Text>
                                <Text className='desc'>本周还没有人来办公室打卡哦</Text>
                            </>
                        )}
                    </View>
                    <View className='bg-decoration'>👑</View>
                </View>
            </SwiperItem>
          </Swiper>

          {/* 3. Week Distribution (Simplified) */}
          <View className='section-container'>
            <View className='section-header-row'>
              <Text className='section-title'>Office Day趋势</Text>
              <View className='date-range-control'>
                  <View className='arrow-btn' onClick={() => changeWeek(-7)}>
                      <Image src={leftIcon} className='icon' />
                  </View>
                  <Text className='date-range'>{getWeekDateRange()}</Text>
                  <View className='arrow-btn' onClick={() => changeWeek(7)}>
                      <Image src={rightIcon} className='icon' />
                  </View>
              </View>
            </View>
            
            <View className='week-chart'>
              {weekStatsLoading ? (
                  <Skeleton animated height={pxTransform(160)} width={pxTransform(320)} />
              ) : (
                  weekLabels.map((label, index) => {
                    const stat = weeklyStats[index] || { ratio: 0 }
                    const barHeight = stat.ratio > 0 ? `${stat.ratio * 100}%` : '5%'
                    
                    return (
                    <View 
                      key={index} 
                      className={`day-column ${selectedDay === index ? 'active' : ''}`}
                      onClick={() => handleDayClick(index)}
                    >
                      <View className='bar-container'>
                        <View 
                          className='bar' 
                          style={{ height: barHeight }} 
                        />
                      </View>
                      <Text className='day-label'>{label}</Text>
                      {index === todayIndex && currentWeekStart.getTime() === getStartOfWeek(new Date()).getTime() && <View className='today-dot' />}
                    </View>
                  )})
              )}
            </View>
          </View>

          {/* 4. Member List */}
          <View className='section-container'>
            <View className='list-header'>
              <Text className='section-title'>
                谁在 Office ({fullDateText})
                <Text className='member-count'>（{members.filter(m => m.status === 'OFFICE').length}人）</Text>
              </Text>
            </View>
            
            {membersLoading ? (
                <View className='member-list'>
                  {[1, 2, 3].map(i => (
                    <View key={i} className='member-card'>
                      <Skeleton width={pxTransform(44)} height={pxTransform(44)} shape="circle" animated />
                      <View style={{ flex: 1, display: 'flex', flexDirection: 'column', marginLeft: pxTransform(10), gap: pxTransform(5) }}>
                        <Skeleton width="40%" height={pxTransform(16)} animated />
                        <Skeleton width="20%" height={pxTransform(12)} animated />
                      </View>
                      <Skeleton width={pxTransform(60)} height={pxTransform(24)} shape="round" animated />
                    </View>
                  ))}
                </View>
            ) : (
                <View className='member-list'>
                {members.filter(m => m.status === 'OFFICE').map(member => (
                    <View key={member.id} className='member-card'>
                    <View className='avatar-container'>
                        <Image 
                          src={member.avatar} 
                          className='avatar' 
                          onError={(e) => {
                            // Fallback to default avatar on error
                            e.target.src = 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + member.name
                          }}
                        />
                        {(member.isOnline || member.status === 'OFFICE') && <View className='online-dot' />}
                    </View>
                    
                    <View className='info'>
                        <View className='name-row'>
                        <Text className='name'>{member.name}</Text>
                        {member.isMe && <Text className='me-badge'>👑</Text>}
                        </View>
                        <View className='status-row'>
                        <Text className='status-icon'>
                            {member.status === 'OFFICE' ? '📍' : '🏠'}
                        </Text>
                        <Text className='status-text'>
                            {member.statusText}
                        </Text>
                        </View>
                    </View>

                    <View className={`status-tag ${member.status === 'OFFICE' ? 'office' : 'remote'}`}>
                        <Text>{member.tagText}</Text>
                    </View>
                    </View>
                ))}
                {members.filter(m => m.status === 'OFFICE').length === 0 && (
                  <View className='empty-list' style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 0', gap: '12px' }}>
                    <Image src={grassIcon} style={{ width: '64px', height: '64px', opacity: 0.8 }} />
                    <Text style={{ color: '#999', fontSize: '12px' }}>今日份办公室：长草、安静、没人。</Text>
                  </View>
                )}
                </View>
            )}
          </View>

          {renderModals()}
        </View>
        </PullToRefresh>
      )
  }

  const renderModals = () => {
      // Move modal rendering logic to top level if possible, but here it's fine.
      // Ensure z-index in SCSS is high enough.
      // Check if conditional rendering is correct.
      if (!showJoinModal && !showCreateModal) return null;
      
      return (
      <>
         {/* Join Modal */}
         {showJoinModal && (
           <View className='modal-overlay'>
             <View className='modal-card'>
               {previewTeam ? (
                 // Preview State
                 <>
                    <View className='modal-header'>
                        <Text className='modal-title'>加入确认</Text>
                    </View>
                    <View className='team-preview-info'>
                        <View className='preview-row'>
                            <Text className='label'>团队名称：</Text>
                            <Text className='value'>{previewTeam.name}</Text>
                        </View>
                        <View className='preview-row'>
                            <Text className='label'>现有成员：</Text>
                            <Text className='value'>{previewTeam.memberCount} 人</Text>
                        </View>
                    </View>
                    <View className='modal-actions'>
                        <Button className='modal-btn confirm' onClick={handleJoinConfirm}>确认加入</Button>
                        <Text className='modal-btn cancel' onClick={handleCloseJoinModal}>再想想</Text>
                    </View>
                 </>
               ) : (
                 // Input State
                 <>
                    <View className='modal-header'>
                        <Text className='modal-title'>加入团队</Text>
                        <Text className='modal-subtitle'>请输入6位团队邀请码</Text>
                    </View>
                    
                    <Input 
                        className='modal-input' 
                        placeholder='请输入6位团队邀请码' 
                        value={inviteCode}
                        onInput={e => setInviteCode(e.detail.value.toUpperCase())}
                        maxlength={6}
                    />

                    <View className='modal-actions'>
                        <Button className='modal-btn confirm' onClick={handleJoinConfirm}>下一步</Button>
                        <Text className='modal-btn cancel' onClick={handleCloseJoinModal}>取消</Text>
                    </View>
                 </>
               )}
             </View>
           </View>
         )}

         {/* Create Modal */}
         {showCreateModal && (
           <View className='modal-overlay'>
             <View className='modal-card'>
               <View className='modal-header'>
                 <Text className='modal-title'>创建团队</Text>
               </View>
               <Input 
                 className='modal-input' 
                 placeholder='给团队起个名字' 
                 value={newTeamName}
                 onInput={e => setNewTeamName(e.detail.value)}
               />
               <View className='modal-actions'>
                 <Button className='modal-btn confirm' onClick={handleCreateConfirm}>创建</Button>
                 <Text className='modal-btn cancel' onClick={() => setShowCreateModal(false)}>取消</Text>
               </View>
             </View>
           </View>
         )}
      </>
      )
  }

  // --- Main Render ---
  switch(viewState) {
      case 'loading': return renderSkeleton()
      case 'empty': return renderEmpty()
      case 'active': return renderActive()
      default: return renderSkeleton()
  }
}
