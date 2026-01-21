import { View, Text } from '@tarojs/components'
import React, { useRef, useState, useEffect } from 'react'
import { CalendarCard } from '@nutui/nutui-react-taro'
import { ArrowLeft, ArrowRight } from '@nutui/icons-react-taro'
import dayjs from 'dayjs'
import classNames from 'classnames'
import { useCalendar } from '../../hooks/useCalendar'
import { RECORD_TYPES } from '../../constants/config'
import './index.scss'

export default function Calendar() {
  const { loadDays, toggleLeave, days, setDate, officeDates, handleBatchChange } = useCalendar();
  const [currentDate, setCurrentDate] = useState(new Date())
  const calendarRef = useRef(null)

  useEffect(() => {
    setDate(currentDate);
  }, [currentDate, setDate])

  // Custom Header
  const handlePrevMonth = () => {
    calendarRef.current?.jump(-1);
  }

  const handleNextMonth = () => {
    calendarRef.current?.jump(1);
  }

  const renderHeader = () => {
    return (
      <View className='custom-header'>
        <Text className='page-title'>记录</Text>
        <View className='month-switcher'>
          <View className='arrow-btn' onClick={handlePrevMonth}>
            <ArrowLeft size={14} color='#666' />
          </View>
          <Text className='current-month'>
            {dayjs(currentDate).format('YYYY年M月')}
          </Text>
          <View className='arrow-btn' onClick={handleNextMonth}>
            <ArrowRight size={14} color='#666' />
          </View>
        </View>
      </View>
    )
  }

  // 渲染日期内容
  // 仅负责显示数字和"请假"状态的特殊样式
  // "到岗"(Office) 状态由 CalendarCard 的 type="multiple" 自动处理选中样式
  const renderDay = (day) => {
    // day: { year, month, date, type }
    const dayJsDate = dayjs(`${day.year}-${day.month}-${day.date}`);
    const dateStr = dayJsDate.format('YYYY-MM-DD');
    const dayData = days.find(d => d.date === dateStr);
    
    const isCurrentMonth = day.type === 'current';
    const isToday = dayJsDate.isSame(dayjs(), 'day');
    const isWeekend = dayJsDate.day() === 0 || dayJsDate.day() === 6;
    
    const isLeave = dayData?.status === RECORD_TYPES.LEAVE;
    const isOffice = dayData?.status === RECORD_TYPES.OFFICE;
    
    if (!isCurrentMonth) {
      return <View className='day-cell other-month'><Text>{day.date}</Text></View>;
    }

    return (
      <View 
        className={classNames('', {
          'is-weekend': isWeekend,
          'is-today': isToday,
          'is-leave': isLeave,
          'is-office': isOffice,
        })}
        onLongPress={(e) => {
          e.stopPropagation();
          toggleLeave(dateStr);
        }}
      >
        <Text className='day-text'>{day.date}</Text>
      </View>
    );
  }

  const handlePageChange = (val) => {
    const newDate = new Date(val.year, val.month - 1, 1);
    setCurrentDate(newDate);
  }

  return (
    <View className='calendar-page'>
      {renderHeader()}


        <CalendarCard
          ref={calendarRef}
          type="multiple"
          value={officeDates} // 绑定已到岗日期
          onChange={handleBatchChange} // 处理选中变化
          onPageChange={handlePageChange}
          renderDay={renderDay}
          firstDayOfWeek={0}
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
