import Taro from '@tarojs/taro'
import { init } from '@cloudbase/wx-cloud-client-sdk'

let cloudbaseInstance = null

export const initCloudBase = () => {
  if (!Taro.cloud) {
    console.error('请使用 2.2.3 或以上的基础库以使用云能力')
    return
  }

  // 1. Init Taro/WeChat Cloud
  Taro.cloud.init({
    env: "dev-2g131pqic0b2596c",
    traceUser: true,
  })

  // 2. Init Client SDK
  try {
    cloudbaseInstance = init(Taro.cloud)
    console.log('CloudBase Client SDK Initialized successfully')
  } catch (e) {
    console.error('CloudBase Client SDK Init Failed:', e)
  }
}

export const getCloudbaseInstance = () => {
  return cloudbaseInstance
}
