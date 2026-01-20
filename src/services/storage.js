import Taro from '@tarojs/taro';
import { STORAGE_KEYS, DEFAULT_SETTINGS } from '../constants/config';

// 获取用户设置
export const getSettings = () => {
  try {
    const settings = Taro.getStorageSync(STORAGE_KEYS.SETTINGS);
    return settings ? { ...DEFAULT_SETTINGS, ...settings } : DEFAULT_SETTINGS;
  } catch (e) {
    console.error('Failed to get settings', e);
    return DEFAULT_SETTINGS;
  }
};

// 保存用户设置
export const saveSettings = (settings) => {
  try {
    Taro.setStorageSync(STORAGE_KEYS.SETTINGS, settings);
  } catch (e) {
    console.error('Failed to save settings', e);
  }
};

// 获取所有记录
export const getAllRecords = () => {
  try {
    return Taro.getStorageSync(STORAGE_KEYS.RECORDS) || {};
  } catch (e) {
    console.error('Failed to get records', e);
    return {};
  }
};

// 获取指定日期的记录
export const getRecord = (date) => {
  const records = getAllRecords();
  return records[date] || null;
};

// 保存记录 (更新或新增)
// type: 'office' | 'leave' | null (null means delete)
export const saveRecord = (date, type) => {
  try {
    const records = getAllRecords();
    if (type === null) {
      delete records[date];
    } else {
      records[date] = type;
    }
    Taro.setStorageSync(STORAGE_KEYS.RECORDS, records);
    return records;
  } catch (e) {
    console.error('Failed to save record', e);
    return {};
  }
};
