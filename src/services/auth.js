import Taro from '@tarojs/taro'

/**
 * Authentication Service
 * Handles user login and profile management
 */
const AuthService = {
  /**
   * Login to CloudBase
   * @param {object} userInfo - Optional user info to update/register
   * @returns {Promise<{user: object, openid: string}>}
   */
  login: async (userInfo = null) => {
    try {
      const res = await Taro.cloud.callFunction({
        name: 'login',
        data: { userInfo }
      })
      console.log('AuthService Login Result:', res)
      return res.result
    } catch (error) {
      console.error('AuthService Login Error:', error)
      throw error
    }
  },

  /**
   * Update User Info
   * @param {object} data - { nickName, avatarUrl, settings, isOnboarded }
   */
  updateUser: async (data) => {
    try {
      const res = await Taro.cloud.callFunction({
        name: 'updateUser',
        data: data
      })
      console.log('AuthService Update Result:', res)
      if (res.result.code === 0) {
        // Update local storage
        const currentUser = Taro.getStorageSync('userInfo') || {}
        const newUser = { ...currentUser, ...data }
        Taro.setStorageSync('userInfo', newUser)
        return newUser
      } else {
        throw new Error(res.result.message || 'Update failed')
      }
    } catch (error) {
      console.error('AuthService Update Error:', error)
      throw error
    }
  },

  /**
   * Delete User (For Debug/Testing)
   */
  deleteUser: async () => {
    try {
      const res = await Taro.cloud.callFunction({
        name: 'deleteUser'
      })
      console.log('AuthService Delete Result:', res)
      if (res.result.code === 0) {
        Taro.clearStorageSync()
        return true
      } else {
        throw new Error(res.result.message || 'Delete failed')
      }
    } catch (error) {
      console.error('AuthService Delete Error:', error)
      throw error
    }
  },

  /**
   * Get User Profile
   * 1. Try to read from local cache first
   * 2. If not found, call cloud function 'getUserProfile'
   */
  getUserProfile: async () => {
    try {
      // 1. Try local cache
      const localUser = Taro.getStorageSync('userInfo')
      if (localUser && localUser.nickName && localUser.avatarUrl) {
        // Return a promise that resolves to local data to match async interface
        return localUser
      }

      // 2. Call cloud function
      const res = await Taro.cloud.callFunction({
        name: 'getUserProfile'
      })
      
      console.log('AuthService GetProfile Result:', res)
      
      if (res.result.code === 0 && res.result.data) {
        const userData = res.result.data
        
        // Update local storage
        Taro.setStorageSync('userInfo', {
            nickName: userData.nickName,
            avatarUrl: userData.avatarUrl,
            settings: userData.settings
        })
        
        return userData
      }
      
      return null
    } catch (error) {
      console.error('AuthService GetProfile Error:', error)
      // On error, return empty object or null to let caller handle it
      return null
    }
  }
}

export default AuthService
