import * as THREE from 'three'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'

/**
 * 物体变换控制器
 * 负责显示和处理物体的变换操作（移动、旋转、缩放）
 */
export class ObjectTransformControls {
  [key: string]: any;
  constructor(scene, camera, renderer, domElement) {
    this.scene = scene
    this.camera = camera
    this.renderer = renderer
    this.domElement = domElement
    
    // 创建变换控制器
    this.transformControls = new TransformControls(camera, domElement)
    this.scene.add(this.transformControls)
    
    // 状态
    this.enabled = false
    this.currentObject = null
    this.mode = 'translate' // 'translate' | 'rotate' | 'scale'
    
    // 事件系统
    this.eventListeners = new Map()
    
    // 配置
    this.config = {
      size: 1,
      showX: true,
      showY: true,
      showZ: true,
      space: 'world', // 'world' | 'local'
      translationSnap: null,
      rotationSnap: null,
      scaleSnap: null
    }
    
    // 设置初始配置
    this.applyConfig()
    
    // 绑定事件
    this.setupEvents()
    
    // Align underlying TransformControls state with wrapper (disabled by default)
    this.transformControls.enabled = false
  }
  
  /**
   * 设置初始配置
   */
  applyConfig() {
    this.transformControls.setMode(this.mode)
    this.transformControls.setSize(this.config.size)
    this.transformControls.setSpace(this.config.space)
    
    this.transformControls.showX = this.config.showX
    this.transformControls.showY = this.config.showY
    this.transformControls.showZ = this.config.showZ
    
    if (this.config.translationSnap) {
      this.transformControls.setTranslationSnap(this.config.translationSnap)
    }
    if (this.config.rotationSnap) {
      this.transformControls.setRotationSnap(this.config.rotationSnap)
    }
    if (this.config.scaleSnap) {
      this.transformControls.setScaleSnap(this.config.scaleSnap)
    }
  }
  
  /**
   * 设置事件监听
   */
  setupEvents() {
    // 开始拖拽
    this.transformControls.addEventListener('dragging-changed', (event) => {
      const isDragging = event.value
      
      if (isDragging) {
        console.log('开始拖拽物体')
        this.emit('dragStart', {
          object: this.currentObject,
          mode: this.mode
        })
      } else {
        console.log('结束拖拽物体')
        this.emit('dragEnd', {
          object: this.currentObject,
          mode: this.mode
        })
      }
      
      // 发出拖拽状态变化事件（用于禁用/启用相机控制）
      this.emit('draggingChanged', isDragging)
    })
    
    // 物体变换中
    this.transformControls.addEventListener('change', () => {
      if (this.currentObject) {
        this.emit('objectTransformed', {
          object: this.currentObject,
          mode: this.mode,
          position: this.currentObject.position.clone(),
          rotation: this.currentObject.rotation.clone(),
          scale: this.currentObject.scale.clone()
        })
      }
    })
    
    // 鼠标悬停在控制器上
    this.transformControls.addEventListener('mouseDown', () => {
      this.emit('controlMouseDown')
    })
    
    this.transformControls.addEventListener('mouseUp', () => {
      this.emit('controlMouseUp')
    })
  }
  
  /**
   * 启用变换控制器
   */
  enable() {
    if (this.enabled) return
    
    this.enabled = true
    this.transformControls.enabled = true
    
    console.log('变换控制器已启用')
    this.emit('enabled')
  }
  
  /**
   * 禁用变换控制器
   */
  disable() {
    if (!this.enabled) return
    
    this.enabled = false
    this.transformControls.enabled = false
    this.detach()
    
    console.log('变换控制器已禁用')
    this.emit('disabled')
  }
  
  /**
   * 附加到物体
   * @param {THREE.Object3D} object - 要控制的物体
   */
  attach(object) {
    if (!object) return
    
    this.currentObject = object
    this.transformControls.attach(object)
    
    console.log('变换控制器已附加到物体:', object.name || object.uuid)
    this.emit('attached', object)
  }
  
  /**
   * 从物体分离
   */
  detach() {
    if (!this.currentObject) return
    
    const previousObject = this.currentObject
    this.transformControls.detach()
    this.currentObject = null
    
    console.log('变换控制器已分离')
    this.emit('detached', previousObject)
  }
  
  /**
   * 设置变换模式
   * @param {'translate'|'rotate'|'scale'} mode - 变换模式
   */
  setMode(mode) {
    if (!['translate', 'rotate', 'scale'].includes(mode)) {
      console.warn('无效的变换模式:', mode)
      return
    }
    
    this.mode = mode
    this.transformControls.setMode(mode)
    
    console.log('变换模式已设置为:', mode)
    this.emit('modeChanged', mode)
  }
  
