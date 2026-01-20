import { View, Text, Button } from '@tarojs/components'
import Taro from '@tarojs/taro'
import React, { useState } from 'react'
import { Progress } from '@nutui/nutui-react-taro'
import { Setting, Clock, Check, Order, CheckDisabled } from '@nutui/icons-react-taro'
import { useDashboard } from '../../hooks/useDashboard'
import './index.scss'

export default function Index() {
  const { year, month, stats } = useDashboard()
  // const [scope, setScope] = useState('month') // MVP: 默认月度，暂时移除切换

  const navigateToCalendar = () => {
    Taro.switchTab({ url: '/pages/calendar/index' })
  }

  const navigateToSettings = () => {
    Taro.navigateTo({ url: '/pages/settings/index' })
  }

  return (
    <View className='dashboard'>
      {/* 1. Navbar */}
      <View className='navbar'>
        <View className='brand'>
          <Text className='app-name'>来了么到岗助手!</Text>
        </View>
        <View className='settings-icon' onClick={navigateToSettings}>
          <Text className='app-name'>设置</Text>
        </View>
      </View>

      {/* 2. Hero Progress Card */}
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
          <Order size={18} color='#333' />
          <Text className='title'>本月明细</Text>
        </View>
        
        <View className='details-card'>
          <View className='detail-row'>
            <View className='icon-box blue'>
              <Clock size={16} color='#4F46E5' />
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
              <CheckDisabled size={16} color='#EA580C' />
            </View>
            <Text className='row-label'>累计请假</Text>
            <Text className='row-value'>{stats.leaveDays} 天</Text>
          </View>

          <View className='divider' />

          <View className='detail-row'>
            <View className='icon-box green'>
              <Check size={16} color='#059669' />
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
