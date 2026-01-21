
import { useLaunch } from '@tarojs/taro'
import Taro from '@tarojs/taro'
import { initCloudBase } from './services/cloud'
import '@nutui/nutui-react-taro/dist/style.css'
import './app.scss'

function App({ children }) {
  useLaunch(() => {
    console.log('App launched.')
    console.log('Current Env:', Taro.getEnv())
    initCloudBase()
  })

  // children 是将要会渲染的页面
  return children
}
  


export default App
