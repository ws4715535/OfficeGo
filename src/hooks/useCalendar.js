import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import dayjs from 'dayjs';
import { getMonthDaysStatus, isWorkDay } from '../services/core';
import { saveRecord, getRecord, getAllRecords } from '../services/storage';
import { RECORD_TYPES } from '../constants/config';
import AttendanceService from '../services/attendance';
import Taro from '@tarojs/taro';

export const useCalendar = () => {
  const [currentDate, setCurrentDate] = useState(dayjs());
  const [days, setDays] = useState([]);
  
  // Cloud Sync State
  const pendingChanges = useRef({});
  const debounceTimer = useRef(null);

  // Flush changes to cloud
  const flushChanges = useCallback(async () => {
    const changes = pendingChanges.current;
    if (Object.keys(changes).length === 0) return;
    
    // Clear pending changes immediately to avoid duplicates
    pendingChanges.current = {};
    
    console.log('Flushing changes to cloud:', changes);
    
    // Show loading
    Taro.showNavigationBarLoading();
    
    try {
        const promises = Object.keys(changes).map(date => {
            const status = changes[date];
            if (status === null) {
                return AttendanceService.deleteRecord(date).catch(err => {
                    console.error(`Failed to delete record for ${date}:`, err);
                });
            } else {
                return AttendanceService.upsertRecord({ date, status }).catch(err => {
                    console.error(`Failed to upsert record for ${date}:`, err);
                });
            }
        });
        
        await Promise.all(promises);
    } finally {
        // Hide loading
        Taro.hideNavigationBarLoading();
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        flushChanges();
      }
    };
  }, [flushChanges]);

  // Unified update handler with debounce
  const updateDateStatus = useCallback((dateStr, status) => {
    // 1. Update Local Storage (Sync)
    saveRecord(dateStr, status);
    
    // 2. Queue for Cloud Sync
    pendingChanges.current[dateStr] = status;
    
    // 3. Debounce Cloud Call (2 seconds)
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    
    debounceTimer.current = setTimeout(() => {
      flushChanges();
    }, 1000);
  }, [flushChanges]);

  const setDate = useCallback((date) => {
    setCurrentDate(dayjs(date));
  }, []);

  // Sync with Cloud
  const syncWithCloud = useCallback(async () => {
    const monthStr = currentDate.format('YYYY-MM');
    console.log('Syncing with cloud for:', monthStr);
    
    // Show loading
    Taro.showNavigationBarLoading();
    
    try {
      const res = await AttendanceService.getMonthlyStats(monthStr);
      if (res && res.records) {
        const cloudMap = {};
        res.records.forEach(r => { cloudMap[r.date] = r.status; });
        console.log('Cloud records:', cloudMap);
        const localRecords = getAllRecords();
        const pending = pendingChanges.current;
        
        // 1. Update local from cloud (Upsert)
        res.records.forEach(r => {
            if (!pending.hasOwnProperty(r.date)) {
                if (localRecords[r.date] !== r.status) {
                    saveRecord(r.date, r.status);
                }
            }
        });

        // 2. Remove local records that are NOT in cloud (for this month)
        Object.keys(localRecords).forEach(date => {
            if (date.startsWith(monthStr)) { // Check if date belongs to current month
                if (!pending.hasOwnProperty(date)) {
                    if (!cloudMap[date]) {
                        // Exists locally but not in cloud -> delete
                        saveRecord(date, null);
                    }
                }
            }
        });

        loadDays();
      }
    } catch (err) {
      console.error('Sync failed:', err);
    } finally {
        // Hide loading
        Taro.hideNavigationBarLoading();
    }
  }, [currentDate, loadDays]);

  // Trigger sync on mount or month change
  useEffect(() => {
    loadDays(); // 1. Load local cache immediately
    syncWithCloud(); // 2. Sync with cloud in background
  }, [syncWithCloud, loadDays]);

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
      updateDateStatus(dateStr, null);
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
    updateDateStatus(dateStr, newType);
    
    // 重新加载数据
    loadDays();
    
    // 反馈
    if (newType === RECORD_TYPES.OFFICE) {
      Taro.vibrateShort();
    }
  }, [loadDays, updateDateStatus]);

  const toggleLeave = useCallback((dateStr) => {
    const record = getRecord(dateStr);

    // 限制：仅允许在“工作日”长按标记请假，周末不可标记
    if (!isWorkDay(dateStr)) {
      Taro.showToast({ title: '非工作日无需请假', icon: 'none' });
      return;
    }

    // 切换状态: Leave -> None, Others -> Leave
    const newType = record === RECORD_TYPES.LEAVE ? null : RECORD_TYPES.LEAVE;
    updateDateStatus(dateStr, newType);

    // 重新加载数据
    loadDays();

    // 震动反馈
    Taro.vibrateShort();
  }, [loadDays, updateDateStatus]);

  // 批量更新 (用于 CalendarCard 的 onChange)
  const handleBatchChange = useCallback((newDates) => {
    const newDateStrs = newDates.map(d => dayjs(d).format('YYYY-MM-DD'));
    
    // 1. 处理新增/保持的 Office
    newDateStrs.forEach(dateStr => {
        const currentRecord = getRecord(dateStr);
        if (currentRecord !== RECORD_TYPES.OFFICE) {
             // 可能是 null 或 LEAVE，都覆盖为 OFFICE
             if (isWorkDay(dateStr)) {
                 updateDateStatus(dateStr, RECORD_TYPES.OFFICE);
             }
        }
    });

    // 2. 处理被取消的 Office
    days.forEach(day => {
        if (day.status === RECORD_TYPES.OFFICE && !newDateStrs.includes(day.date)) {
            updateDateStatus(day.date, null);
        }
    });

    loadDays();
  }, [days, loadDays, updateDateStatus]);

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
