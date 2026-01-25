import React, { useState, useEffect, useCallback, useRef } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { View, Text, Button, Image, Input, Swiper, SwiperItem } from '@tarojs/components'
import { Skeleton, pxTransform, PullToRefresh } from '@nutui/nutui-react-taro'
import { getMyTeams, getDailyAttendance, getTeamDetail, getTeamStats, joinTeam, createTeam } from '../../services/team'
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
  
  // Date Logic
  const getDayIndex = (date) => {
    const day = date.getDay()
    return day === 0 ? 6 : day - 1
  }

  const getStartOfWeek = (date) => {
    const d = new Date(date)
    const day = d.getDay()
    const diff = d.getDate() - (day === 0 ? 6 : day - 1)
    d.setDate(diff)
    return d
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
  const [inviteCode, setInviteCode] = useState('')
  const [newTeamName, setNewTeamName] = useState('')

  const todayIndex = getDayIndex(new Date())

  // 1. Initial Load (FSM Trigger)
  // Use a flag to ensure initial load happens only once per session
  const isLoaded = useRef(false)

  useDidShow(async () => {
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
        fetchTeamDetail(cachedData.teamId) // This will trigger logic to fetch stats separately if needed, OR we just let it be empty initially and fetch stats?
        // Actually, the new logic splits fetching. 
        // If we have cached base info, we show it.
        // Then we should probably fetch stats in background.
        
        // Let's refine this:
        // We have base info. We need stats.
        // Call fetchTeamDetail with refDate=null (current week) but skip base info fetch if cached?
        // Or simpler: just let silent refresh handle it.
        
        // For now, let's clear stats placeholders
        setWeeklyStats([])
        setTopWorker(null)
        setBestDayInfo({ dayName: '加载中...', count: 0, desc: '正在获取最新数据' })

        // 静默刷新（不显示loading）
        // 只有当缓存的ID和当前页面逻辑需要的ID一致时，才考虑静默刷新
        // 这里我们可以简单地总是尝试静默刷新以保持数据最新，但避免了loading闪烁
        try {
            const userId = AuthService.getUserId()
            if (!userId) {
               await AuthService.login()
            }
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
               console.log('User not logged in, login first')
               // 这里可以根据需求决定是否强制登录，或者跳转登录页
               // 暂时尝试后台登录一次
               await AuthService.login()
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
        const targetDate = new Date(currentWeekStart)
        targetDate.setDate(targetDate.getDate() + index)
        const dateStr = targetDate.toISOString().split('T')[0]

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
    if (myTeams.length <= 1) return
    Taro.showActionSheet({
      itemList: myTeams.map(t => t.name),
      success: (res) => {
        setCurrentTeam(myTeams[res.tapIndex])
      }
    })
  }

  const handleReload = () => {
    // Reload Action: Reset to Loading -> Fetch
    setViewState('loading')
    refreshTeams()
  }

  const handleJoinConfirm = async () => {
    if (inviteCode.length < 6) {
       Taro.showToast({ title: '请输入有效邀请码', icon: 'none' })
       return
    }
    
    Taro.showLoading({ title: '加入中...' })
    try {
       const userInfo = Taro.getStorageSync('userInfo')
       await joinTeam(inviteCode, userInfo)
       Taro.hideLoading()
       Taro.showToast({ title: '加入成功', icon: 'success' })
       setShowJoinModal(false)
       setInviteCode('')
       
       // Trigger Reload
       handleReload()
    } catch (err) {
       Taro.hideLoading()
       Taro.showToast({ title: err.message || '加入失败', icon: 'none' })
    }
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

  const changeWeek = (days) => {
      const newStart = new Date(currentWeekStart)
      newStart.setDate(newStart.getDate() + days)
      setCurrentWeekStart(newStart)

      // Determine target date (same day of week in new week)
      const targetDate = new Date(newStart)
      targetDate.setDate(newStart.getDate() + selectedDay)
      const dateStr = targetDate.toISOString().split('T')[0]
      
      fetchTeamDetail(currentTeam.teamId, dateStr)
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
      // 动态生成周标签，支持补班
      const weekLabels = ['周一', '周二', '周三', '周四', '周五']
      // TODO: 如果有补班数据，这里需要动态添加 '周六' 或 '周日'
      // 目前后端返回的 weeklyStats 是7天的，我们可以根据 weeklyStats 里的 isWork 字段来决定显示多少天
      // 暂时先展示7天，后续根据数据优化
      const displayLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
      
      return (
        <PullToRefresh
          style={{
            minHeight: '100vh',
            backgroundColor: 'transparent'
          }}
          onRefresh={handleRefresh}
        >
        <View className='team-page'>
          {/* 1. Header with Team Switcher */}
          <View className='page-header'>
            <View className='team-switcher' onClick={handleSwitchTeam}>
              <Text className='title'>{currentTeam?.name}</Text>
              {myTeams.length > 1 && <Image src={downIcon} className='arrow-icon' />}
            </View>
            <View className='header-actions'>
                <View className='action-btn primary' onClick={() => setShowJoinModal(true)}>
                  <Image src={addIcon} className='icon' />
                  <Text className='label'>加入</Text>
                </View>
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
                        {topWorker ? (
                            <>
                                <View className='winner-info'>
                                    <Image 
                                        className='winner-avatar' 
                                        src={topWorker.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + topWorker.name} 
                                    />
                                    <Text className='main-date'>{topWorker.name}</Text>
                                </View>
                                <Text className='desc'>本周累计到办公室 {topWorker.count} 天，是团队的定海神针！</Text>
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
                  <View className='chart-skeleton' style={{ display: 'flex', justifyContent: 'space-between', padding: '20rpx 0', height: '160rpx', alignItems: 'flex-end' }}>
                      {[1,2,3,4,5,6,7].map(i => <Skeleton key={i} width={pxTransform(24)} height={pxTransform(100)} animated />)}
                  </View>
              ) : (
                  displayLabels.map((label, index) => {
                    // 只显示前5天，或者是补班的周末
                    // 简化逻辑：始终显示周一到周五，如果周六日有人去office（或补班），则显示
                    // 但为了 UI 稳定，暂时保持7天，只是样式上可以弱化周末
                    // 您的需求是：只显示周一到周五，如果有补班才显示对应周末
                    
                    // Check if it's weekend
                    const isWeekend = index >= 5
                    const stat = weeklyStats[index] || { ratio: 0, officeCount: 0 }
                    
                    // Logic: Show Mon-Fri always. Show Sat/Sun only if officeCount > 0 (assuming work day or OT)
                    // Or strictly follow "comp work day" logic if we had that flag.
                    // For now, let's hide Sat/Sun if count is 0.
                    if (isWeekend && stat.officeCount === 0) return null
                    
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
                谁在 Office ({selectedDay === todayIndex && currentWeekStart.getTime() === getStartOfWeek(new Date()).getTime() ? '今天' : displayLabels[selectedDay]})
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

  const renderModals = () => (
      <>
         {/* Join Modal */}
         {showJoinModal && (
           <View className='modal-overlay'>
             <View className='modal-card'>
               <View className='modal-header'>
                 <Text className='modal-title'>加入团队</Text>
               </View>
               <Input 
                 className='modal-input' 
                 placeholder='请输入邀请码' 
                 value={inviteCode}
                 onInput={e => setInviteCode(e.detail.value)}
               />
               <View className='modal-actions'>
                 <Button className='modal-btn confirm' onClick={handleJoinConfirm}>确认</Button>
                 <Text className='modal-btn cancel' onClick={() => setShowJoinModal(false)}>取消</Text>
               </View>
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

  // --- Main Render ---
  switch(viewState) {
      case 'loading': return renderSkeleton()
      case 'empty': return renderEmpty()
      case 'active': return renderActive()
      default: return renderSkeleton()
  }
}
