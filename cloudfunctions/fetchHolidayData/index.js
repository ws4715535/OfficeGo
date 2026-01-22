// 云函数入口文件
const cloud = require('wx-server-sdk')
const axios = require('axios')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }) // 使用当前云环境

// 云函数入口函数
exports.main = async (event, context) => {
  const API_URL = 'https://www.shuyz.com/githubfiles/china-holiday-calender/master/holidayAPI.json';
  
  try {
    const response = await axios.get(API_URL);
    return response.data;
  } catch (error) {
    console.error('Fetch holiday data failed:', error);
    // 返回空对象或者错误信息，让前端继续使用缓存
    return null;
  }
}
