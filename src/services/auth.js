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
   * Get User Profile (Mock/Placeholder for now)
   * Future: Integrate with onChooseAvatar
   */
  getUserProfile: async () => {
    // Placeholder logic
    return {
      nickName: 'User',
      avatarUrl: ''
    }
  }
}

export default AuthService
