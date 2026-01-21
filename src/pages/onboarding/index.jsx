import { View, Text, Button, Image, Slider, ScrollView, Input } from '@tarojs/components'
import React, { useState, useEffect } from 'react'
import Taro from '@tarojs/taro'
import AuthService from '../../services/auth'
import logoIcon from '../../assets/logo.png'
import { PRIVACY_POLICY } from '../../constants/privacy'
import './index.scss'

export default function Onboarding() {
  const [step, setStep] = useState(0) // 0: Landing, 1: Profile, 2: Goal, 3: Habits
  const [showPrivacy, setShowPrivacy] = useState(false)
  const [showFullPrivacy, setShowFullPrivacy] = useState(false)
  
  // Step 1 Data: Profile
  const [avatarUrl, setAvatarUrl] = useState('')
  const [nickName, setNickName] = useState('')

  // Step 2 Data: Goal
  const [targetPercentage, setTargetPercentage] = useState(0) // Start at 0 for animation
  const [animatedPercentage, setAnimatedPercentage] = useState(0)
  
  // Step 3 Data: Habits
  const [cycle, setCycle] = useState('monthly') // 'weekly' | 'monthly'
  const [rounding, setRounding] = useState('ceil') // 'ceil' | 'round' | 'floor'

  // Animation Effect for Step 2
  useEffect(() => {
    if (step === 2) {
      // Reset
      setTargetPercentage(0) 
      setAnimatedPercentage(0)

      // Start animation
      setTimeout(() => {
        setTargetPercentage(40)
        
        // Custom number animation
        let start = 0
        const end = 40
        const duration = 1000
        const stepTime = 20
        const steps = duration / stepTime
        const increment = end / steps
        
        const timer = setInterval(() => {
            start += increment
            if (start >= end) {
                start = end
                clearInterval(timer)
            }
            setAnimatedPercentage(Math.floor(start))
        }, stepTime)
      }, 100)
    }
  }, [step])

  // Sync slider changes to animated value manually after initial animation
  const handleSliderChange = (e) => {
      setTargetPercentage(e.detail.value)
      setAnimatedPercentage(e.detail.value)
  }

  // Step 0: Landing Actions
  const handleStartClick = () => {
    setShowPrivacy(true)
  }

  // Privacy Actions
  const handlePrivacyAuth = async () => {
    Taro.showLoading({ title: '登录中...' })
    try {
      // Login/Register in Cloud
      const loginRes = await AuthService.login()
      
      // Check if user is already onboarded
      if (loginRes && loginRes.data && loginRes.data.isOnboarded) {
          // If already onboarded, sync local storage and go home directly
          Taro.setStorageSync('userInfo', loginRes.data)
          Taro.setStorageSync('isOnboarded', true)
          if (loginRes.data.settings) {
              Taro.setStorageSync('userSettings', loginRes.data.settings)
          }
          
          Taro.showToast({ title: '欢迎回来', icon: 'success' })
          setTimeout(() => {
            Taro.switchTab({ url: '/pages/index/index' })
          }, 1000)
          return
      }
      
      // Move to Next Step (Profile Setup)
      setShowPrivacy(false)
      setStep(1) 
      
    } catch (err) {
      console.error('Auth failed', err)
      Taro.showToast({ title: '登录失败，请重试', icon: 'none' })
    } finally {
      Taro.hideLoading()
    }
  }

  // Step 1: Profile Actions
  const onChooseAvatar = (e) => {
    const { avatarUrl } = e.detail
    setAvatarUrl(avatarUrl)
  }

  const handleProfileNext = () => {
    if (!nickName) {
      Taro.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }
    if (!avatarUrl) {
      Taro.showToast({ title: '请设置头像', icon: 'none' })
      return
    }
    // Save to local storage for now
    Taro.setStorageSync('tempUserProfile', { nickName, avatarUrl })
    setStep(2)
  }

  // Step 2: Goal Actions
  const handleGoalNext = () => {
    setStep(3)
  }

  // Step 3: Habits Actions
  const handleComplete = async () => {
    Taro.showLoading({ title: '保存中...' })
    try {
        let finalAvatarUrl = avatarUrl

        // Upload Avatar if it's a temporary path
        if (avatarUrl && avatarUrl.startsWith('http://tmp') || avatarUrl.startsWith('wxfile://')) {
            const cloudPath = `avatars/${Date.now()}-${Math.random().toString(36).slice(-6)}.png`
            const uploadRes = await Taro.cloud.uploadFile({
                cloudPath,
                filePath: avatarUrl
            })
            finalAvatarUrl = uploadRes.fileID
        }

        // Save Settings
        const settings = {
            targetPercentage,
            statsCycle: cycle,
            roundingRule: rounding
        }
        
        // Update User in Cloud
        await AuthService.updateUser({
            nickName,
            avatarUrl: finalAvatarUrl,
            settings,
            isOnboarded: true
        })
        
        // Save Local
        Taro.setStorageSync('userSettings', settings)
        Taro.setStorageSync('isOnboarded', true)
        
        // Navigate Home
        Taro.switchTab({ url: '/pages/index/index' })
    } catch (err) {
        console.error('Complete failed', err)
        Taro.showToast({ title: '保存失败，请重试', icon: 'none' })
    } finally {
        Taro.hideLoading()
    }
  }

  // Render Helpers
  const getRoundExample = () => {
    const base = 22 * (targetPercentage / 100);
    let result = base;
    let desc = '';
    
    if (rounding === 'ceil') {
      result = Math.ceil(base);
      desc = '不足1天按1天算';
    } else if (rounding === 'floor') {
      result = Math.floor(base);
      desc = '直接舍去小数';
    } else {
      result = Math.round(base);
      desc = '四舍五入';
    }
    
    return `例: 22天 × ${targetPercentage}% = ${base.toFixed(2)}天 → 目标 ${result}天 (${desc})`;
  }

  const renderLanding = () => (
    <View className='step-landing'>
      <View className='logo-section'>
        <Image src={logoIcon} className='logo-img-large' mode='aspectFit' />
        <Text className='app-title'>来了么 Pro</Text>
        <Text className='app-desc'>轻松规划你的 Office Days</Text>
        <Text className='app-desc-sub'>团队<Text style={{ textDecoration: 'line-through' }}>协作</Text>约饭更高效</Text>
        {/* Full Privacy Policy Modal */}
      {showFullPrivacy && (
        <View className='full-screen-modal'>
            <View className='modal-header'>
              <Text className='modal-title'>用户政策和隐私协议</Text>
            </View>
            <ScrollView scrollY className='modal-body-scroll'>
              <Text className='privacy-content'>
                {PRIVACY_POLICY}
              </Text>
            </ScrollView>
            <View className='modal-footer'>
              <Button className='action-btn' onClick={() => setShowFullPrivacy(false)}>
                我已阅读
              </Button>
            </View>
        </View>
      )}
    </View>
      <View className='bottom-area'>
        <Button className='action-btn' onClick={handleStartClick}>立即开启</Button>
        <Text className='version'>V 1.1.0 · OfficeGo 来了么到岗助手</Text>
      </View>
    </View>
  )

  const renderProfile = () => (
    <View className='step-content'>
      <View className='step-header'>
        <View className='progress-bar'>
          <View className='progress-fill' style={{ width: '33%' }}></View>
        </View>
        <Text className='step-indicator'>STEP 1 / 3</Text>
      </View>
      
      <Text className='title'>完善资料</Text>
      <Text className='subtitle'>设置你的头像和昵称，方便团队成员识别。</Text>
      
      <View className='profile-section'>
        <Button 
          className='avatar-wrapper' 
          openType='chooseAvatar' 
          onChooseAvatar={onChooseAvatar}
        >
          {avatarUrl ? (
            <Image className='avatar-img' src={avatarUrl} mode='aspectFill' />
          ) : (
            <View className='avatar-placeholder'>
              <Image src={logoIcon} className='default-icon' />
              <Text className='tip'>点击设置头像</Text>
            </View>
          )}
        </Button>
        
        <View className='input-wrapper'>
          <Text className='input-label'>昵称</Text>
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
      
      <View className='bottom-area'>
        <Button className='action-btn' onClick={handleProfileNext}>下一步 →</Button>
      </View>
    </View>
  )

  const renderGoal = () => (
    <View className='step-content'>
      <View className='step-header'>
        <View className='progress-bar'>
          <View className='progress-fill' style={{ width: '66%' }}></View>
        </View>
        <Text className='step-indicator'>STEP 2 / 3</Text>
      </View>
      
      <Text className='title'>设定在岗目标</Text>
      <Text className='subtitle'>每个月你需要待多久？我们将根据此目标为你规划进度。</Text>
      
      <View className='card'>
        <Text className='highlight'>{animatedPercentage}%</Text>
        <Text className='highlight-sub'>平均每月需在岗约 {Math.ceil(22 * (animatedPercentage/100))} 天</Text>
        
        <Slider 
          value={targetPercentage} 
          min={0} 
          max={100} 
          step={5}
          activeColor='#4F46E5'
          backgroundColor='#E5E7EB'
          blockColor='#4F46E5'
          blockSize={24}
          onChanging={handleSliderChange}
          onChange={handleSliderChange}
          className='custom-slider'
        />
      </View>
      
      <View className='bottom-area'>
        <Button className='action-btn' onClick={handleGoalNext}>下一步 →</Button>
      </View>
    </View>
  )

  const renderHabits = () => (
    <View className='step-content'>
      <View className='step-header'>
        <View className='progress-bar'>
          <View className='progress-fill' style={{ width: '100%' }}></View>
        </View>
        <Text className='step-indicator'>STEP 3 / 3</Text>
      </View>
      
      <Text className='title'>统计习惯</Text>
      <Text className='subtitle'>选择适合你的结算方式。灵活配置。</Text>
      
      <View className='form-group'>
        <Text className='label'>统计周期</Text>
        <View className='radio-group'>
          <View 
            className={`radio-item disabled`}
            onClick={() => Taro.showToast({ title: '暂仅支持每月清算', icon: 'none' })}
          >
            每周清算
          </View>
          <View 
            className={`radio-item active`}
            onClick={() => setCycle('monthly')}
          >
            每月清算
          </View>
        </View>
      </View>

      <View className='form-group'>
        <Text className='label'>天数舍入规则</Text>
        <View className='radio-group'>
          <View 
            className={`radio-item small ${rounding === 'ceil' ? 'active' : ''}`}
            onClick={() => setRounding('ceil')}
          >
            向上取整
          </View>
          <View 
            className={`radio-item small ${rounding === 'round' ? 'active' : ''}`}
            onClick={() => setRounding('round')}
          >
            四舍五入
          </View>
          <View 
            className={`radio-item small ${rounding === 'floor' ? 'active' : ''}`}
            onClick={() => setRounding('floor')}
          >
            向下取整
          </View>
        </View>
        <Text className='rule-explanation'>
            {getRoundExample()}
        </Text>
      </View>
      
      <View className='bottom-area'>
        <Button className='action-btn' onClick={handleComplete}>开启我的足迹 →</Button>
      </View>
    </View>
  )

  return (
    <View className='onboarding-page'>
      {step === 0 && renderLanding()}
      {step === 1 && renderProfile()}
      {step === 2 && renderGoal()}
      {step === 3 && renderHabits()}

      {/* Privacy Modal */}
      {showPrivacy && (
        <View className='modal-overlay'>
          <View className='modal-card'>
            <View className='modal-header'>
              <Image src={logoIcon} className='icon-shield-img' />
              <Text className='modal-title'>用户协议与隐私政策</Text>
            </View>
            <View className='modal-body'>
              <Text className='modal-text'>欢迎使用“来了么 Pro”。我们非常重视您的隐私。在您开始之前，请阅读：</Text>
              <Text className='modal-list'>1. 我们会收集您的在岗记录以生成统计报表。</Text>
              <Text className='modal-list'>2. 您的头像和昵称将仅在您加入的团队内展示。</Text>
              <Text className='modal-list'>3. 数据经过加密处理，确保您的信息安全。</Text>
              <Text 
                className='link-text' 
                onClick={() => setShowFullPrivacy(true)}
              >
                点击查看完整《用户政策和隐私协议》
              </Text>
            </View>
            <View className='modal-footer'>
              <Button className='wechat-btn' onClick={handlePrivacyAuth}>
                <Text className='wechat-icon'></Text> 同意并使用微信授权登录
              </Button>
              <Text className='reject-text' onClick={() => setShowPrivacy(false)}>拒绝并退出</Text>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}
