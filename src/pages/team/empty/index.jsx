import { View, Text, Image, Button } from '@tarojs/components'
import React from 'react'
import searchIcon from '../../../assets/search.png'
import './index.scss'

export default function EmptyState({ onJoin, onCreate }) {
  return (
    <View className='empty-state'>
      <View className='illustration'>
        <View className='bg-circle' />
        <View className='icon-group'>
          {/* Visual placeholder for Users group */}
          <View className='users-placeholder'>
             <View className='user-circle c1' />
             <View className='user-circle c2' />
             <View className='user-circle c3' />
          </View>
          
          <View className='sparkle'>
            <Text>✨</Text>
          </View>
          
          <View className='search-icon-container jumping'>
            <Image src={searchIcon} className='search-icon' />
          </View>
        </View>
      </View>
      
      <Text className='title'>寻找你的团队</Text>
      <Text className='desc'>加入团队即可与同事同步在岗动态，智能挑选最适合线下碰头的“黄金日”。</Text>
      
      <View className='actions'>
        <Button className='btn primary' onClick={onJoin}>
          <Text># 输入邀请码加入</Text>
        </Button>
        <Button className='btn secondary' onClick={onCreate}>
          <Text>⊕ 创建新团队</Text>
        </Button>
      </View>
    </View>
  )
}
