/**
 * 事件管理器
 * 提供事件订阅/发布功能
 */
import type { EventCallback, IEventManager } from '../../types/event-manager'

export class EventManager implements IEventManager {
  private _listeners: Map<string, EventCallback[]>

  constructor() {
    this._listeners = new Map()
  }

  /**
   * 订阅事件
   */
  on<T = unknown>(event: string, callback: EventCallback<T>): () => void {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, [])
    }
    this._listeners.get(event)!.push(callback as EventCallback)
    
    return () => this.off(event, callback)
  }

  /**
   * 订阅一次性事件
   */
  once<T = unknown>(event: string, callback: EventCallback<T>): void {
    const wrapper = ((...args: unknown[]) => {
      this.off(event, wrapper as EventCallback<T>)
      callback(args[0] as T)
    }) as EventCallback
    this.on(event, wrapper as EventCallback<T>)
  }

  /**
   * 取消订阅
   */
  off<T = unknown>(event: string, callback: EventCallback<T>): void {
    if (!this._listeners.has(event)) return
    
    const listeners = this._listeners.get(event)!
    const index = listeners.indexOf(callback as EventCallback)
    if (index > -1) {
      listeners.splice(index, 1)
    }
  }

  /**
   * 发布事件
   */
  emit<T = unknown>(event: string, data?: T): void {
    if (!this._listeners.has(event)) return
    
    const listeners = this._listeners.get(event)!
    listeners.forEach(callback => {
      try {
        callback(data)
      } catch (error) {
        console.error(`Error in event listener for "${event}":`, error)
      }
    })
  }

  /**
   * 清除所有监听器
   */
  clear(event?: string): void {
    if (event) {
      this._listeners.delete(event)
    } else {
      this._listeners.clear()
    }
  }

  /**
   * 获取事件监听器数量
   */
  listenerCount(event: string): number {
    return this._listeners.get(event)?.length || 0
  }
}

export default EventManager
