import { useState, useCallback, useMemo } from 'react';
import dayjs from 'dayjs';
import { getMonthDaysStatus, isWorkDay } from '../services/core';
import { saveRecord, getRecord } from '../services/storage';
import { RECORD_TYPES } from '../constants/config';
import Taro from '@tarojs/taro';

export const useCalendar = () => {
  const [currentDate, setCurrentDate] = useState(dayjs());
  const [days, setDays] = useState([]);

  // 允许外部传入 date 来更新内部 currentDate
  const setDate = useCallback((date) => {
    setCurrentDate(dayjs(date));
  }, []);

  const loadDays = useCallback(() => {
    const year = currentDate.year();
    const month = currentDate.month() + 1;
    const daysData = getMonthDaysStatus(year, month);
    setDays(daysData);
  }, [currentDate]);

  // Derived state for CalendarCard value (Date[])
  const officeDates = useMemo(() => {
    return days
      .filter(d => d.status === RECORD_TYPES.OFFICE)
      .map(d => new Date(d.date.replace(/-/g, '/'))); // iOS/Safari compatibility
  }, [days]);

  const toggleAttendance = useCallback((dateStr) => {
    const record = getRecord(dateStr);
    
    // 如果当前是请假，单击先清除请假状态
    if (record === RECORD_TYPES.LEAVE) {
      saveRecord(dateStr, null);
      loadDays();
      return;
    }

    // 如果不是工作日，也不能标记
    if (!isWorkDay(dateStr)) {
      Taro.showToast({ title: '非工作日不可打卡', icon: 'none' });
      return;
    }

    // 切换状态: 有 -> 无, 无 -> 有
    const newType = record === RECORD_TYPES.OFFICE ? null : RECORD_TYPES.OFFICE;
    saveRecord(dateStr, newType);
    
    // 重新加载数据
    loadDays();
    
    // 反馈
    if (newType === RECORD_TYPES.OFFICE) {
      Taro.vibrateShort();
    }
  }, [loadDays]);

  const toggleLeave = useCallback((dateStr) => {
    const record = getRecord(dateStr);

    // 限制：仅允许在“工作日”长按标记请假，周末不可标记
    if (!isWorkDay(dateStr)) {
      Taro.showToast({ title: '非工作日无需请假', icon: 'none' });
      return;
    }

    // 切换状态: Leave -> None, Others -> Leave
    const newType = record === RECORD_TYPES.LEAVE ? null : RECORD_TYPES.LEAVE;
    saveRecord(dateStr, newType);

    // 重新加载数据
    loadDays();

    // 震动反馈
    Taro.vibrateShort();
  }, [loadDays]);

  // 批量更新 (用于 CalendarCard 的 onChange)
  const handleBatchChange = useCallback((newDates) => {
    // newDates 是当前选中的所有日期 (Date[])
    // 我们需要对比 officeDates 和 newDates 来决定哪些被选中了，哪些被取消了
    // 注意：CalendarCard 的 onChange 返回的是所有选中的日期
    // 我们可以简单地遍历 days，如果 date 在 newDates 里且不是 Office -> 设为 Office
    // 如果 date 不在 newDates 里且是 Office -> 设为 null
    // 但是要注意 Leave 状态不要被误伤？
    // 如果一个 Leave 日期被用户点击选中了，它会出现在 newDates 里（因为 CalendarCard 认为它被选中了）
    // 这时候我们应该把它设为 OFFICE（覆盖 Leave）。
    // 如果一个 Leave 日期没被点击，它不在 newDates 里（因为它本来就不是 Office，不在初始 value 里）。
    // 所以逻辑是：
    // 1. 遍历 newDates，把它们都设为 OFFICE (saveRecord)
    // 2. 遍历 oldOfficeDates (即当前的 officeDates)，如果不在 newDates 里，设为 null
    
    const newDateStrs = newDates.map(d => dayjs(d).format('YYYY-MM-DD'));
    
    // 1. 处理新增/保持的 Office
    newDateStrs.forEach(dateStr => {
        const currentRecord = getRecord(dateStr);
        if (currentRecord !== RECORD_TYPES.OFFICE) {
             // 可能是 null 或 LEAVE，都覆盖为 OFFICE
             // 这里加个校验：非工作日不能打卡？
             if (isWorkDay(dateStr)) {
                 saveRecord(dateStr, RECORD_TYPES.OFFICE);
             }
        }
    });

    // 2. 处理被取消的 Office
    // 我们可以利用 days 数据，因为它包含了当前月所有的状态
    days.forEach(day => {
        if (day.status === RECORD_TYPES.OFFICE && !newDateStrs.includes(day.date)) {
            saveRecord(day.date, null);
        }
    });

    loadDays();
  }, [days, loadDays]);

  const prevMonth = () => {
    setCurrentDate(d => d.subtract(1, 'month'));
  };

  const nextMonth = () => {
    setCurrentDate(d => d.add(1, 'month'));
  };

  return {
    year: currentDate.year(),
    month: currentDate.month() + 1,
    days,
    officeDates, // Export this
    loadDays,
    toggleAttendance,
    toggleLeave,
    handleBatchChange, // Export this
    prevMonth,
    nextMonth,
    setDate
  };
};
