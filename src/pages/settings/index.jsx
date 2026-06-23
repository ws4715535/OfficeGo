import { View, Text, Slider, Button, Switch, Image, Input } from '@tarojs/components'
import { useState, useEffect } from 'react'
import Taro from '@tarojs/taro'
import { getSettings, saveSettings } from '../../services/storage'
import AuthService from '../../services/auth'
import { updateMyStepSettings } from '../../services/steps'
import { TEAMS, joinTeam } from '../../services/mockTeamData'
import './index.scss'

export default function Settings() {
  const [frequency, setFrequency] = useState('MONTH')
  const [targetRatio, setTargetRatio] = useState(40)
  const [roundType, setRoundType] = useState('ceil')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [nickName, setNickName] = useState('')
  const [hasTeam, setHasTeam] = useState(false)
  const [stepEnabled, setStepEnabled] = useState(false)
  const [updatingPermission, setUpdatingPermission] = useState(false)

  const persistStepSettingsToLocal = (patch) => {
    const currentSettings = getSettings()
    const nextSettings = { ...currentSettings, ...patch }
    saveSettings(nextSettings)

    const localUser = Taro.getStorageSync('userInfo') || {}
    Taro.setStorageSync('userInfo', {
      ...localUser,
      settings: {
        ...(localUser.settings || {}),
        ...patch
      }
    })
  }

  const hydrateFromSettings = (settings = {}) => {
    if (settings.targetRatio !== undefined) setTargetRatio(Math.round(Number(settings.targetRatio) * 100))
    if (settings.roundType) setRoundType(settings.roundType)
    if (settings.frequency) setFrequency(settings.frequency)
    setStepEnabled(Boolean(settings.stepEnabled))
  }

  useEffect(() => {
    const saved = getSettings()
    hydrateFromSettings(saved)

    const localUser = Taro.getStorageSync('userInfo')
    if (localUser) {
      setAvatarUrl(localUser.avatarUrl || '')
      setNickName(localUser.nickName || '')
      hydrateFromSettings(localUser.settings || {})
    }

    const syncProfile = async () => {
      try {
        const userProfile = await AuthService.getUserProfile()
        if (!userProfile) return

        if (userProfile.avatarUrl) setAvatarUrl(userProfile.avatarUrl)
        if (userProfile.nickName) setNickName(userProfile.nickName)

        if (userProfile.settings) {
          hydrateFromSettings(userProfile.settings)
          saveSettings({
            ...getSettings(),
            ...userProfile.settings
          })
        }
      } catch (err) {
        console.error('Failed to sync profile', err)
      }
    }

    syncProfile()
    setHasTeam(TEAMS.length > 0)
  }, [])

  const onChooseAvatar = (e) => {
    const { avatarUrl: nextAvatarUrl } = e.detail
    setAvatarUrl(nextAvatarUrl)
  }

  const handleToggleTeam = (e) => {
    const shouldHaveTeam = e.detail.value
    if (shouldHaveTeam) {
      if (TEAMS.length === 0) {
        joinTeam('DEBUG')
        setHasTeam(true)
        Taro.showToast({ title: '已加入Debug团队', icon: 'none' })
      }
    } else if (TEAMS.length > 0) {
      TEAMS.splice(0, TEAMS.length)
      setHasTeam(false)
      Taro.showToast({ title: '已清空团队', icon: 'none' })
    }
  }

  const requestWeRunAuth = async (silent = false) => {
    const settings = await Taro.getSetting()
    if (settings.authSetting['scope.werun']) {
      return true
    }

    if (silent) {
      return false
    }

    try {
      await Taro.authorize({ scope: 'scope.werun' })
      return true
    } catch (error) {
      const modalRes = await Taro.showModal({
        title: '需要微信运动权限',
        content: '开启后才可以同步步数到团队挑战中，是否现在去设置里开启？',
        confirmText: '去设置'
      })

      if (modalRes.confirm) {
        const openRes = await Taro.openSetting()
        return Boolean(openRes.authSetting['scope.werun'])
      }
      return false
    }
  }

  const handleToggleStepPermission = async (e) => {
    const nextEnabled = e.detail.value
    if (updatingPermission) return

    try {
      setUpdatingPermission(true)

      if (nextEnabled) {
        const granted = await requestWeRunAuth(false)
        if (!granted) {
          setStepEnabled(false)
          return
        }
      }

      await updateMyStepSettings({
        stepEnabled: nextEnabled,
        stepAutoSync: nextEnabled
      })

      setStepEnabled(nextEnabled)
      persistStepSettingsToLocal({
        stepEnabled: nextEnabled,
        stepAutoSync: nextEnabled
      })

      Taro.showToast({
        title: nextEnabled ? '已开启运动权限' : '已关闭运动权限',
        icon: 'success'
      })
    } catch (error) {
      console.error('Update step permission failed', error)
      setStepEnabled(prev => !nextEnabled ? prev : false)
      Taro.showToast({ title: error.message || '设置失败', icon: 'none' })
    } finally {
      setUpdatingPermission(false)
    }
  }

  const handleSave = async () => {
    Taro.showLoading({ title: '保存中...' })
    try {
      let finalAvatarUrl = avatarUrl
      if (avatarUrl && (avatarUrl.startsWith('http://tmp') || avatarUrl.startsWith('wxfile://'))) {
        const cloudPath = `avatars/${Date.now()}-${Math.random().toString(36).slice(-6)}.png`
        const uploadRes = await Taro.cloud.uploadFile({
          cloudPath,
          filePath: avatarUrl
        })
        finalAvatarUrl = uploadRes.fileID
      }

      const currentSettings = getSettings()
      const newSettings = {
        ...currentSettings,
        targetRatio: targetRatio / 100,
        roundType,
        frequency,
        stepEnabled,
        stepAutoSync: stepEnabled
      }

      saveSettings(newSettings)
      await AuthService.updateUser({
        nickName,
        avatarUrl: finalAvatarUrl,
        settings: newSettings
      })

      Taro.showToast({
        title: '保存成功',
        icon: 'success',
        duration: 1500
      })

      setTimeout(() => {
        Taro.navigateBack()
      }, 1500)
    } catch (err) {
      console.error('Save settings failed', err)
      Taro.showToast({ title: '保存失败', icon: 'none' })
    } finally {
      Taro.hideLoading()
    }
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

  const renderSegmentControl = (options, current, onChange) => (
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

  const getRoundExample = () => {
    const base = 21 * (targetRatio / 100)
    let result = base
    let desc = ''

    if (roundType === 'ceil') {
      result = Math.ceil(base)
      desc = '不足1天按1天算'
    } else if (roundType === 'floor') {
      result = Math.floor(base)
      desc = '直接舍去小数'
    } else {
      result = Math.round(base)
      desc = '四舍五入'
    }

    return `例: 21天 × ${targetRatio}% = ${base.toFixed(2)}天 → 目标 ${result}天 (${desc})`
  }

  return (
    <View className='settings-page'>
      <Text className='section-title'>个人信息</Text>
      <View className='config-card'>
        <View className='config-item profile-config'>
          <Button
            className='avatar-btn'
            openType='chooseAvatar'
            onChooseAvatar={onChooseAvatar}
          >
            {avatarUrl ? (
              <Image className='avatar-img' src={avatarUrl} mode='aspectFill' />
            ) : (
              <View className='avatar-placeholder'>
                <Text>头像</Text>
              </View>
            )}
          </Button>
          <View className='input-wrapper'>
            <Input
              type='nickname'
              className='nickname-input'
              placeholder='请输入昵称'
              value={nickName}
              onBlur={(e) => setNickName(e.detail.value)}
              onChange={(e) => setNickName(e.detail.value)}
            />
          </View>
        </View>
      </View>

      <Text className='section-title'>核心规则</Text>
      <View className='config-card'>
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
          <Text className='rule-explanation'>{getRoundExample()}</Text>
        </View>
      </View>

      <Text className='section-title'>微信运动步数</Text>
      <View className='config-card'>
        <View className='config-item'>
          <View className='item-header'>
            <View className='header-copy'>
              <Text className='label'>微信运动步数</Text>
            </View>
            <Switch checked={stepEnabled} onChange={handleToggleStepPermission} color='#4F46E5' disabled={updatingPermission} />
          </View>
        </View>
      </View>

      {process.env.NODE_ENV === 'development' && (
        <View className='config-card debug-card'>
          <View className='config-item'>
            <View className='item-header'>
              <Text className='label'>Debug: 强制团队状态</Text>
              <Switch checked={hasTeam} onChange={handleToggleTeam} color='#4F46E5' />
            </View>
            <Text className='rule-explanation'>
              {hasTeam ? '当前状态：有团队 (Dashboard显示详情)' : '当前状态：无团队 (Dashboard显示加入引导)'}
            </Text>
          </View>
          <View className='divider' />
          <View className='config-item'>
            <Button
              className='reset-btn'
              type='warn'
              size='mini'
              onClick={() => {
                Taro.showModal({
                  title: '重置为新用户',
                  content: '这将删除云端所有数据并清除本地缓存，下次进入将视为新用户。确定吗？',
                  success: async (res) => {
                    if (res.confirm) {
                      Taro.showLoading({ title: '重置中...' })
                      try {
                        await AuthService.deleteUser()
                        Taro.hideLoading()
                        Taro.showToast({ title: '重置成功', icon: 'success' })
                        setTimeout(() => {
                          Taro.reLaunch({ url: '/pages/onboarding/index' })
                        }, 1500)
                      } catch (err) {
                        Taro.hideLoading()
                        Taro.showToast({ title: '重置失败', icon: 'none' })
                      }
                    }
                  }
                })
              }}
            >
              设置为新用户 (Debug)
            </Button>
          </View>
        </View>
      )}

      <Button className='save-btn' onClick={handleSave}>
        保存并返回
      </Button>

      <Button
        className='logout-btn'
        onClick={() => {
          Taro.showModal({
            title: '退出登录',
            content: '确定要退出登录吗？',
            success: async (res) => {
              if (res.confirm) {
                AuthService.logout()
                Taro.reLaunch({ url: '/pages/onboarding/index' })
              }
            }
          })
        }}
      >
        退出登录
      </Button>
    </View>
  )
}
