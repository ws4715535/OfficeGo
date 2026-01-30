import React, { useState } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { View, Text, Button, Image, Input, Swiper, SwiperItem } from '@tarojs/components'
import { Skeleton, pxTransform, PullToRefresh } from '@nutui/nutui-react-taro'
import { joinTeam, createTeam, getTeamByInviteCode, getMyTeams } from '../../services/team'
import { useTeam } from '../../hooks/useTeam'
import EmptyState from './empty/index'
import downIcon from '../../assets/down.png'
import settingIcon from '../../assets/setting.png'
import grassIcon from '../../assets/grass.png'
import leftIcon from '../../assets/left.png'
import rightIcon from '../../assets/right.png'
import './index.scss'

// 工具函数：获取日期在周中的索引
const getDayIndex = (date) => {
  return new Date(date).getDay()
}

// 工具函数：获取周的开始日期（周日）
const getStartOfWeek = (date) => {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

export default function Team() {
  // 使用 useTeam Hook 管理所有数据逻辑
  const { state, loading, initialize, refresh, switchTeam, changeDate, changeWeek } = useTeam()

  // Modal 状态
  const [showJoinModal, setShowJoinModal] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [inviteCode, setInviteCode] = useState('')
  const [newTeamName, setNewTeamName] = useState('')
  const [previewTeam, setPreviewTeam] = useState(null)

  const todayIndex = getDayIndex(new Date())

  // 页面显示时初始化
  useDidShow(() => {
    initialize()
  })

  // 切换团队
  const handleSwitchTeam = () => {
    const teamNames = state.myTeams.map(t => t.name)
    const options = [...teamNames, '加入其他团队']
    
    Taro.showActionSheet({
      itemList: options,
      success: (res) => {
        const index = res.tapIndex
        if (index < state.myTeams.length) {
          const targetTeam = state.myTeams[index]
          if (targetTeam.teamId === state.currentTeam?.teamId) return
          switchTeam(targetTeam.teamId)
        } else {
          setTimeout(() => {
            setShowJoinModal(true)
          }, 350)
        }
      },
      fail: (res) => {
        if (res.errMsg && res.errMsg.includes('cancel')) return
        console.error(res.errMsg)
      }
    })
  }

  // 加入团队 - 验证邀请码
  const handleJoinConfirm = async () => {
    // 如果已有预览，确认加入
    if (previewTeam) {
      Taro.showLoading({ title: '加入中...' })
      try {
        const userInfo = Taro.getStorageSync('userInfo')
        await joinTeam(null, userInfo, previewTeam.teamId)
        Taro.hideLoading()
        Taro.showToast({ title: '加入成功', icon: 'success' })
        setShowJoinModal(false)
        setPreviewTeam(null)
        setInviteCode('')
        // 刷新团队列表
        await refresh('full')
      } catch (err) {
        Taro.hideLoading()
        Taro.showToast({ title: err.message || '加入失败', icon: 'none' })
      }
      return
    }

    // 验证邀请码
    const code = inviteCode.trim().toUpperCase()
    if (code.length < 6) {
      Taro.showToast({ title: '请输入6位团队邀请码', icon: 'none' })
      return
    }
    
    Taro.showLoading({ title: '验证中...' })
    try {
      const res = await getTeamByInviteCode(code)
      Taro.hideLoading()
      setPreviewTeam(res)
    } catch (err) {
      Taro.hideLoading()
      Taro.showToast({ title: err.message || '验证失败', icon: 'none' })
    }
  }

  // 关闭加入模态框
  const handleCloseJoinModal = () => {
    setShowJoinModal(false)
    setPreviewTeam(null)
    setInviteCode('')
  }

  // 创建团队
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
      // 刷新团队列表
      await refresh('full')
    } catch (err) {
      Taro.hideLoading()
      Taro.showToast({ title: err.message || '创建失败', icon: 'none' })
    }
  }

  // 下拉刷新
  const handleRefresh = async () => {
    return new Promise(async (resolve) => {
      try {
        await refresh('full')
        Taro.showToast({ title: '刷新成功', icon: 'success' })
        resolve('done')
      } catch (e) {
        console.error('Refresh failed', e)
        Taro.showToast({ title: '刷新失败', icon: 'none' })
        resolve('done')
      }
    })
  }

  // 获取周日期范围文本
  const getWeekDateRange = () => {
    const monday = new Date(state.currentWeekStart)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    
    const formatDate = (date) => `${date.getMonth() + 1}月${date.getDate()}日`
    return `${formatDate(monday)}-${formatDate(sunday)}`
  }

  // 渲染骨架屏
  const renderSkeleton = () => (
    <View className='team-page skeleton-mode'>
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

  // 渲染空状态
  const renderEmpty = () => (
    <View className='team-page empty'>
      <EmptyState 
        onJoin={() => setShowJoinModal(true)} 
        onCreate={() => setShowCreateModal(true)} 
      />
      {renderModals()}
    </View>
  )

  // 渲染活动视图
  const renderActive = () => {
    const weekLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    
    // 计算选中日期文本
    const selectedDateObj = new Date(state.currentWeekStart)
    selectedDateObj.setDate(selectedDateObj.getDate() + state.selectedDay)
    const dateText = `${selectedDateObj.getMonth() + 1}月${selectedDateObj.getDate()}日`
    const isToday = state.selectedDay === todayIndex && 
                    state.currentWeekStart.getTime() === getStartOfWeek(new Date()).getTime()
    const dayLabel = isToday ? '今天' : weekLabels[state.selectedDay]
    const fullDateText = `${dateText} ${dayLabel}`

    return (
      <PullToRefresh
        style={{ backgroundColor: 'transparent' }}
        onRefresh={handleRefresh}
      >
        <View className='team-page'>
          {/* 1. Header with Team Switcher */}
          <View className='page-header'>
            <View className='team-switcher' onClick={handleSwitchTeam}>
              <Text className='title'>{state.currentTeam?.name}</Text>
              <Image src={downIcon} className='arrow-icon' />
            </View>
            <View className='header-actions'>
              <View 
                className='action-btn icon-only' 
                onClick={() => Taro.navigateTo({ url: `/pages/team/settings/index?teamId=${state.currentTeam?.teamId}` })}
              >
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
                  <Text className='main-date'>{state.bestDayInfo.dayName}</Text>
                  <Text className='desc'>{state.bestDayInfo.desc}</Text>
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
                  {state.topWorker && Array.isArray(state.topWorker) && state.topWorker.length > 0 ? (
                    <Swiper
                      className='winner-swiper'
                      vertical
                      autoplay
                      interval={2000}
                      duration={500}
                      circular
                    >
                      {state.topWorker.map((worker, index) => (
                        <SwiperItem key={index}>
                          <View className='winner-slide'>
                            <View className='winner-info'>
                              <Image 
                                className='winner-avatar' 
                                src={worker.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${worker.name}`} 
                              />
                              <Text className='main-date'>{worker.name}</Text>
                            </View>
                            <Text className='desc'>本周标记到办公室 {worker.count} 天，是团队的定海神针！</Text>
                          </View>
                        </SwiperItem>
                      ))}
                    </Swiper>
                  ) : state.topWorker && !Array.isArray(state.topWorker) ? (
                    <>
                      <View className='winner-info'>
                        <Image 
                          className='winner-avatar' 
                          src={state.topWorker.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${state.topWorker.name}`} 
                        />
                        <Text className='main-date'>{state.topWorker.name}</Text>
                      </View>
                      <Text className='desc'>本周标记到办公室 {state.topWorker.count} 天，是团队的定海神针！</Text>
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

          {/* 3. Week Distribution */}
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
              {loading.stats ? (
                <Skeleton animated height={pxTransform(160)} width={pxTransform(320)} />
              ) : (
                weekLabels.map((label, index) => {
                  const stat = state.weeklyStats[index] || { ratio: 0 }
                  const barHeight = stat.ratio > 0 ? `${stat.ratio * 100}%` : '5%'
                  
                  return (
                    <View 
                      key={index} 
                      className={`day-column ${state.selectedDay === index ? 'active' : ''}`}
                      onClick={() => changeDate(index)}
                    >
                      <View className='bar-container'>
                        <View 
                          className='bar' 
                          style={{ height: barHeight }} 
                        />
                      </View>
                      <Text className='day-label'>{label}</Text>
                      {index === todayIndex && state.currentWeekStart.getTime() === getStartOfWeek(new Date()).getTime() && (
                        <View className='today-dot' />
                      )}
                    </View>
                  )
                })
              )}
            </View>
          </View>

          {/* 4. Member List */}
          <View className='section-container'>
            <View className='list-header'>
              <Text className='section-title'>
                谁在 Office ({fullDateText})
                <Text className='member-count'>（{state.members.filter(m => m.status === 'OFFICE').length}人）</Text>
              </Text>
            </View>
            
            {loading.members ? (
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
                {state.members.filter(m => m.status === 'OFFICE').map(member => (
                  <View key={member.id} className='member-card'>
                    <View className='avatar-container'>
                      <Image 
                        src={member.avatar} 
                        className='avatar' 
                        onError={(e) => {
                          e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${member.name}`
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
                        <Text className='status-text'>{member.statusText}</Text>
                      </View>
                    </View>

                    <View className={`status-tag ${member.status === 'OFFICE' ? 'office' : 'remote'}`}>
                      <Text>{member.tagText}</Text>
                    </View>
                  </View>
                ))}
                {state.members.filter(m => m.status === 'OFFICE').length === 0 && (
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

  // 渲染模态框
  const renderModals = () => {
    if (!showJoinModal && !showCreateModal) return null
    
    return (
      <>
        {/* Join Modal */}
        {showJoinModal && (
          <View className='modal-overlay'>
            <View className='modal-card'>
              {previewTeam ? (
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

  // 主渲染
  switch(state.viewState) {
    case 'loading': return renderSkeleton()
    case 'empty': return renderEmpty()
    case 'active': return renderActive()
    default: return renderSkeleton()
  }
}
