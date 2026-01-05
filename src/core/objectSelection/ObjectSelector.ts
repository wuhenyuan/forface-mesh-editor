import * as THREE from 'three'

/**
 * 物体选择器
 * 负责整个物体的选择和高亮
 */
export class ObjectSelector {
  [key: string]: any;
  constructor(scene, camera, renderer, domElement) {
    this.scene = scene
    this.camera = camera
    this.renderer = renderer
    this.domElement = domElement
    
    // 射线投射器
    this.raycaster = new THREE.Raycaster()
    this.mouse = new THREE.Vector2()
    
    // 状态
    this.enabled = false
    this.selectableObjects = [] // 可选择的物体列表
    this.selectedObject = null // 当前选中的物体
    
    // 事件系统
    this.eventListeners = new Map()
    
    // 高亮材质缓存
    this.originalMaterials = new Map()
    
    // 绑定事件处理器
    this.handleClick = this.handleClick.bind(this)
    this.handleMouseMove = this.handleMouseMove.bind(this)
    
    // 高亮配置
    this.highlightConfig = {
      color: 0x00ff00,
      emissive: 0x004400,
      emissiveIntensity: 0.2
    }
  }
  
  /**
   * 启用物体选择
   */
  enable() {
    if (this.enabled) return
    
    this.enabled = true
    this.domElement.addEventListener('click', this.handleClick)
    this.domElement.addEventListener('mousemove', this.handleMouseMove)
    
    console.log('物体选择器已启用')
    this.emit('enabled')
  }
  
  /**
   * 禁用物体选择
   */
  disable() {
    if (!this.enabled) return
    
    this.enabled = false
    this.domElement.removeEventListener('click', this.handleClick)
    this.domElement.removeEventListener('mousemove', this.handleMouseMove)
    
    // 清除选择和高亮
    this.clearSelection()
    this.clearAllHighlights()
    
    console.log('物体选择器已禁用')
    this.emit('disabled')
  }
  
  /**
   * 设置可选择的物体列表
   * @param {THREE.Object3D[]} objects - 物体数组
   */
  setSelectableObjects(objects) {
    this.selectableObjects = objects
  }
  
  /**
   * 添加可选择的物体
   * @param {THREE.Object3D} object - 物体
   */
  addSelectableObject(object) {
    if (!this.selectableObjects.includes(object)) {
      this.selectableObjects.push(object)
    }
  }
  
  /**
   * 移除可选择的物体
   * @param {THREE.Object3D} object - 物体
   */
  removeSelectableObject(object) {
    const index = this.selectableObjects.indexOf(object)
    if (index !== -1) {
      this.selectableObjects.splice(index, 1)
    }
    
    // 如果移除的是当前选中的物体，清除选择
    if (this.selectedObject === object) {
      this.clearSelection()
    }
  }
  
  /**
   * 处理点击事件
   * @param {MouseEvent} event - 鼠标事件
   */
  handleClick(event) {
    if (!this.enabled) return
    
    // 更新鼠标位置
    this.updateMousePosition(event)
    
    // 执行射线投射
    this.raycaster.setFromCamera(this.mouse, this.camera)
    const intersects = this.raycaster.intersectObjects(this.selectableObjects, true)
    
    if (intersects.length > 0) {
      // 找到最顶层的可选择物体
      let targetObject = intersects[0].object
      while (targetObject.parent && !this.selectableObjects.includes(targetObject)) {
        targetObject = targetObject.parent
      }
      
      if (this.selectableObjects.includes(targetObject)) {
        this.selectObject(targetObject)
      }
    } else {
      // 点击空白区域，清除选择
      this.clearSelection()
    }
  }
  
  /**
   * 处理鼠标移动事件（悬停效果）
   * @param {MouseEvent} event - 鼠标事件
   */
  handleMouseMove(event) {
    if (!this.enabled) return
    
    // 更新鼠标位置
    this.updateMousePosition(event)
    
    // 执行射线投射
    this.raycaster.setFromCamera(this.mouse, this.camera)
    const intersects = this.raycaster.intersectObjects(this.selectableObjects, true)
    
    // 清除之前的悬停高亮
    this.clearHoverHighlights()
    
    if (intersects.length > 0) {
      // 找到最顶层的可选择物体
      let targetObject = intersects[0].object
      while (targetObject.parent && !this.selectableObjects.includes(targetObject)) {
        targetObject = targetObject.parent
      }
      
      if (this.selectableObjects.includes(targetObject) && targetObject !== this.selectedObject) {
        this.addHoverHighlight(targetObject)
        this.domElement.style.cursor = 'pointer'
      } else {
        this.domElement.style.cursor = 'default'
      }
    } else {
      this.domElement.style.cursor = 'default'
    }
  }
  
