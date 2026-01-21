import { View, Text, Image, Button, Input } from '@tarojs/components'
import React, { useState, useEffect } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { TEAMS, getTeamData, getMembersForDay, joinTeam } from '../../services/mockTeamData'
import EmptyState from './empty/index'
import downIcon from '../../assets/down.png'
import addIcon from '../../assets/add.png'
import settingIcon from '../../assets/setting.png'
import './index.scss'

export default function Team() {
  const [currentTeam, setCurrentTeam] = useState(null)
  const [selectedDay, setSelectedDay] = useState(new Date().getDay() - 1) // 0-4
  const [teamData, setTeamData] = useState(null)
  const [members, setMembers] = useState([])
  const todayIndex = new Date().getDay() - 1 // 0=Mon, 4=Fri
  
  const [hasTeam, setHasTeam] = useState(true)
  const [showJoinModal, setShowJoinModal] = useState(false)
  const [inviteCode, setInviteCode] = useState('')

  // Check team status
  useDidShow(() => {
    refreshTeams()
  })

  const refreshTeams = () => {
    const has = TEAMS.length > 0
    setHasTeam(has)
    
    if (has) {
      // If currentTeam is not valid (e.g. left), reset to first
      if (!currentTeam || !TEAMS.find(t => t.id === currentTeam.id)) {
        setCurrentTeam(TEAMS[0])
      }
    } else {
      setCurrentTeam(null)
      setTeamData(null)
    }
  }

  // Load Team Data when team changes
  useEffect(() => {
    if (currentTeam) {
      const data = getTeamData(currentTeam.id)
      setTeamData(data)
    }
  }, [currentTeam])

  // Load Members when team or day changes
  useEffect(() => {
    if (teamData && currentTeam) {
      const dailyMembers = getMembersForDay(currentTeam.id, selectedDay)
      setMembers(dailyMembers)
    }
  }, [currentTeam, selectedDay, teamData])

  const handleSwitchTeam = () => {
    Taro.showActionSheet({
      itemList: TEAMS.map(t => t.name),
      success: (res) => {
        setCurrentTeam(TEAMS[res.tapIndex])
      }
    })
  }

  const handleAddMember = () => {
    // Also acts as Join Team trigger if we want
    setShowJoinModal(true)
  }
  
  const handleJoinClick = () => setShowJoinModal(true)
  const handleCreateClick = () => Taro.showToast({ title: '创建功能开发中', icon: 'none' })
  
  const handleJoinConfirm = () => {
    if (inviteCode.length >= 4) {
       const newTeam = joinTeam(inviteCode)
       setHasTeam(true)
       setCurrentTeam(newTeam)
       setShowJoinModal(false)
       setInviteCode('')
       Taro.showToast({ title: '加入成功', icon: 'success' })
    } else {
       Taro.showToast({ title: '请输入有效邀请码', icon: 'none' })
    }
  }

  // Render Empty State
  if (!hasTeam) {
    return (
      <View className='team-page empty'>
         <EmptyState onJoin={handleJoinClick} onCreate={handleCreateClick} />
         
         {/* Join Modal */}
         {showJoinModal && (
           <View className='modal-overlay'>
             <View className='modal-card'>
               <View className='modal-header'>
                 <View className='icon-box'>
                   <Text className='hash'>#</Text>
                 </View>
                 <Text className='modal-title'>加入团队</Text>
               </View>
               <Input 
                 className='modal-input' 
                 placeholder='输入 8 位邀请码' 
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
      </View>
    )
  }

  if (!teamData) return null

  return (
    <View className='team-page'>
      {/* 1. Header with Team Switcher */}
      <View className='page-header'>
        <View className='team-switcher' onClick={handleSwitchTeam}>
          <Text className='title'>{currentTeam.name}</Text>
          <Image src={downIcon} className='arrow-icon' />
        </View>
        <View className='header-actions'>
            <View className='action-btn primary' onClick={handleAddMember}>
              <Image src={addIcon} className='icon' />
              <Text className='label'>加入</Text>
            </View>
            <View className='action-btn icon-only' onClick={() => Taro.navigateTo({ url: `/pages/team/settings/index?id=${currentTeam.id}` })}>
              <Image src={settingIcon} className='icon' />
            </View>
          </View>
      </View>

      {/* 2. Best Day Card */}
      <View className='best-day-card'>
        <View className='card-content'>
          <View className='tag'>
            <Text className='icon'>🏆</Text>
            <Text>团队黄金日推荐</Text>
          </View>
          <Text className='main-date'>{teamData.bestDay.day}</Text>
          <Text className='desc'>{teamData.bestDay.desc}</Text>
        </View>
        <View className='bg-decoration'>🏆</View>
      </View>

      {/* 3. Week Distribution */}
      <View className='section-container'>
        <View className='section-header-row'>
          <Text className='section-title'>本周在岗趋势</Text>
          <Text className='date-range'>{teamData.dateRange}</Text>
        </View>
        
        <View className='week-chart'>
          {teamData.weekDays.map((day) => (
            <View 
              key={day.value} 
              className={`day-column ${selectedDay === day.value ? 'active' : ''}`}
              onClick={() => setSelectedDay(day.value)}
            >
              <View className='bar-container'>
                <View 
                  className='bar' 
                  style={{ height: `${day.count * 15 + 20}%` }} 
                />
              </View>
              <Text className='day-label'>{day.label}</Text>
              {day.value === todayIndex && <View className='today-dot' />}
            </View>
          ))}
        </View>
      </View>

      {/* 4. Member List */}
      <View className='section-container'>
        <View className='list-header'>
          <Text className='section-title'>
            谁在 Office ({selectedDay === todayIndex ? '今天' : teamData.weekDays[selectedDay].label})
            <Text className='member-count'>（{members.filter(m => m.status === 'OFFICE').length}人）</Text>
          </Text>
        </View>
        
        <View className='member-list'>
          {members.map(member => (
            <View key={member.id} className='member-card'>
              <View className='avatar-container'>
                <Image src={member.avatar} className='avatar' />
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
        </View>
      </View>

      {/* Re-use Join Modal */}
       {showJoinModal && (
           <View className='modal-overlay'>
             <View className='modal-card'>
               <View className='modal-header'>
                 <View className='icon-box'>
                   <Text className='hash'>#</Text>
                 </View>
                 <Text className='modal-title'>加入团队</Text>
               </View>
               <Input 
                 className='modal-input' 
                 placeholder='输入 8 位邀请码' 
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
    </View>
  )
}