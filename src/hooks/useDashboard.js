import { useState, useCallback } from 'react';
import { useDidShow } from '@tarojs/taro';
import dayjs from 'dayjs';
import { getSettings } from '../services/storage';
import { getMonthStats } from '../services/core';

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

  // 每次页面显示时重新计算，确保从其他页面返回时数据最新
  useDidShow(() => {
    loadStats();
  });

  return {
    currentDate,
    stats,
    year: currentDate.year(),
    month: currentDate.month() + 1,
  };
};
