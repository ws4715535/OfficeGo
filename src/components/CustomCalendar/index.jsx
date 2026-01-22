import React, { useState, useMemo } from 'react';
import { View, Text } from '@tarojs/components';
import classNames from 'classnames';
import './index.scss';

// --- 工具函数 ---
const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();
const formatDateStr = (year, month, day) => {
  const m = (month + 1).toString().padStart(2, '0');
  const d = day.toString().padStart(2, '0');
  return `${year}-${m}-${d}`;
};
const getPrevMonthLastDate = (year, month) => new Date(year, month, 0).getDate();
const isSameDay = (d1Str, d2) => d1Str === formatDateStr(d2.getFullYear(), d2.getMonth(), d2.getDate());

const CustomCalendar = ({
  value = [], // 选中的日期数组 ['2026-01-05']
  specialDates = [], // 特殊日期数组 ['2026-01-06'] (e.g. Leave)
  marks = {}, // 节假日标记 { '2026-01-01': { bottomText: '元旦', isHoliday: true, isWork: false } }
  onSelect,
  onLongPress,
  currentDate: propCurrentDate,
  onPageChange,
}) => {
  const [internalDate, setInternalDate] = useState(new Date());
  
  // 当前视图的月份
  const viewDate = useMemo(() => propCurrentDate ? new Date(propCurrentDate) : internalDate, [propCurrentDate, internalDate]);
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  
  // 真实的“今天”
  const todayDate = new Date();

  // 切换月份
  const handlePageChange = (diff) => {
    const newDate = new Date(year, month + diff, 1);
    if (!propCurrentDate) setInternalDate(newDate);
    onPageChange?.({ year: newDate.getFullYear(), month: newDate.getMonth() + 1 });
  };

  // 生成日历数据
  const calendarDays = useMemo(() => {
    const daysInMonth = getDaysInMonth(year, month);
    const firstDayWeek = getFirstDayOfMonth(year, month); 
    const prevMonthLastDate = getPrevMonthLastDate(year, month);
    const days = [];

    // 1. 上月占位
    for (let i = 0; i < firstDayWeek; i++) {
      const dayNum = prevMonthLastDate - firstDayWeek + 1 + i;
      const d = new Date(year, month - 1, dayNum);
      days.push({ type: 'prev', day: dayNum, dateStr: formatDateStr(year, month - 1, dayNum) });
    }
    // 2. 当月
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({ type: 'current', day: i, dateStr: formatDateStr(year, month, i) });
    }
    // 3. 下月补齐
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
        days.push({ type: 'next', day: i, dateStr: formatDateStr(year, month + 1, i) });
    }
    return days;
  }, [year, month]);

  const handleDayClick = (item) => {
    if (item.type !== 'current') return;
    
    // 公共假期（非调休上班）不可操作
    const mark = marks[item.dateStr];
    if (mark && mark.isHoliday && !mark.isWork) {
        return;
    }

    if (onSelect) {
      console.log("item:", item);
      const isSelected = value.includes(item.dateStr);
      const newValue = isSelected ? value.filter(d => d !== item.dateStr) : [...value, item.dateStr];
      onSelect(item.dateStr, newValue);
    }
  };

  const handleDayLongPress = (item) => {
    if (item.type !== 'current') return;
    // 公共假期（非调休上班）不可操作
    const mark = marks[item.dateStr];
    if (mark && mark.isHoliday && !mark.isWork) {
        return;
    }

    if (onLongPress) {
      console.log("onLongPress:", item);
      onLongPress(item.dateStr);
    }
  }

  return (
    <View className="custom-calendar">
      {/* 星期栏 */}
      <View className="calendar-week-header">
        {['日', '一', '二', '三', '四', '五', '六'].map((d) => (
          <View key={d} className="week-day">{d}</View>
        ))}
      </View>

      {/* 日期网格 */}
      <View className="calendar-grid">
        {calendarDays.map((item, index) => {
          const mark = marks[item.dateStr];
          const isSelected = value.includes(item.dateStr);
          const isSpecial = specialDates.includes(item.dateStr);
          const isToday = isSameDay(item.dateStr, todayDate);
          const isCurrentMonth = item.type === 'current';

          const cardClass = classNames('date-card', {
            'is-other-month': !isCurrentMonth,
            'is-special': isCurrentMonth && isSpecial, // Highest priority
            'is-selected': isCurrentMonth && isSelected && !isSpecial,
            'is-today': isCurrentMonth && isToday && !isSelected && !isSpecial,
            'is-normal': isCurrentMonth && !isToday && !isSelected && !isSpecial
          });

          return (
            <View 
              key={`${item.dateStr}-${index}`} 
              className="calendar-cell"
              onClick={() => handleDayClick(item)}
              onLongPress={() => handleDayLongPress(item)}
            >
              <View className={cardClass}>
                <Text className="date-text">{item.day}</Text>
                {/* 底部标记：假期名或"班" */}
                {isCurrentMonth && mark && (
                    <Text className={classNames('bottom-text', { 'is-work': mark.isWork, 'is-holiday': mark.isHoliday && !mark.isWork })}>
                        {mark.bottomText}
                    </Text>
                )}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
};

export default CustomCalendar;