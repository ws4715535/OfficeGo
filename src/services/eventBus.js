import Taro from '@tarojs/taro';

const events = {};

/**
 * A simple Event Bus implementation for cross-component communication.
 * Why use this instead of Taro.eventCenter?
 * 1. Framework independent (can be used outside Taro context if needed)
 * 2. Type safety (can be extended with TypeScript later)
 * 3. Debugging (can add logging easily)
 */
export const EventBus = {
  /**
   * Subscribe to an event
   * @param {string} eventName 
   * @param {Function} callback 
   */
  on(eventName, callback) {
    if (!events[eventName]) {
      events[eventName] = [];
    }
    events[eventName].push(callback);
    
    // Return unsubscribe function
    return () => this.off(eventName, callback);
  },

  /**
   * Unsubscribe from an event
   * @param {string} eventName 
   * @param {Function} callback 
   */
  off(eventName, callback) {
    if (!events[eventName]) return;
    events[eventName] = events[eventName].filter(cb => cb !== callback);
  },

  /**
   * Emit an event
   * @param {string} eventName 
   * @param {*} data 
   */
  emit(eventName, data) {
    if (!events[eventName]) return;
    events[eventName].forEach(callback => {
      try {
        callback(data);
      } catch (err) {
        console.error(`Error in event listener for ${eventName}:`, err);
      }
    });
  }
};

// Event Constants
export const EVENTS = {
  ATTENDANCE_UPDATED: 'attendance_updated', // Triggered when local record changes
  USER_INFO_UPDATED: 'user_info_updated',   // Triggered when user profile changes
};
