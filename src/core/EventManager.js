/**
 * 事件管理器
 * 统一管理 Viewer 内部和外部的事件通信
 */
export class EventManager {
  constructor() {
    this._listeners = new Map()
  }
  
  /**
   * 注册事件监听
   * @param {string} event 事件名
   * @param {Function} callback 回调函数
   * @returns {Function} 取消监听的函数
   */
  on(event, callback) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set())
    }
    this._listeners.get(event).add(callback)
    
    // 返回取消监听函数
    return () => this.off(event, callback)
  }
  
  /**
   * 注册一次性事件监听
   */
  once(event, callback) {
    const wrapper = (...args) => {
      this.off(event, wrapper)
      callback(...args)
    }
    return this.on(event, wrapper)
  }
  
  /**
   * 取消事件监听
   */
  off(event, callback) {
    if (!this._listeners.has(event)) return
    
    if (callback) {
      this._listeners.get(event).delete(callback)
    } else {
      this._listeners.delete(event)
    }
  }
  
  /**
   * 触发事件
   * @param {string} event 事件名
   * @param {any} data 事件数据
   */
  emit(event, data) {
    if (!this._listeners.has(event)) return
    
    this._listeners.get(event).forEach(callback => {
      try {
        callback(data)
      } catch (error) {
        console.error(`Event "${event}" handler error:`, error)
      }
    })
  }
  
  /**
   * 清除所有监听
   */
  clear() {
    this._listeners.clear()
  }
}

export default EventManager
