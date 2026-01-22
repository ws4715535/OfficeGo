import { View, Text, Image } from '@tarojs/components'
import React, { useRef, useState, useEffect, useMemo } from 'react'
import Taro from '@tarojs/taro'
import dayjs from 'dayjs'
import classNames from 'classnames'
import CustomCalendar from '../../components/CustomCalendar'
import { useCalendar } from '../../hooks/useCalendar'
import { RECORD_TYPES } from '../../constants/config'
import leftIcon from '../../assets/left.png'
import rightIcon from '../../assets/right.png'
import './index.scss'

// Safe require for holidayData
let defaultHolidayData = null;
try {
  defaultHolidayData = require('../../constants/holidayData.json');
} catch (e) {
  console.warn('Local holiday data not found');
}

export default function Calendar() {
  const { loadDays, toggleLeave, days, setDate, officeDates, handleBatchChange } = useCalendar();
  const [currentDate, setCurrentDate] = useState(new Date())
  const [holidayData, setHolidayData] = useState(null)
  
  // Initialize Holiday Data: Cache -> Cloud
  useEffect(() => {
    // 1. Try Cache
    const cached = Taro.getStorageSync('HOLIDAY_DATA');
    if (cached) {
        setHolidayData(cached);
    } else {
        // Fallback to local default if no cache
        if (defaultHolidayData) {
            setHolidayData(defaultHolidayData);
        }
    }

    // 2. Fetch from Cloud (Silent Update)
    Taro.cloud.callFunction({
        name: 'fetchHolidayData'
    }).then(res => {
        if (res.result && res.result.Years) {
            console.log('Holiday data updated from cloud');
            Taro.setStorageSync('HOLIDAY_DATA', res.result);
            setHolidayData(res.result);
        }
    }).catch(err => {
        console.error('Failed to fetch holiday data:', err);
    });
  }, []);

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

  // 2. Generate Marks from Holiday JSON
  const marks = useMemo(() => {
    if (!holidayData || !holidayData.Years) return {};
    
    const year = dayjs(currentDate).year();
    const holidays = holidayData.Years[year] || [];
    const markObj = {};

    holidays.forEach(h => {
        // 放假范围
        let curr = dayjs(h.StartDate);
        const end = dayjs(h.EndDate);
        while (curr.isBefore(end) || curr.isSame(end, 'day')) {
            const dateStr = curr.format('YYYY-MM-DD');
            markObj[dateStr] = {
                bottomText: h.Name, // 显示节日名
                isHoliday: true,
                isWork: false,
            };
            curr = curr.add(1, 'day');
        }

        // 调休补班
        if (h.CompDays) {
            h.CompDays.forEach(d => {
                markObj[d] = {
                    bottomText: '补班',
                    isHoliday: false, // 逻辑上不是假
                    isWork: true,     // 逻辑上是工作日
                };
            });
        }
    });
    return markObj;
  }, [currentDate, holidayData]);

  // 3. Month Summary
  const monthSummary = useMemo(() => {
    const year = dayjs(currentDate).year();
    const month = dayjs(currentDate).month(); // 0-11
    
    // 请假天数
    // Filter days in current month
    const leaveCount = days.filter(d => {
        const dDate = dayjs(d.date);
        return dDate.year() === year && dDate.month() === month && d.status === RECORD_TYPES.LEAVE;
    }).length;

    // 公共假期详情
    const holidays = (holidayData && holidayData.Years && holidayData.Years[year]) || [];
    const holidayDetails = holidays.filter(h => {
        const start = dayjs(h.StartDate);
        const end = dayjs(h.EndDate);
        // Check if holiday overlaps with current month
        // Simple check: start or end is in this month
        return (start.year() === year && start.month() === month) || 
               (end.year() === year && end.month() === month);
    }).map(h => {
        let desc = `${h.Name} ${dayjs(h.StartDate).format('M.D')}-${dayjs(h.EndDate).format('M.D')}`;
        if (h.CompDays && h.CompDays.length > 0) {
            const compDates = h.CompDays.map(d => dayjs(d).format('M.D')).join('、');
            desc += ` (${compDates}补班)`;
        }
        return desc;
    });

    return {
        leaveCount,
        holidayDetails // Array of strings
    };
  }, [currentDate, days, holidayData]);

  // 4. Handlers
  const handleSelect = (date, newList) => {
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
        <View className='legend-row'>
          <View className='dot leave' />
             <Text className='legend-text'>本月请假 {monthSummary.leaveCount} 天</Text>
        </View>
        <View className='legend-row'>
          <View className='dot leave' />
          <Text className='legend-text'>本月公共假期: </Text>
                   {monthSummary.holidayDetails && monthSummary.holidayDetails.length > 0 && (
             monthSummary.holidayDetails.map((detail, idx) => (
                    <Text className='legend-text'>{detail}</Text>
             ))
         )}
        </View>
      </View>
    </View>
  )
}
