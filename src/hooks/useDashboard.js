import { useState, useCallback } from 'react';
import { useDidShow } from '@tarojs/taro';
import dayjs from 'dayjs';
import { getSettings, saveRecord, getAllRecords } from '../services/storage';
import { getMonthStats } from '../services/core';
import AttendanceService from '../services/attendance';

export const useDashboard = () => {
  const [currentDate, setCurrentDate] = useState(dayjs());
  const [stats, setStats] = useState({
    totalWorkDays: 0,
    leaveDays: 0,
    effectiveWorkDays: 0,
    targetDays: 0,
    officeDays: 0,
    remainingDays: 0,
    progress: 0
  });

  const loadStats = useCallback(() => {
    const settings = getSettings();
    const year = currentDate.year();
    const month = currentDate.month() + 1;
    const newStats = getMonthStats(year, month, settings);
    setStats(newStats);
  }, [currentDate]);

  // Sync data from cloud
  const syncData = useCallback(async () => {
    const monthStr = currentDate.format('YYYY-MM');
    try {
      // 1. Fetch latest data from cloud
      const res = await AttendanceService.getMonthlyStats(monthStr);
      
      if (res && res.records) {
        // 2. Update local storage with cloud data
        const cloudMap = {};
        res.records.forEach(r => { 
          cloudMap[r.date] = r.status;
          saveRecord(r.date, r.status);
        });

        // 3. Remove local records not in cloud (for current month)
        // This ensures if I deleted a record on another device, it syncs here
        const localRecords = getAllRecords();
        Object.keys(localRecords).forEach(date => {
          if (date.startsWith(monthStr) && !cloudMap[date]) {
             saveRecord(date, null);
          }
        });

        // 4. Re-calculate stats with updated local data
        loadStats();
      }
    } catch (err) {
      console.error('Dashboard sync failed:', err);
      // Even if sync fails, we still show local data (loadStats called in useDidShow)
    }
  }, [currentDate, loadStats]);

  // 每次页面显示时重新计算，并尝试同步云端数据
  useDidShow(() => {
    loadStats(); // Show local data immediately (Optimistic UI)
    syncData();  // Fetch latest in background
  });

  return {
    currentDate,
    stats,
    year: currentDate.year(),
    month: currentDate.month() + 1,
  };
};
