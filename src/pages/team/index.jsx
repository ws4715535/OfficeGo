import React, { useState, useEffect, useCallback } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { View, Text, Button, Image, Input } from '@tarojs/components'
import { Skeleton, pxTransform } from '@nutui/nutui-react-taro'
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
  const [membersLoading, setMembersLoading] = useState(false)
  
  // Modal States
  const [showJoinModal, setShowJoinModal] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [inviteCode, setInviteCode] = useState('')
  const [newTeamName, setNewTeamName] = useState('')

  const todayIndex = getDayIndex(new Date())

  // 1. Initial Load (FSM Trigger)
  useDidShow(async () => {
    // Reset to loading state on every show to ensure freshness, 
    // but we can optimize this if needed. For now per requirement: "必须优先展示 Skeleton"
    setViewState('loading')
    
    try {
        await AuthService.login()
        refreshTeams()
    } catch (e) {
        console.error('Auto login failed', e)
        // If login fails, maybe show empty state or retry?
        // For MVP, assume empty state
        setViewState('empty')
    }
  })

  // 2. Fetch Teams & Decide State
  const refreshTeams = async () => {
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
      Taro.showToast({ title: '加载团队失败', icon: 'none' })
      setViewState('empty') // Fallback
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
          
          // Reset selection to today
          setSelectedDay(todayIndex)
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
          status: m.status.toUpperCase(),
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
      case 'unset': return '未打卡'
      default: return '未知'
    }
  }

  const getTagText = (status) => {
    switch(status) {
      case 'office': return 'Office'
      case 'remote': return 'Remote'
      case 'leave': return 'Leave'
      default: return 'Unset'
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

  const renderActive = () => {
      const weekLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
      return (
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
                <View className='action-btn icon-only' onClick={() => Taro.navigateTo({ url: `/pages/team/settings/index?id=${currentTeam?.teamId}` })}>
                  <Image src={settingIcon} className='icon' />
                </View>
              </View>
          </View>

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
