import { View, Text, Slider, Button } from '@tarojs/components'
import React, { useState, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { getSettings, saveSettings } from '../../services/storage'
import './index.scss'

export default function Settings() {
  const [frequency, setFrequency] = useState('MONTH') // MONTH, WEEK, BIWEEK
  const [targetRatio, setTargetRatio] = useState(40)
  const [roundType, setRoundType] = useState('ceil') // ceil, round, floor

  useEffect(() => {
    const saved = getSettings()
    if (saved) {
      if (saved.targetRatio) setTargetRatio(Math.round(saved.targetRatio * 100))
      if (saved.roundType) setRoundType(saved.roundType)
      if (saved.frequency) setFrequency(saved.frequency)
    }
  }, [])

  const handleSave = () => {
    const newSettings = {
      targetRatio: targetRatio / 100,
      roundType,
      frequency
    }
    saveSettings(newSettings)
    Taro.navigateBack()
  }

  const handleFrequencyChange = (val) => {
    if (val !== 'MONTH') {
      Taro.showToast({
        title: '暂不支持该粒度',
        icon: 'none'
      })
      return
    }
    setFrequency(val)
  }

  const renderSegmentControl = (options, current, onChange) => {
    return (
      <View className='segment-control'>
        {options.map((opt) => (
          <View
            key={opt.value}
            className={`segment-item ${current === opt.value ? 'active' : ''} ${opt.disabled ? 'disabled' : ''}`}
            onClick={() => !opt.disabled ? onChange(opt.value) : Taro.showToast({ title: '暂不支持', icon: 'none' })}
          >
            <Text>{opt.label}</Text>
          </View>
        ))}
      </View>
    )
  }

  const getRoundExample = () => {
    const base = 21 * (targetRatio / 100);
    let result = base;
    let desc = '';
    
    if (roundType === 'ceil') {
      result = Math.ceil(base);
      desc = '不足1天按1天算';
    } else if (roundType === 'floor') {
      result = Math.floor(base);
      desc = '直接舍去小数';
    } else {
      result = Math.round(base);
      desc = '四舍五入';
    }
    
    return `例: 21天 × ${targetRatio}% = ${base.toFixed(2)}天 → 目标 ${result}天 (${desc})`;
  }

  return (
    <View className='settings-page'>
      <Text className='page-title'>核心规则设置</Text>
      
      <View className='config-card'>
        {/* 1. 默认统计粒度 */}
        <View className='config-item'>
          <View className='item-header'>
            <Text className='label'>默认统计粒度</Text>
            <Text className='value-display'>{frequency}</Text>
          </View>
          {renderSegmentControl(
            [
              { label: '按月', value: 'MONTH' },
              { label: '每周', value: 'WEEK', disabled: true },
              { label: '双周', value: 'BIWEEK', disabled: true }
            ],
            frequency,
            handleFrequencyChange
          )}
        </View>

        <View className='divider' />

        {/* 2. 到岗比例 */}
        <View className='config-item'>
          <View className='item-header'>
            <Text className='label'>Work in Office比例</Text>
            <Text className='value-display highlight'>{targetRatio}%</Text>
          </View>
          <View className='slider-container'>
            <Slider 
              value={targetRatio} 
              min={0} 
              max={100} 
              step={5}
              activeColor='#4F46E5' 
              backgroundColor='#F3F4F6' 
              blockColor='#4F46E5' 
              blockSize={20}
              onChanging={(e) => setTargetRatio(e.detail.value)}
              onChange={(e) => setTargetRatio(e.detail.value)}
            />
          </View>
        </View>

        <View className='divider' />

        {/* 3. 取整规则 */}
        <View className='config-item'>
          <View className='item-header'>
            <Text className='label'>取整规则</Text>
          </View>
          {renderSegmentControl(
            [
              { label: '向上', value: 'ceil' },
              { label: '四舍五入', value: 'round' },
              { label: '向下', value: 'floor' }
            ],
            roundType,
            setRoundType
          )}
          <Text className='rule-explanation'>
            {getRoundExample()}
          </Text>
        </View>
      </View>

      <Button className='save-btn' onClick={handleSave}>
        保存并返回
      </Button>
    </View>
  )
}
