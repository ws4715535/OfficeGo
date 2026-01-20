// 2025年法定节假日数据 (MVP内置)
// 格式: YYYY-MM-DD
export const HOLIDAYS_2025 = {
  // 元旦
  '2025-01-01': { name: '元旦', isOffDay: true },
  
  // 春节 (1.28 - 2.4)
  '2025-01-28': { name: '春节', isOffDay: true },
  '2025-01-29': { name: '春节', isOffDay: true },
  '2025-01-30': { name: '春节', isOffDay: true },
  '2025-01-31': { name: '春节', isOffDay: true },
  '2025-02-01': { name: '春节', isOffDay: true },
  '2025-02-02': { name: '春节', isOffDay: true },
  '2025-02-03': { name: '春节', isOffDay: true },
  '2025-02-04': { name: '春节', isOffDay: true },

  // 清明节 (4.4 - 4.6)
  '2025-04-04': { name: '清明节', isOffDay: true },
  '2025-04-05': { name: '清明节', isOffDay: true },
  '2025-04-06': { name: '清明节', isOffDay: true },

  // 劳动节 (5.1 - 5.5)
  '2025-05-01': { name: '劳动节', isOffDay: true },
  '2025-05-02': { name: '劳动节', isOffDay: true },
  '2025-05-03': { name: '劳动节', isOffDay: true },
  '2025-05-04': { name: '劳动节', isOffDay: true },
  '2025-05-05': { name: '劳动节', isOffDay: true },

  // 端午节 (5.31 - 6.2)
  '2025-05-31': { name: '端午节', isOffDay: true },
  '2025-06-01': { name: '端午节', isOffDay: true },
  '2025-06-02': { name: '端午节', isOffDay: true },

  // 国庆节 & 中秋节 (10.1 - 10.8)
  '2025-10-01': { name: '国庆节', isOffDay: true },
  '2025-10-02': { name: '国庆节', isOffDay: true },
  '2025-10-03': { name: '国庆节', isOffDay: true },
  '2025-10-04': { name: '国庆节', isOffDay: true },
  '2025-10-05': { name: '国庆节', isOffDay: true },
  '2025-10-06': { name: '国庆节', isOffDay: true },
  '2025-10-07': { name: '国庆节', isOffDay: true },
  '2025-10-08': { name: '国庆节', isOffDay: true },
};

// 调休补班 (需要上班的周末)
export const WORKDAYS_ADJUSTED_2025 = [
  '2025-01-26', // 春节补班
  '2025-02-08', // 春节补班
  '2025-04-27', // 劳动节补班
  '2025-09-28', // 国庆补班
  '2025-10-11', // 国庆补班
];
