import { View, Text, Image } from '@tarojs/components'
import React, { useRef, useState, useEffect, useMemo } from 'react'
import dayjs from 'dayjs'
import classNames from 'classnames'
import CustomCalendar from '../../components/CustomCalendar'
import { useCalendar } from '../../hooks/useCalendar'
import { RECORD_TYPES } from '../../constants/config'
import leftIcon from '../../assets/left.png'
import rightIcon from '../../assets/right.png'
import './index.scss'

export default function Calendar() {
  const { loadDays, toggleLeave, days, setDate, officeDates, handleBatchChange } = useCalendar();
  const [currentDate, setCurrentDate] = useState(new Date())
  
  useEffect(() => {
    setDate(currentDate);
  }, [currentDate, setDate])

  // 1. Prepare Data for CustomCalendar
  const officeDateStrs = useMemo(() => {
    return officeDates.map(d => dayjs(d).format('YYYY-MM-DD'));
  }, [officeDates]);

  const leaveDateStrs = useMemo(() => {
    return days
      .filter(d => d.status === RECORD_TYPES.LEAVE)
      .map(d => d.date);
  }, [days]);

  // Mock Data
  const marks = {
    '2026-01-01': { topText: '休', topColor: '#EF4444', bottomText: '元旦', isHoliday: true },
    '2026-02-14': { bottomDot: true, bottomColor: '#EC4899' },
    '2026-01-24': { bottomText: '除夕', isHoliday: true },
    '2026-01-25': { topText: '休', topColor: '#EF4444', bottomText: '春节', isHoliday: true },
  };

  // 2. Handlers
  const handleSelect = (date, newList) => {
    // CustomCalendar returns the new list of strings.
    // We need to pass this to handleBatchChange which expects Date objects or strings (we verified it maps strings).
    // But wait, handleBatchChange logic:
    // It compares "new list" vs "current list" to upsert/delete.
    // So passing the newList (strings) should work if handleBatchChange handles strings.
    // Let's check handleBatchChange in useCalendar again. 
    // const newDateStrs = newDates.map(d => dayjs(d).format('YYYY-MM-DD')); 
    // dayjs('2026-01-01') works.
    handleBatchChange(newList);
  };

  const handleLongPress = (date) => {
    toggleLeave(date);
  };

  // Custom Header
  const handlePrevMonth = () => {
    setCurrentDate(d => dayjs(d).subtract(1, 'month').toDate());
  }

  const handleNextMonth = () => {
    setCurrentDate(d => dayjs(d).add(1, 'month').toDate());
  }

  const renderHeader = () => {
    return (
      <View className='custom-header'>
        <Text className='page-title'>记录</Text>
        <View className='month-switcher'>
          <View className='arrow-btn' onClick={handlePrevMonth}>
            <Image src={leftIcon} className='nav-icon' />
          </View>
          <Text className='current-month'>
            {dayjs(currentDate).format('YYYY年M月')}
          </Text>
          <View className='arrow-btn' onClick={handleNextMonth}>
            <Image src={rightIcon} className='nav-icon' />
          </View>
        </View>
      </View>
    )
  }

  return (
    <View className='calendar-page'>
      {renderHeader()}
      
      <CustomCalendar
        currentDate={currentDate}
        value={officeDateStrs}
        specialDates={leaveDateStrs}
        onSelect={handleSelect}
        onLongPress={handleLongPress}
        marks={marks}
        disableWeekend={true}
        config={{
          dayFontSize: '32rpx',
          headerTitleSize: '36rpx',
          selectedBgColor: '#5B5CEB', // 你的紫色
          selectedRadius: '4rpx',    // 20rpx 是圆角矩形，50% 是正圆，你可以试试哪个顺眼
        }}
      />

      <View className='legend-container'>
        <View className='legend-row'>
          <View className='dot office' />
          <Text className='legend-text'>点击标记 "来办公室"</Text>
        </View>
        <View className='legend-row'>
          <View className='dot leave' />
          <Text className='legend-text'>长按标记 "请假"</Text>
        </View>
      </View>
    </View>
  )
}
