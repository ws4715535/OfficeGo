import Taro from '@tarojs/taro'

const AttendanceService = {
  /**
   * Upsert attendance record
   * @param {Object} params
   * @param {string} [params.date] - YYYY-MM-DD, defaults to today
   * @param {'office' | 'remote' | 'leave' | 'trip'} params.status
   * @param {string} [params.note]
   */
  upsertRecord: async ({ date, status, note }) => {
    try {
      const res = await Taro.cloud.callFunction({
        name: 'attendance-api',
        data: {
          action: 'upsertRecord',
          data: { date, status, note }
        }
      })
      if (res.result.code === 0) {
        return res.result.data
      }
      throw new Error(res.result.message)
    } catch (error) {
      console.error('AttendanceService Upsert Error:', error)
      throw error
    }
  },

  /**
   * Get today's status
   */
  getTodayStatus: async () => {
    try {
      const res = await Taro.cloud.callFunction({
        name: 'attendance-api',
        data: {
          action: 'getTodayStatus',
          data: {}
        }
      })
      if (res.result.code === 0) {
        return res.result.data
      }
      throw new Error(res.result.message)
    } catch (error) {
      console.error('AttendanceService GetToday Error:', error)
      throw error
    }
  },

  /**
   * Get monthly stats
   * @param {string} month - YYYY-MM
   */
  getMonthlyStats: async (month) => {
    try {
      const res = await Taro.cloud.callFunction({
        name: 'attendance-api',
        data: {
          action: 'getMonthlyStats',
          data: { month }
        }
      })
      if (res.result.code === 0) {
        return res.result.data
      }
      throw new Error(res.result.message)
    } catch (error) {
      console.error('AttendanceService GetMonthly Error:', error)
      throw error
    }
  },

  /**
   * Delete record
   * @param {string} date - YYYY-MM-DD
   */
  deleteRecord: async (date) => {
    try {
      const res = await Taro.cloud.callFunction({
        name: 'attendance-api',
        data: {
          action: 'deleteRecord',
          data: { date }
        }
      })
      if (res.result.code === 0) {
        return true
      }
      throw new Error(res.result.message)
    } catch (error) {
      console.error('AttendanceService Delete Error:', error)
      throw error
    }
  }
}

export default AttendanceService
