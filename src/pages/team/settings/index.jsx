import { View, Text, Image, Button, Input } from '@tarojs/components'
import React, { useState, useEffect } from 'react'
import Taro, { useRouter } from '@tarojs/taro'
import dayjs from 'dayjs'
import { getTeamDetail, updateTeamName, removeMember, leaveTeam, deleteTeam } from '../../../services/team'
import deleteIcon from '../../../assets/delete.png'
import './index.scss'

export default function TeamSettings() {
  const router = useRouter()
  const [teamInfo, setTeamInfo] = useState(null)
  
  // Get teamId from params
  const teamId = router.params.teamId

  useEffect(() => {
    loadTeamData()
  }, [teamId])

  const loadTeamData = async () => {
    console.log('Loading team data for teamId:', teamId)
    // 1. Get UserId
    const userId = Taro.getStorageSync('userId')
    
    // 2. Try Cache
    let cached = null
    const cacheKey = userId ? `team_detail_${userId}_${teamId}` : null
    
    if (cacheKey) {
        cached = Taro.getStorageSync(cacheKey)
    }

    if (cached && cached.baseInfo) {
       console.log('Fetched team data from cache:', cached)
       updateStateFromData(cached)
    } else {
      // 3. Fetch from API if no cache
      Taro.showLoading({ title: '加载中...' })
      try {
         const res = await getTeamDetail(teamId)
         
         // Update Cache
         const { members } = res
         const newData = {
              teamId,
              baseInfo: res.baseInfo,
              members
         }
         
         if (cacheKey) {
             Taro.setStorageSync(cacheKey, newData)
         }
         console.log('Fetched team data:', newData)
         updateStateFromData(newData)
         Taro.hideLoading()
      } catch (err) {
         Taro.hideLoading()
         Taro.showToast({ title: '数据加载失败', icon: 'none' })
         setTimeout(() => Taro.navigateBack(), 1500)
      }
    }
  }

  const updateStateFromData = (data) => {
      const { baseInfo, members } = data
      
      // 找到当前用户的角色
      const myInfo = members.find(m => m.isMe)
      const myRole = myInfo ? (myInfo.role || 'member') : 'member'
      
      // 格式化成员列表
      const formattedMembers = members.map(m => ({
        id: m.userId, 
        name: m.name,
        avatar: m.avatar,
        role: m.role || 'member',
        isMe: m.isMe
      }))

      setTeamInfo({
        id: teamId,
        name: baseInfo.name,
        inviteCode: baseInfo.inviteCode,
        createdAt: dayjs(baseInfo.createdAt).format('YYYY年MM月DD日'),
        memberCount: members.length, // summary is deprecated in getTeamDetail
        currentUserRole: myRole,
        ownerId: baseInfo.ownerId,
        members: formattedMembers
      })
  }

  const handleCopyCode = () => {
    Taro.setClipboardData({
      data: teamInfo.inviteCode,
      success: () => Taro.showToast({ title: '邀请码已复制', icon: 'success' })
    })
  }

  const handleRename = () => {
    if (teamInfo.currentUserRole !== 'admin') return

    Taro.showModal({
      title: '修改团队名称',
      editable: true,
      placeholderText: teamInfo.name,
      success: async (res) => {
        if (res.confirm && res.content && res.content !== teamInfo.name) {
          Taro.showLoading({ title: '修改中...' })
          try {
            await updateTeamName(teamId, res.content)
            
            Taro.hideLoading()
            Taro.showToast({ title: '修改成功', icon: 'success' })
            // 清除缓存，强制主页刷新
            const userId = Taro.getStorageSync('userId')
            if (userId && teamId) Taro.removeStorageSync(`team_detail_${userId}_${teamId}`)
            // 更新本地状态
            setTeamInfo(prev => ({ ...prev, name: res.content }))
          } catch (err) {
            console.error('Rename team error:', err)
            Taro.hideLoading()
            Taro.showToast({ title: err.message || '修改失败', icon: 'none' })
          }
        }
      }
    })
  }

  const handleRemoveMember = (member) => {
    Taro.showModal({
      title: '移除成员',
      content: `确定要将 ${member.name} 移出团队吗？`,
      confirmColor: '#FF4D4F',
      success: async (res) => {
        if (res.confirm) {
          Taro.showLoading({ title: '移除中...' })
          try {
            await removeMember(teamId, member.id)
            
            Taro.hideLoading()
            Taro.showToast({ title: '已移除', icon: 'success' })
            // 清除缓存
            const userId = Taro.getStorageSync('userId')
            if (userId && teamId) Taro.removeStorageSync(`team_detail_${userId}_${teamId}`)
            // 更新本地状态
            setTeamInfo(prev => ({
              ...prev,
              members: prev.members.filter(m => m.id !== member.id),
              memberCount: prev.memberCount - 1
            }))
          } catch (err) {
            Taro.hideLoading()
            Taro.showToast({ title: err.message || '操作失败', icon: 'none' })
          }
        }
      }
    })
  }

  const handleLeaveTeam = () => {
    Taro.showModal({
      title: '退出团队',
      content: '确认退出该团队？退出后将无法查看团队数据。',
      confirmColor: '#FF4D4F',
      success: async (res) => {
        if (res.confirm) {
          Taro.showLoading({ title: '退出中...' })
          try {
            await leaveTeam(teamId)
            
            Taro.hideLoading()
            Taro.showToast({ title: '已退出', icon: 'success' })
            const userId = Taro.getStorageSync('userId')
            if (userId && teamId) Taro.removeStorageSync(`team_detail_${userId}_${teamId}`)
            setTimeout(() => Taro.reLaunch({ url: '/pages/index/index' }), 1500)
          } catch (err) {
            Taro.hideLoading()
            Taro.showToast({ title: err.message || '退出失败', icon: 'none' })
          }
        }
      }
    })
  }

  const handleDissolveTeam = () => {
    Taro.showModal({
      title: '解散团队',
      content: '解散团队后，所有成员将被移除，相关数据将被删除，且不可恢复！是否继续？',
      confirmColor: '#FF4D4F',
      success: async (res) => {
        if (res.confirm) {
           Taro.showLoading({ title: '解散中...' })
          try {
            await deleteTeam(teamId)
            
            Taro.hideLoading()
            Taro.showToast({ title: '团队已解散', icon: 'success' })
            const userId = Taro.getStorageSync('userId')
            if (userId && teamId) Taro.removeStorageSync(`team_detail_${userId}_${teamId}`)
            setTimeout(() => Taro.reLaunch({ url: '/pages/index/index' }), 1500)
          } catch (err) {
            Taro.hideLoading()
            Taro.showToast({ title: err.message || '解散失败', icon: 'none' })
          }
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