  /**
   * 获取当前变换模式
   * @returns {string} 当前模式
   */
  getMode() {
    return this.mode
  }
  
  /**
   * 设置坐标空间
   * @param {'world'|'local'} space - 坐标空间
   */
  setSpace(space) {
    if (!['world', 'local'].includes(space)) {
      console.warn('无效的坐标空间:', space)
      return
    }
    
    this.config.space = space
    this.transformControls.setSpace(space)
    
    console.log('坐标空间已设置为:', space)
    this.emit('spaceChanged', space)
  }
  
  /**
   * 获取当前坐标空间
   * @returns {string} 当前坐标空间
   */
  getSpace() {
    return this.config.space
  }
  
  /**
   * 设置控制器大小
   * @param {number} size - 大小
   */
  setSize(size) {
    this.config.size = size
    this.transformControls.setSize(size)
    
    this.emit('sizeChanged', size)
  }
  
  /**
   * 设置轴显示
   * @param {Object} axes - 轴显示配置 {x: boolean, y: boolean, z: boolean}
   */
  setAxesVisibility(axes) {
    if (axes.x !== undefined) {
      this.config.showX = axes.x
      this.transformControls.showX = axes.x
    }
    if (axes.y !== undefined) {
      this.config.showY = axes.y
      this.transformControls.showY = axes.y
    }
    if (axes.z !== undefined) {
      this.config.showZ = axes.z
      this.transformControls.showZ = axes.z
    }
    
    this.emit('axesVisibilityChanged', {
      x: this.config.showX,
      y: this.config.showY,
      z: this.config.showZ
    })
  }
  
  /**
   * 设置吸附
   * @param {Object} snap - 吸附配置
   */
  setSnap(snap) {
    if (snap.translation !== undefined) {
      this.config.translationSnap = snap.translation
      if (snap.translation) {
        this.transformControls.setTranslationSnap(snap.translation)
      }
    }
    
    if (snap.rotation !== undefined) {
      this.config.rotationSnap = snap.rotation
      if (snap.rotation) {
        this.transformControls.setRotationSnap(snap.rotation)
      }
    }
    
    if (snap.scale !== undefined) {
      this.config.scaleSnap = snap.scale
      if (snap.scale) {
        this.transformControls.setScaleSnap(snap.scale)
      }
    }
    
    this.emit('snapChanged', {
      translation: this.config.translationSnap,
      rotation: this.config.rotationSnap,
      scale: this.config.scaleSnap
    })
  }
  
  /**
   * 获取当前附加的物体
   * @returns {THREE.Object3D|null} 当前物体
   */
  getCurrentObject() {
    return this.currentObject
  }
  
  /**
   * 检查是否正在拖拽
   * @returns {boolean} 是否正在拖拽
   */
  isDragging() {
    return this.transformControls.dragging
  }
  
  /**
   * 获取变换控制器实例（用于高级操作）
   * @returns {TransformControls} 变换控制器实例
   */
  getTransformControls() {
    return this.transformControls
  }
  
  /**
   * 重置物体变换
   */
  resetTransform() {
    if (!this.currentObject) return
    
    const object = this.currentObject
    const originalTransform = {
      position: object.position.clone(),
      rotation: object.rotation.clone(),
      scale: object.scale.clone()
    }
    
    object.position.set(0, 0, 0)
    object.rotation.set(0, 0, 0)
    object.scale.set(1, 1, 1)
    
    this.emit('transformReset', {
      object,
      originalTransform
    })
  }
  
  /**
   * 复制物体变换
   * @returns {Object|null} 变换数据
   */
  copyTransform() {
    if (!this.currentObject) return null
    
    return {
      position: this.currentObject.position.clone(),
      rotation: this.currentObject.rotation.clone(),
      scale: this.currentObject.scale.clone()
    }
  }
  
  /**
   * 粘贴物体变换
   * @param {Object} transform - 变换数据
   */
  pasteTransform(transform) {
    if (!this.currentObject || !transform) return
    
    const object = this.currentObject
    const originalTransform = this.copyTransform()
    
    if (transform.position) {
      object.position.copy(transform.position)
    }
    if (transform.rotation) {
      object.rotation.copy(transform.rotation)
    }
    if (transform.scale) {
      object.scale.copy(transform.scale)
    }
    
    this.emit('transformPasted', {
      object,
      originalTransform,
      newTransform: transform
    })
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
   * 销毁变换控制器
   */
  destroy() {
    this.disable()
    this.scene.remove(this.transformControls)
    this.transformControls.dispose()
    this.eventListeners.clear()
    this.currentObject = null
  }
}
