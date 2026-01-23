import Taro from '@tarojs/taro'

export const initCloudBase = () => {
  if (!Taro.cloud) {
    console.error('请使用 2.2.3 或以上的基础库以使用云能力')
    return
  }

  // 1. Init Taro/WeChat Cloud
  try {
    Taro.cloud.init({
        env: "dev-2g131pqic0b2596c",
        traceUser: true,
    })
    console.log('Taro Cloud Initialized')
  } catch (e) {
      console.error('Taro Cloud Init Error:', e)
  }
}
