import { View, Text, Button, Image } from '@tarojs/components'
import React, { useState, useEffect } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { Check } from '@nutui/icons-react-taro'
import settingIcon from '../../assets/setting.png'
import statisticIcon from '../../assets/statistic.png'
import timeIcon from '../../assets/time.png'
import takeoffIcon from '../../assets/takeoff.png'
import targetIcon from '../../assets/target.png'
import rightArrowIcon from '../../assets/right_arrow.png'
import { useDashboard } from '../../hooks/useDashboard'
import { TEAMS, getMembersForDay } from '../../services/mockTeamData'
import AuthService from '../../services/auth'
import './index.scss'

export default function Index() {
  const { year, month, stats } = useDashboard()
  const [teamState, setTeamState] = useState({
    hasTeam: false,
    officeMembers: [],
    totalOffice: 0
  })
  const [userInfo, setUserInfo] = useState({ nickName: '来了么到岗助手!', avatarUrl: '' })

  useDidShow(() => {
    // Check Onboarding
    const isOnboarded = Taro.getStorageSync('isOnboarded')
    if (!isOnboarded) {
        Taro.reLaunch({ url: '/pages/onboarding/index' })
        return
    }

    // Load User Info
    const localUser = Taro.getStorageSync('userInfo')
    if (localUser) {
        setUserInfo({
            nickName: localUser.nickName || 'User',
            avatarUrl: localUser.avatarUrl || ''
        })
    }

    // Check if user has any teams
    const hasTeam = TEAMS.length > 0
    
    if (hasTeam) {
      const today = new Date().getDay() - 1 // 0=Mon
      // Use currentTeam (first one) for MVP
      const members = getMembersForDay(TEAMS[0].id, today)
      const office = members.filter(m => m.status === 'OFFICE')
      
      setTeamState({
        hasTeam: true,
        officeMembers: office,
        totalOffice: office.length
      })
    } else {
      setTeamState({ hasTeam: false, officeMembers: [], totalOffice: 0 })
    }
  })

  const navigateToCalendar = () => {
    Taro.switchTab({ url: '/pages/calendar/index' })
  }

  const navigateToSettings = () => {
    Taro.navigateTo({ url: '/pages/settings/index' })
  }

  const handleBannerClick = () => {
    Taro.switchTab({ url: '/pages/team/index' })
  }

  return (
    <View className='dashboard'>
      {/* 1. Navbar */}
      <View className='navbar'>
        <View className='brand'>
          {userInfo.avatarUrl && <Image src={userInfo.avatarUrl} className='user-avatar-small' mode='aspectFill' />}
          <Text className='app-name'>Hi, {userInfo.nickName}</Text>
        </View>
        <View className='settings-icon' onClick={navigateToSettings}>
          <Image src={settingIcon} style={{ width: '32rpx', height: '32rpx' }} />
        </View>
      </View>

      {/* 2. Team Banner (New) */}
      <View className='team-banner-container'>
        <View className='team-banner' onClick={handleBannerClick}>
          {teamState.hasTeam ? (
            <>
              <View className='avatars'>
                {teamState.officeMembers.slice(0, 3).map((m, i) => (
                  <Image key={m.id} src={m.avatar} className='avatar' style={{ zIndex: 3-i, marginLeft: i > 0 ? '-16rpx' : 0 }} />
                ))}
              </View>
              <View className='banner-text'>
                <Text className='flip-wrapper'>
                  今天 {teamState.officeMembers[0]?.name || '大家'} 等 {teamState.totalOffice} 人在公司
                </Text>
              </View>
            </>
          ) : (
            <Text className='banner-text'>加入一个团队吧！</Text>
          )}
          
          <View className='arrow-btn'>
            <Image src={rightArrowIcon} className='arrow-icon' />
          </View>
        </View>
      </View>

      {/* 3. Hero Progress Card */}
      <View className='hero-card'>
        <View className='hero-header'>
          <View className='date-block'>
            <Text className='sub-date'>{year}年 {month}月</Text>
            <Text className='main-title'>到岗进度</Text>
          </View>
          <View className='percent-badge'>
            <Text>{stats.progress}%</Text>
          </View>
        </View>

        <View className='hero-progress'>
          <View className='progress-track'>
            <View 
              className='progress-bar' 
              style={{ width: `${stats.progress}%` }} 
            />
          </View>
        </View>

        <View className='hero-stats'>
          <View className='stat-col'>
            <Text className='label'>本月应到</Text>
            <Text className='value'>{stats.targetDays} <Text className='unit'>天</Text></Text>
          </View>
          <View className='stat-col'>
            <Text className='label'>已完成</Text>
            <Text className='value'>{stats.officeDays} <Text className='unit'>天</Text></Text>
          </View>
          <View className='stat-col'>
            <Text className='label'>还需去</Text>
            <Text className='value warning'>{stats.remainingDays} <Text className='unit'>天</Text></Text>
          </View>
        </View>
      </View>

      {/* 3. Details List */}
      <View className='details-section'>
        <View className='section-header'>
          <Image src={statisticIcon} style={{ width: '32rpx', height: '32rpx' }} />
          <Text className='title'>本月明细</Text>
        </View>
        
        <View className='details-card'>
          <View className='detail-row'>
            <View className='icon-box blue'>           
           <Image src={timeIcon} style={{ width: '40rpx', height: '40rpx' }} />
            </View>
            <Text className='row-label'>本月有效工作日</Text>
            <View className='row-value'>
              {stats.effectiveWorkDays !== stats.totalWorkDays && (
                <Text className='original-value'>{stats.totalWorkDays} 天</Text>
              )}
              <Text>{stats.effectiveWorkDays} 天</Text>
            </View>
          </View>
          
          <View className='divider' />

          <View className='detail-row'>
            <View className='icon-box orange'>
           <Image src={takeoffIcon} style={{ width: '40rpx', height: '40rpx' }} />
            </View>
            <Text className='row-label'>累计请假</Text>
            <Text className='row-value'>{stats.leaveDays} 天</Text>
          </View>

          <View className='divider' />

          <View className='detail-row'>
            <View className='icon-box green'>
              <Image src={targetIcon} style={{ width: '44rpx', height: '44rpx' }} />
            </View>
            <Text className='row-label'>本月总目标</Text>
            <Text className='row-value'>{stats.targetDays} 天</Text>
          </View>
        </View>
      </View>

      {/* 4. Action Button */}
      <View className='bottom-action'>
        <Button className='primary-btn' onClick={navigateToCalendar}>
          <Check size={20} color='#4F46E5' style={{ marginRight: '8px' }} />
          <Text>更新打卡/请假记录</Text>
        </Button>
      </View>
    </View>
  )
}
