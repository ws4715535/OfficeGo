import dayjs from 'dayjs';
import Taro from '@tarojs/taro';
import { RECORD_TYPES } from '../constants/config';
import { getAllRecords } from './storage';

// Safe require for local fallback
let defaultHolidayData = null;
try {
  defaultHolidayData = require('../constants/holidayData.json');
} catch (e) {
  console.warn('Local holiday data not found');
}

// 获取当前有效的假期数据 (缓存 > 本地兜底)
const getHolidayData = () => {
  const cached = Taro.getStorageSync('HOLIDAY_DATA');
  if (cached) return cached;
  return defaultHolidayData;
};

// 辅助：从假期数据中解析某天的状态
const getDayInfo = (dateStr) => {
  const data = getHolidayData();
  if (!data || !data.Years) return { isHoliday: false, isCompWork: false, name: '' };

  const year = dayjs(dateStr).year();
  const holidays = data.Years[year] || [];

  for (const h of holidays) {
    // 1. 检查是否在放假范围内
    const start = dayjs(h.StartDate);
    const end = dayjs(h.EndDate);
    const curr = dayjs(dateStr);
    
    if ((curr.isAfter(start) || curr.isSame(start)) && (curr.isBefore(end) || curr.isSame(end))) {
      return { isHoliday: true, isCompWork: false, name: h.Name };
    }

    // 2. 检查是否为补班
    if (h.CompDays && h.CompDays.includes(dateStr)) {
      return { isHoliday: false, isCompWork: true, name: '补班' };
    }
  }

  return { isHoliday: false, isCompWork: false, name: '' };
};

// 判断是否为法定节假日 (纯休息)
export const isHoliday = (dateStr) => {
  const info = getDayInfo(dateStr);
  return info.isHoliday;
};

// 判断是否为周末
export const isWeekend = (dateStr) => {
  const day = dayjs(dateStr).day();
  return day === 0 || day === 6; // 0 is Sunday, 6 is Saturday
};

// 判断是否为需要上班的日子 (工作日)
// 规则: (平时周一至周五 + 补班) - 法定节假日
export const isWorkDay = (dateStr) => {
  const info = getDayInfo(dateStr);

  // 1. 如果是法定节假日，肯定不是工作日
  if (info.isHoliday) return false;

  // 2. 如果是补班日，肯定是工作日
  if (info.isCompWork) return true;

  // 3. 剩下的：如果是周末则不是工作日，否则是工作日
  return !isWeekend(dateStr);
};

// 获取某月的统计数据
export const getMonthStats = (year, month, settings) => {
  const records = getAllRecords();
  const startDate = dayjs(`${year}-${month}-01`);
  const daysInMonth = startDate.daysInMonth();
  
  let totalWorkDays = 0; // 当月总工作日 (理论值)
  let leaveDays = 0;     // 请假天数
  let officeDays = 0;    // 实际到岗天数

  for (let i = 1; i <= daysInMonth; i++) {
    const dateStr = startDate.date(i).format('YYYY-MM-DD');
    const isWork = isWorkDay(dateStr);
    const recordType = records[dateStr];

    if (isWork) {
      totalWorkDays++;
      
      if (recordType === RECORD_TYPES.LEAVE) {
        leaveDays++;
      } else if (recordType === RECORD_TYPES.OFFICE) {
        officeDays++;
      }
    } else {
      // 非工作日如果打卡了，也算到岗？PRD说“MVP不区分计划/实际”，通常非工作日加班也算Office天数
      // PRD 6.1: Y = 实际到办公室天数。
      // PRD 6.2.2: 仅允许标记工作日。
      // 所以这里假设非工作日不能标记为 Office。
    }
  }

  // 有效工作日 = 当月工作日 - 用户请假天数
  const effectiveWorkDays = Math.max(0, totalWorkDays - leaveDays);

  // 应到天数 = 有效工作日 * 比例
  let targetDaysRaw = effectiveWorkDays * settings.targetRatio;
  let targetDays = 0;

  switch (settings.roundType) {
    case 'floor':
      targetDays = Math.floor(targetDaysRaw);
      break;
    case 'round':
      targetDays = Math.round(targetDaysRaw);
      break;
    case 'ceil':
    default:
      targetDays = Math.ceil(targetDaysRaw);
      break;
  }

  const remainingDays = Math.max(0, targetDays - officeDays);
  // 逻辑修正: 如果本月应到天数(targetDays)为0，说明无需到岗，进度应视为100%
  const progress = targetDays > 0 ? Math.min(100, Math.round((officeDays / targetDays) * 100)) : 100;

  return {
    totalWorkDays,
    leaveDays,
    effectiveWorkDays,
    targetDays,
    officeDays,
    remainingDays,
    progress
  };
};

// 获取某月每一天的状态列表 (用于日历渲染)
export const getMonthDaysStatus = (year, month) => {
  const records = getAllRecords();
  const startDate = dayjs(`${year}-${month}-01`);
  const daysInMonth = startDate.daysInMonth();
  
  const days = [];
  for (let i = 1; i <= daysInMonth; i++) {
    const date = startDate.date(i);
    const dateStr = date.format('YYYY-MM-DD');
    const isWork = isWorkDay(dateStr);
    const dayInfo = getDayInfo(dateStr);
    const recordType = records[dateStr];

    days.push({
      date: dateStr,
      day: i,
      weekDay: date.day(),
      isWorkDay: isWork,
      isHoliday: dayInfo.isHoliday,
      holidayName: dayInfo.name,
      status: recordType // 'office' | 'leave' | undefined
    });
  }
  return days;
};
