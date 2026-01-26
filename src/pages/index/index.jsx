import React, { useState, useEffect } from 'react'
import Taro, { useDidShow, useReady } from '@tarojs/taro'
import { View, Text, Button, Image } from '@tarojs/components'
import { Check } from '@nutui/icons-react-taro'
import settingIcon from '../../assets/setting.png'
import statisticIcon from '../../assets/statistic.png'
import timeIcon from '../../assets/time.png'
import takeoffIcon from '../../assets/takeoff.png'
import targetIcon from '../../assets/target.png'
import rightArrowIcon from '../../assets/right_arrow.png'
import { useDashboard } from '../../hooks/useDashboard'
import AuthService from '../../services/auth'
import './index.scss'

export default function Index() {
  const { year, month, stats } = useDashboard()
  const [userInfo, setUserInfo] = useState({ nickName: '来了么到岗助手!', avatarUrl: '' })

  useReady(async () => {
    // 0. Check Login Status first
    const userId = Taro.getStorageSync('userId')
    if (!userId) {
        // Not logged in, skip fetching user profile
        return
    }

    // 1. Load User Info from Cloud
    const userData = await AuthService.getUserProfile()
    if (userData) {
        setUserInfo({
            nickName: userData.nickName || 'User',
            avatarUrl: userData.avatarUrl || ''
        })
    }
  })

  useDidShow(async () => {
    // 1. Check Login Status (Auth)
    const userId = Taro.getStorageSync('userId')
    if (!userId) {
        // Redirect to Onboarding (Login)
        Taro.reLaunch({ url: '/pages/onboarding/index' })
        return
    }

    // 2. Check Onboarding Flag
    const isOnboarded = Taro.getStorageSync('isOnboarded')
    if (!isOnboarded) {
        Taro.reLaunch({ url: '/pages/onboarding/index' })
        return
    }

    // 3. Load User Info
    const localUser = Taro.getStorageSync('userInfo')
    if (localUser) {
        setUserInfo({
            nickName: localUser.nickName || 'User',
            avatarUrl: localUser.avatarUrl || ''
        })
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
            <View className='avatars'>
                {['A', 'B', 'C'].map((_, i) => (
                    <Image 
                        key={i} 
                        src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${i}`} 
                        className='avatar' 
                        style={{ zIndex: 3-i, marginLeft: i > 0 ? '-16rpx' : 0, opacity: 1 }} 
                    />
                ))}
            </View>
            <Text className='banner-text'>加入团队，看看他们来了么！</Text>
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
           <Image src={timeIcon} style={{ width: '48rpx', height: '48rpx' }} />
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
              <Image src={targetIcon} style={{ width: '32rpx', height: '32rpx' }} />
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
