/**
 * 事件管理器
 * 提供事件订阅/发布功能
 */
export class EventManager {
  constructor() {
    this._listeners = new Map()
  }

  /**
   * 订阅事件
   * @param {string} event - 事件名称
   * @param {Function} callback - 回调函数
   * @returns {Function} 取消订阅函数
   */
  on(event, callback) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, [])
    }
    this._listeners.get(event).push(callback)
    
    // 返回取消订阅函数
    return () => this.off(event, callback)
  }

  /**
   * 订阅一次性事件
   * @param {string} event - 事件名称
   * @param {Function} callback - 回调函数
   */
  once(event, callback) {
    const wrapper = (...args) => {
      this.off(event, wrapper)
      callback(...args)
    }
    this.on(event, wrapper)
  }

  /**
   * 取消订阅
   * @param {string} event - 事件名称
   * @param {Function} callback - 回调函数
   */
  off(event, callback) {
    if (!this._listeners.has(event)) return
    
    const listeners = this._listeners.get(event)
    const index = listeners.indexOf(callback)
    if (index > -1) {
      listeners.splice(index, 1)
    }
  }

  /**
   * 发布事件
   * @param {string} event - 事件名称
   * @param {...any} args - 事件参数
   */
  emit(event, ...args) {
    if (!this._listeners.has(event)) return
    
    const listeners = this._listeners.get(event)
    listeners.forEach(callback => {
      try {
        callback(...args)
      } catch (error) {
        console.error(`Error in event listener for "${event}":`, error)
      }
    })
  }

  /**
   * 清除所有监听器
   * @param {string} event - 事件名称（可选，不传则清除所有）
   */
  clear(event) {
    if (event) {
      this._listeners.delete(event)
    } else {
      this._listeners.clear()
    }
  }

  /**
   * 获取事件监听器数量
   * @param {string} event - 事件名称
   * @returns {number} 监听器数量
   */
  listenerCount(event) {
    return this._listeners.get(event)?.length || 0
  }
}

export default EventManager
