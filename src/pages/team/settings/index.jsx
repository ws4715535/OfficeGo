import { View, Text, Image, Button, Input } from '@tarojs/components'
import React, { useState, useEffect } from 'react'
import Taro, { useRouter } from '@tarojs/taro'
import { getTeamSettings, leaveTeam } from '../../../services/mockTeamData'
import deleteIcon from '../../../assets/delete.png'
import './index.scss'

export default function TeamSettings() {
  const router = useRouter()
  const [teamInfo, setTeamInfo] = useState(null)
  
  // Get teamId from params or default to t1
  const teamId = router.params.teamId || 't1'

  useEffect(() => {
    // Simulate API fetch
    const data = getTeamSettings(teamId)
    setTeamInfo(data)
  }, [teamId])

  const handleCopyCode = () => {
    Taro.setClipboardData({
      data: teamInfo.inviteCode,
      success: () => Taro.showToast({ title: '邀请码已复制', icon: 'success' })
    })
  }

  const handleRename = () => {
    if (teamInfo.currentUserRole !== 'admin') return

    // In Taro/WeChat, we usually use a modal with input or navigate to a form
    // For MVP, we'll use showModal with editable: true (if supported) or just mock it
    Taro.showModal({
      title: '修改团队名称',
      editable: true,
      placeholderText: teamInfo.name,
      success: (res) => {
        if (res.confirm && res.content) {
          setTeamInfo(prev => ({ ...prev, name: res.content }))
          Taro.showToast({ title: '修改成功', icon: 'success' })
        }
      }
    })
  }

  const handleRemoveMember = (member) => {
    Taro.showModal({
      title: '移除成员',
      content: `确定要将 ${member.name} 移出团队吗？`,
      confirmColor: '#FF4D4F',
      success: (res) => {
        if (res.confirm) {
          setTeamInfo(prev => ({
            ...prev,
            members: prev.members.filter(m => m.id !== member.id),
            memberCount: prev.memberCount - 1
          }))
          Taro.showToast({ title: '已移除', icon: 'success' })
        }
      }
    })
  }

  const handleLeaveTeam = () => {
    Taro.showModal({
      title: '退出团队',
      content: '确认退出该团队？退出后将无法查看团队数据。',
      confirmColor: '#FF4D4F',
      success: (res) => {
        if (res.confirm) {
          leaveTeam(teamId)
          Taro.showToast({ title: '已退出', icon: 'success' })
          setTimeout(() => Taro.navigateBack(), 1500)
        }
      }
    })
  }

  const handleDissolveTeam = () => {
    Taro.showModal({
      title: '解散团队',
      content: '解散团队后，所有成员将被移除，相关数据将被删除，是否继续？',
      confirmColor: '#FF4D4F',
      success: (res) => {
        if (res.confirm) {
          Taro.showToast({ title: '团队已解散', icon: 'success' })
          setTimeout(() => Taro.navigateBack(), 1500)
        }
      }
    })
  }

  if (!teamInfo) return null

  const isAdmin = teamInfo.currentUserRole === 'admin'

  return (
    <View className='settings-page'>
      {/* 1. Team Info Card */}
      <View className='card info-card'>
        <View className='info-header'>
          <Text className='label'>团队信息</Text>
          {isAdmin && <View className='edit-icon' onClick={handleRename}>✎</View>}
        </View>
        <Text className='team-name'>{teamInfo.name}</Text>
        <Text className='team-meta'>创建于 {teamInfo.createdAt} · {teamInfo.memberCount} 名成员</Text>
        <View className='role-tag'>
          <Text>我的角色: {isAdmin ? '管理员' : '成员'}</Text>
        </View>
      </View>

      {/* 2. Invite Card */}
      <View className='card invite-card'>
        <Text className='invite-title'>邀请同事加入</Text>
        <View className='code-container'>
          <View className='code-label'>团队邀请码</View>
          <Text className='code-text'>{teamInfo.inviteCode}</Text>
          <Button className='copy-btn' onClick={handleCopyCode}>
            <Text className='icon'>❐</Text>
          </Button>
        </View>
        <Text className='invite-desc'>发送邀请码给同事，对方在 App 中输入即可加入</Text>
      </View>

      {/* 3. Member List */}
      <View className='section-title'>成员列表 ({teamInfo.members.length})</View>
      <View className='member-list'>
        {teamInfo.members.map(member => (
          <View key={member.id} className='member-item'>
            <View className='left'>
              <Image src={member.avatar} className='avatar' />
              <View className='info'>
                <View className='name-row'>
                  <Text className='name'>{member.name}</Text>
                  {member.role === 'admin' && <Text className='admin-badge'>👑 超级管理员</Text>}
                </View>
                <Text className='role-text'>{member.role === 'admin' ? '管理员' : '核心成员'}</Text>
              </View>
            </View>
            
            {/* Admin actions: Cannot remove self */}
            {isAdmin && !member.isMe && (
              <View className='action-btn' onClick={() => handleRemoveMember(member)}>
                <Image src={deleteIcon} className='icon' />
              </View>
            )}
          </View>
        ))}
      </View>

      {/* 4. Danger Zone - Fixed Bottom */}
      <View className='danger-zone-placeholder' />
      <View className='danger-zone'>
        {isAdmin ? (
          <Button className='danger-btn dissolve' onClick={handleDissolveTeam}>
             解散团队
          </Button>
        ) : (
          <Button className='danger-btn leave' onClick={handleLeaveTeam}>
            退出团队
          </Button>
        )}
      </View>
    </View>
  )
}
