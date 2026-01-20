import { View, Text } from '@tarojs/components'
import React from 'react'
import classNames from 'classnames'
import './index.scss'

export default function StatCard({ title, value, unit, type = 'default' }) {
  return (
    <View className={classNames('stat-card', `stat-card--${type}`)}>
      <Text className='stat-card__title'>{title}</Text>
      <View className='stat-card__content'>
        <Text className='stat-card__value'>{value}</Text>
        {unit && <Text className='stat-card__unit'>{unit}</Text>}
      </View>
    </View>
  )
}
