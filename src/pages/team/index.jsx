import React, { useState, useEffect, useCallback, useRef } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { View, Text, Button, Image, Input, Swiper, SwiperItem } from '@tarojs/components'
import { Skeleton, pxTransform, PullToRefresh } from '@nutui/nutui-react-taro'
import { getMyTeams, getTeamStatus, getTeamDetail, joinTeam, createTeam } from '../../services/team'
import EmptyState from './empty/index'
import AuthService from '../../services/auth'
import downIcon from '../../assets/down.png'
import addIcon from '../../assets/add.png'
import settingIcon from '../../assets/setting.png'
import grassIcon from '../../assets/grass.png'
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
  
  const [selectedDay, setSelectedDay] = useState(getDayIndex(new Date())) 
  const [members, setMembers] = useState([])
  const [weeklyStats, setWeeklyStats] = useState([])
  const [bestDayInfo, setBestDayInfo] = useState({ dayName: '暂无数据', count: 0, desc: '本周还没有足够的数据来预测黄金日' })
  const [topWorker, setTopWorker] = useState(null)
  const [membersLoading, setMembersLoading] = useState(false)
  const lastLoadedTeamId = useRef(null)
  
  // Modal States
  const [showJoinModal, setShowJoinModal] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [inviteCode, setInviteCode] = useState('')
  const [newTeamName, setNewTeamName] = useState('')

  const todayIndex = getDayIndex(new Date())

  // 1. Initial Load (FSM Trigger)
  useDidShow(async () => {
    // 优先尝试从缓存恢复
    const userId = Taro.getStorageSync('userId')
    const lastTeamId = Taro.getStorageSync('last_team_id')
    let cachedData = null

    if (userId && lastTeamId) {
       const cacheKey = `team_detail_${userId}_${lastTeamId}`
       cachedData = Taro.getStorageSync(cacheKey)
    }

    if (cachedData && cachedData.teamId) {
        // 如果有缓存，先展示缓存内容
        setViewState('active')
        // 恢复上下文
        const cachedTeam = { teamId: cachedData.teamId, name: cachedData.baseInfo?.name || 'My Team' }
        setCurrentTeam(cachedTeam)
        lastLoadedTeamId.current = cachedData.teamId // 标记缓存已加载
        
        // 恢复数据
        updateMembersList(cachedData.members || [])
        setWeeklyStats(cachedData.summary?.weeklyTrend || [])
        setTopWorker(cachedData.summary?.topWorker || null)
        if (cachedData.summary?.bestDay) {
            const { bestDay } = cachedData.summary
            setBestDayInfo({
                dayName: bestDay.dayName,
                count: bestDay.count,
                desc: bestDay.count > 0 
                    ? `本周${bestDay.dayName}最热闹，有${bestDay.count}位小伙伴在办公室, 线下活动约起来！`
                    : '本周还没有足够的数据来预测黄金日'
            })
        }
        
        // 静默刷新（不显示loading）
        // 只有当缓存的ID和当前页面逻辑需要的ID一致时，才考虑静默刷新
        // 这里我们可以简单地总是尝试静默刷新以保持数据最新，但避免了loading闪烁
        try {
            await AuthService.login()
            refreshTeams(true) // silent mode
        } catch (e) {
            console.error('Silent refresh failed', e)
        }
    } else {
        // 无缓存，走常规流程
        setViewState('loading')
        try {
            await AuthService.login()
            refreshTeams()
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
  const fetchTeamDetail = async (teamId) => {
      try {
          const res = await getTeamDetail(teamId)
          console.log('Team Detail Response:', res)
          const { members, summary } = res
          
          // Update Today's Members
          updateMembersList(members)
          
          // Update Weekly Stats
          setWeeklyStats(summary.weeklyTrend)
          
          // Update Best Day
          if (summary.bestDay && summary.bestDay.count > 0) {
            setBestDayInfo({
                dayName: summary.bestDay.dayName,
                count: summary.bestDay.count,
                desc: `本周${summary.bestDay.dayName}最热闹，有${summary.bestDay.count}位小伙伴在办公室, 线下活动约起来！`
            })
          } else {
             setBestDayInfo({ dayName: '暂无数据', count: 0, desc: '大家似乎都很喜欢远程办公呢' })
          }

          // Update Top Worker
          setTopWorker(summary.topWorker)
          
          // Cache Data
          const userId = Taro.getStorageSync('userId')
          if (userId) {
             const cacheKey = `team_detail_${userId}_${teamId}`
             Taro.setStorageSync(cacheKey, {
                teamId,
                baseInfo: res.baseInfo,
                members,
                summary
             })
          }
          
          lastLoadedTeamId.current = teamId // Update Ref
          
          // Reset selection to today ONLY if not manually selected
          // 逻辑优化：如果用户从未手动选择过（selectedDay 仍为初始值或 null），或者需要强制重置，才重置为 todayIndex。
          // 但这里的需求是：“如果已经选中了某个bar，不应该恢复到当天”。
          // 我们可以通过一个 ref 来记录用户是否手动交互过，或者更简单地：
          // 每次 fetchDetail 后，保持当前的 selectedDay 不变。
          // 只有当 selectedDay 与当前周不匹配时（例如跨周了），才重置。
          // 鉴于目前逻辑都是基于本周的 index (0-6)，只要还在本周内，index 就是有效的。
          // 所以直接注释掉重置逻辑，或者只在初始化时设置一次。
          
          // 如果当前 selectedDay 无效（比如刚初始化），则设为 todayIndex
          // 但由于 state 初始化时已经设为 todayIndex，所以这里其实可以完全移除重置逻辑，
          // 让 selectedDay 保持当前状态。
          // setSelectedDay(todayIndex) 
      } catch (err) {
          console.error('Fetch team detail failed', err)
      }
  }

  const handleDayClick = async (index) => {
      if (index === selectedDay) return
      
      setSelectedDay(index)
      setMembersLoading(true) // Local loading
      
      try {
        const now = new Date()
        const currentDayIndex = getDayIndex(now) // 0-6
        const diff = index - currentDayIndex
        
        const targetDate = new Date(now)
        targetDate.setDate(now.getDate() + diff)
        const dateStr = targetDate.toISOString().split('T')[0]

        const res = await getTeamStatus(currentTeam.teamId, dateStr)
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
    const now = new Date()
    const currentDayIndex = getDayIndex(now) // 0 (Mon) - 6 (Sun)
    
    // Calculate Monday
    const monday = new Date(now)
    monday.setDate(now.getDate() - currentDayIndex)
    
    // Calculate Sunday
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    
    const formatDate = (date) => `${date.getMonth() + 1}月${date.getDate()}日`
    return `${formatDate(monday)}-${formatDate(sunday)}`
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
        
        // Reset day selection to today
        setSelectedDay(todayIndex)
        
        // Trigger refresh
        await refreshTeams(true)
        
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
      const weekLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
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
              <Text className='section-title'>本周到岗趋势</Text>
              <Text className='date-range'>{getWeekDateRange()}</Text>
            </View>
            
            <View className='week-chart'>
              {weekLabels.map((label, index) => {
                const stat = weeklyStats[index] || { ratio: 0 }
                // Height calculation: 
                // Min height 10% so bar is visible/clickable even if 0
                // Max height 100%
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
                  {index === todayIndex && <View className='today-dot' />}
                </View>
              )})}
            </View>
          </View>

          {/* 4. Member List */}
          <View className='section-container'>
            <View className='list-header'>
              <Text className='section-title'>
                谁在 Office ({selectedDay === todayIndex ? '今天' : weekLabels[selectedDay]})
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
