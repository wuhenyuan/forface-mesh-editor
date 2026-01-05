import * as THREE from 'three'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'

/**
 * 文字变换控制器
 * 提供文字对象的位置、旋转、缩放控制
 */
export class TextTransformControls {
  [key: string]: any;
  constructor(scene, camera, renderer) {
    this.scene = scene
    this.camera = camera
    this.renderer = renderer
    
    // 创建变换控制器
    this.controls = new TransformControls(camera, renderer.domElement)
    this.controls.setMode('translate') // 默认为移动模式
    this.controls.setSpace('world') // 世界坐标系
    
    // 添加到场景
    this.scene.add(this.controls)
    
    // 事件监听器
    this.eventListeners = new Map()
    
    // 当前附加的对象
    this.attachedObject = null
    
    // 设置事件处理
    this.setupEventHandlers()
  }
  
  /**
   * 设置事件处理器
   */
  setupEventHandlers() {
    // 变换开始
    this.controls.addEventListener('dragging-changed', (event) => {
      // 禁用/启用轨道控制器（如果存在）
      this.emit('dragging-changed', event.value)
    })
    
    // 变换中
    this.controls.addEventListener('change', () => {
      this.emit('change', this.attachedObject)
    })
    
    // 对象变换
    this.controls.addEventListener('objectChange', () => {
      this.emit('objectChange', this.attachedObject)
    })
  }
  
  /**
   * 附加到对象
   * @param {THREE.Object3D} object - 要控制的对象
   */
  attach(object) {
    if (!object) {
      console.warn('尝试附加空对象到变换控制器')
      return
    }
    
    this.attachedObject = object
    this.controls.attach(object)
    this.controls.visible = true
    
    console.log('变换控制器已附加到对象:', object.name || object.uuid)
    this.emit('attached', object)
  }
  
  /**
   * 分离对象
   */
  detach() {
    if (this.attachedObject) {
      const object = this.attachedObject
      this.controls.detach()
      this.controls.visible = false
      this.attachedObject = null
      
      console.log('变换控制器已分离对象:', object.name || object.uuid)
      this.emit('detached', object)
    }
  }
  
  /**
   * 设置变换模式
   * @param {'translate'|'rotate'|'scale'} mode - 变换模式
   */
  setMode(mode) {
    if (['translate', 'rotate', 'scale'].includes(mode)) {
      this.controls.setMode(mode)
      this.emit('modeChanged', mode)
    } else {
      console.warn('无效的变换模式:', mode)
    }
  }
  
  /**
   * 获取当前变换模式
   * @returns {string} 当前模式
   */
  getMode() {
    return this.controls.getMode()
  }
  
  /**
   * 设置坐标空间
   * @param {'world'|'local'} space - 坐标空间
   */
  setSpace(space) {
    if (['world', 'local'].includes(space)) {
      this.controls.setSpace(space)
      this.emit('spaceChanged', space)
    } else {
      console.warn('无效的坐标空间:', space)
    }
  }
  
  /**
   * 获取当前坐标空间
   * @returns {string} 当前坐标空间
   */
  getSpace() {
    return this.controls.space
  }
  
  /**
   * 设置控制器大小
   * @param {number} size - 大小
   */
  setSize(size) {
    this.controls.setSize(size)
  }
  
  /**
   * 获取控制器大小
   * @returns {number} 当前大小
   */
  getSize() {
    return this.controls.size
  }
  
  /**
   * 启用/禁用控制器
   * @param {boolean} enabled - 是否启用
   */
  setEnabled(enabled) {
    this.controls.enabled = enabled
    this.emit('enabledChanged', enabled)
  }
  
  /**
   * 检查控制器是否启用
   * @returns {boolean} 是否启用
   */
  isEnabled() {
    return this.controls.enabled
  }
  
  /**
   * 显示/隐藏控制器
   * @param {boolean} visible - 是否可见
   */
  setVisible(visible) {
    this.controls.visible = visible
    this.emit('visibilityChanged', visible)
  }
  
  /**
   * 检查控制器是否可见
   * @returns {boolean} 是否可见
   */
  isVisible() {
    return this.controls.visible
  }
  
  /**
   * 获取当前附加的对象
   * @returns {THREE.Object3D|null} 附加的对象
   */
  getAttachedObject() {
    return this.attachedObject
  }
  
  /**
   * 设置拖拽阈值
   * @param {number} threshold - 阈值
   */
  setDragThreshold(threshold) {
    // TransformControls没有直接的拖拽阈值设置
    // 这里可以实现自定义逻辑
    console.log('设置拖拽阈值:', threshold)
  }
  
  /**
   * 重置变换
   */
  reset() {
    if (this.attachedObject) {
      this.attachedObject.position.set(0, 0, 0)
      this.attachedObject.rotation.set(0, 0, 0)
      this.attachedObject.scale.set(1, 1, 1)
      this.emit('reset', this.attachedObject)
    }
  }
  
  /**
   * 获取变换信息
   * @returns {Object|null} 变换信息
   */
  getTransformInfo() {
    if (!this.attachedObject) return null
    
    return {
      position: this.attachedObject.position.clone(),
      rotation: this.attachedObject.rotation.clone(),
      scale: this.attachedObject.scale.clone(),
      mode: this.getMode(),
      space: this.getSpace(),
      enabled: this.isEnabled(),
      visible: this.isVisible()
    }
  }
  
  /**
   * 应用变换
   * @param {Object} transform - 变换数据
   */
  applyTransform(transform) {
    if (!this.attachedObject || !transform) return
    
    if (transform.position) {
      this.attachedObject.position.copy(transform.position)
    }
    if (transform.rotation) {
      this.attachedObject.rotation.copy(transform.rotation)
    }
    if (transform.scale) {
      this.attachedObject.scale.copy(transform.scale)
    }
    
    this.emit('transformApplied', transform)
  }
  
  /**
   * 添加事件监听器
   * @param {string} eventName - 事件名称
   * @param {Function} callback - 回调函数
   */
  on(eventName, callback) {
    if (!this.eventListeners.has(eventName)) {
      this.eventListeners.set(eventName, [])
    }
    this.eventListeners.get(eventName).push(callback)
  }
  
  /**
   * 移除事件监听器
   * @param {string} eventName - 事件名称
   * @param {Function} callback - 回调函数
   */
  off(eventName, callback) {
    if (!this.eventListeners.has(eventName)) return
    
    const listeners = this.eventListeners.get(eventName)
    const index = listeners.indexOf(callback)
    if (index !== -1) {
      listeners.splice(index, 1)
    }
  }
  
  /**
   * 发出事件
   * @param {string} eventName - 事件名称
   * @param {...any} args - 事件参数
   */
  emit(eventName, ...args) {
    if (!this.eventListeners.has(eventName)) return
    
    const listeners = this.eventListeners.get(eventName)
    listeners.forEach(callback => {
      try {
        callback(...args)
      } catch (error) {
        console.error(`Error in event listener for ${eventName}:`, error)
      }
    })
  }
  
  /**
   * 销毁控制器，清理资源
   */
  dispose() {
    this.detach()
    this.scene.remove(this.controls)
    this.controls.dispose()
    this.eventListeners.clear()
    
    console.log('文字变换控制器已销毁')
  }
}
