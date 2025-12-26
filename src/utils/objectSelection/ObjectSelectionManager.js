import { ObjectSelector } from './ObjectSelector.js'
import { ObjectTransformControls } from './ObjectTransformControls.js'

/**
 * 物体选择管理器
 * 统一管理物体选择和变换控制
 */
export class ObjectSelectionManager {
  constructor(scene, camera, renderer, domElement) {
    this.scene = scene
    this.camera = camera
    this.renderer = renderer
    this.domElement = domElement
    
    // 创建子系统
    this.objectSelector = new ObjectSelector(scene, camera, renderer, domElement)
    this.transformControls = new ObjectTransformControls(scene, camera, renderer, domElement)
    
    // 状态
    this.enabled = false
    this.selectedObject = null
    
    // 事件系统
    this.eventListeners = new Map()
    
    // 配置
    this.config = {
      enableTransformControls: true,
      defaultTransformMode: 'translate',
      enableHover: true,
      highlightConfig: {
        color: 0x00ff00,
        emissive: 0x004400,
        emissiveIntensity: 0.2
      }
    }
    
    // 设置事件监听
    this.setupEvents()
  }
  
  /**
   * 设置事件监听
   */
  setupEvents() {
    // 物体选择事件
    this.objectSelector.on('objectSelected', (object) => {
      this.selectedObject = object
      
      // 如果启用变换控制器，附加到选中的物体
      if (this.config.enableTransformControls) {
        this.transformControls.attach(object)
      }
      
      console.log('物体选择管理器：物体已选中', object.name || object.uuid)
      this.emit('objectSelected', object)
    })
    
    this.objectSelector.on('objectDeselected', (object) => {
      this.selectedObject = null
      
      // 分离变换控制器
      this.transformControls.detach()
      
      console.log('物体选择管理器：物体已取消选择')
      this.emit('objectDeselected', object)
    })
    
    this.objectSelector.on('selectionCleared', () => {
      this.selectedObject = null
      this.transformControls.detach()
      
      console.log('物体选择管理器：选择已清除')
      this.emit('selectionCleared')
    })
    
    // 变换控制器事件
    this.transformControls.on('draggingChanged', (isDragging) => {
      // 转发拖拽状态变化事件（用于禁用/启用相机控制）
      this.emit('draggingChanged', isDragging)
    })
    
    this.transformControls.on('objectTransformed', (data) => {
      this.emit('objectTransformed', data)
    })
    
    this.transformControls.on('dragStart', (data) => {
      this.emit('dragStart', data)
    })
    
    this.transformControls.on('dragEnd', (data) => {
      this.emit('dragEnd', data)
    })
    
    this.transformControls.on('modeChanged', (mode) => {
      this.emit('transformModeChanged', mode)
    })
  }
  
  /**
   * 启用物体选择管理器
   */
  enable() {
    if (this.enabled) return
    
    this.enabled = true
    
    // 启用子系统
    this.objectSelector.enable()
    if (this.config.enableTransformControls) {
      this.transformControls.enable()
    }
    
    console.log('物体选择管理器已启用')
    this.emit('enabled')
  }
  
  /**
   * 禁用物体选择管理器
   */
  disable() {
    if (!this.enabled) return
    
    this.enabled = false
    
    // 禁用子系统
    this.objectSelector.disable()
    this.transformControls.disable()
    
    // 清除状态
    this.selectedObject = null
    
    console.log('物体选择管理器已禁用')
    this.emit('disabled')
  }
  
  /**
   * 设置可选择的物体列表
   * @param {THREE.Object3D[]} objects - 物体数组
   */
  setSelectableObjects(objects) {
    this.objectSelector.setSelectableObjects(objects)
  }
  
  /**
   * 添加可选择的物体
   * @param {THREE.Object3D} object - 物体
   */
  addSelectableObject(object) {
    this.objectSelector.addSelectableObject(object)
  }
  
  /**
   * 移除可选择的物体
   * @param {THREE.Object3D} object - 物体
   */
  removeSelectableObject(object) {
    this.objectSelector.removeSelectableObject(object)
  }
  
  /**
   * 选择物体
   * @param {THREE.Object3D} object - 要选择的物体
   */
  selectObject(object) {
    this.objectSelector.selectObject(object)
  }
  
  /**
   * 清除选择
   */
  clearSelection() {
    this.objectSelector.clearSelection()
  }
  
  /**
   * 获取当前选中的物体
   * @returns {THREE.Object3D|null} 选中的物体
   */
  getSelectedObject() {
    return this.selectedObject
  }
  
  /**
   * 设置变换模式
   * @param {'translate'|'rotate'|'scale'} mode - 变换模式
   */
  setTransformMode(mode) {
    this.transformControls.setMode(mode)
  }
  
  /**
   * 获取当前变换模式
   * @returns {string} 当前模式
   */
  getTransformMode() {
    return this.transformControls.getMode()
  }
  
  /**
   * 启用/禁用变换控制器
   * @param {boolean} enabled - 是否启用
   */
  setTransformControlsEnabled(enabled) {
    this.config.enableTransformControls = enabled
    
    if (enabled) {
      this.transformControls.enable()
      // 如果有选中的物体，重新附加
      if (this.selectedObject) {
        this.transformControls.attach(this.selectedObject)
      }
    } else {
      this.transformControls.disable()
    }
  }
  
  /**
   * 检查是否正在拖拽
   * @returns {boolean} 是否正在拖拽
   */
  isDragging() {
    return this.transformControls.isDragging()
  }
  
  /**
   * 设置高亮配置
   * @param {Object} config - 高亮配置
   */
  setHighlightConfig(config) {
    Object.assign(this.config.highlightConfig, config)
    this.objectSelector.setHighlightConfig(this.config.highlightConfig)
  }
  
  /**
   * 设置变换控制器配置
   * @param {Object} config - 配置
   */
  setTransformConfig(config) {
    if (config.size !== undefined) {
      this.transformControls.setSize(config.size)
    }
    
    if (config.space !== undefined) {
      this.transformControls.setSpace(config.space)
    }
    
    if (config.axes !== undefined) {
      this.transformControls.setAxesVisibility(config.axes)
    }
    
    if (config.snap !== undefined) {
      this.transformControls.setSnap(config.snap)
    }
  }
  
  /**
   * 获取完整状态
   * @returns {Object} 状态信息
   */
  getState() {
    return {
      enabled: this.enabled,
      selectedObject: this.selectedObject ? {
        name: this.selectedObject.name || 'Unnamed',
        uuid: this.selectedObject.uuid,
        position: this.selectedObject.position.clone(),
        rotation: this.selectedObject.rotation.clone(),
        scale: this.selectedObject.scale.clone()
      } : null,
      transformMode: this.transformControls.getMode(),
      isDragging: this.transformControls.isDragging(),
      config: { ...this.config }
    }
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
   * 销毁管理器
   */
  destroy() {
    this.disable()
    this.objectSelector.destroy()
    this.transformControls.destroy()
    this.eventListeners.clear()
    this.selectedObject = null
  }
}

// 导出所有相关类
export { ObjectSelector, ObjectTransformControls }