  /**
   * 更新鼠标位置
   * @param {MouseEvent} event - 鼠标事件
   */
  updateMousePosition(event) {
    const rect = this.domElement.getBoundingClientRect()
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  }
  
  /**
   * 选择物体
   * @param {THREE.Object3D} object - 要选择的物体
   */
  selectObject(object) {
    if (this.selectedObject === object) return
    
    // 清除之前的选择
    this.clearSelection()
    
    this.selectedObject = object
    this.addSelectionHighlight(object)
    
    console.log('物体已选中:', object.name || object.uuid)
    this.emit('objectSelected', object)
  }
  
  /**
   * 清除选择
   */
  clearSelection() {
    if (!this.selectedObject) return
    
    this.removeSelectionHighlight(this.selectedObject)
    const previousObject = this.selectedObject
    this.selectedObject = null
    
    console.log('选择已清除')
    this.emit('objectDeselected', previousObject)
    this.emit('selectionCleared')
  }
  
  /**
   * 添加选择高亮
   * @param {THREE.Object3D} object - 物体
   */
  addSelectionHighlight(object) {
    this.traverseAndHighlight(object, 'selection')
  }
  
  /**
   * 移除选择高亮
   * @param {THREE.Object3D} object - 物体
   */
  removeSelectionHighlight(object) {
    this.traverseAndRestoreMaterial(object, 'selection')
  }
  
  /**
   * 添加悬停高亮
   * @param {THREE.Object3D} object - 物体
   */
  addHoverHighlight(object) {
    this.traverseAndHighlight(object, 'hover')
  }
  
  /**
   * 清除悬停高亮
   */
  clearHoverHighlights() {
    // 遍历所有物体，移除悬停高亮
    this.selectableObjects.forEach(object => {
      this.traverseAndRestoreMaterial(object, 'hover')
    })
  }
  
  /**
   * 清除所有高亮
   */
  clearAllHighlights() {
    this.selectableObjects.forEach(object => {
      this.traverseAndRestoreMaterial(object, 'selection')
      this.traverseAndRestoreMaterial(object, 'hover')
    })
  }
  
  /**
   * 遍历物体并应用高亮
   * @param {THREE.Object3D} object - 物体
   * @param {string} type - 高亮类型 ('selection' | 'hover')
   */
  traverseAndHighlight(object, type) {
    object.traverse((child) => {
      if (child.isMesh && child.material) {
        const key = `${child.uuid}_${type}`
        
        // 保存原始材质
        if (!this.originalMaterials.has(key)) {
          this.originalMaterials.set(key, child.material)
        }
        
        // 创建高亮材质
        const highlightMaterial = child.material.clone()
        
        if (type === 'selection') {
          highlightMaterial.color.setHex(this.highlightConfig.color)
          highlightMaterial.emissive.setHex(this.highlightConfig.emissive)
          highlightMaterial.emissiveIntensity = this.highlightConfig.emissiveIntensity
        } else if (type === 'hover') {
          highlightMaterial.emissive.setHex(0x222222)
          highlightMaterial.emissiveIntensity = 0.1
        }
        
        child.material = highlightMaterial
      }
    })
  }
  
  /**
   * 遍历物体并恢复材质
   * @param {THREE.Object3D} object - 物体
   * @param {string} type - 高亮类型 ('selection' | 'hover')
   */
  traverseAndRestoreMaterial(object, type) {
    object.traverse((child) => {
      if (child.isMesh && child.material) {
        const key = `${child.uuid}_${type}`
        
        if (this.originalMaterials.has(key)) {
          child.material = this.originalMaterials.get(key)
          this.originalMaterials.delete(key)
        }
      }
    })
  }
  
  /**
   * 获取当前选中的物体
   * @returns {THREE.Object3D|null} 选中的物体
   */
  getSelectedObject() {
    return this.selectedObject
  }
  
  /**
   * 设置高亮配置
   * @param {Object} config - 高亮配置
   */
  setHighlightConfig(config) {
    Object.assign(this.highlightConfig, config)
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
   * 销毁选择器
   */
  destroy() {
    this.disable()
    this.clearAllHighlights()
    this.originalMaterials.clear()
    this.eventListeners.clear()
    this.selectableObjects = []
    this.selectedObject = null
  }
}
