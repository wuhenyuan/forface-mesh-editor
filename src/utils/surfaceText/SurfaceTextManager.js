import * as THREE from 'three'
import { TextGeometryGenerator } from './TextGeometryGenerator.js'
import { TextInputOverlay } from './TextInputOverlay.js'
import { TextTransformControls } from './TextTransformControls.js'
import { BooleanOperator } from './BooleanOperator.js'

/**
 * 表面文字管理器主控制器
 * 负责协调所有文字相关功能
 */
export class SurfaceTextManager {
  constructor(scene, camera, renderer, domElement, facePicker) {
    this.scene = scene
    this.camera = camera
    this.renderer = renderer
    this.domElement = domElement
    this.facePicker = facePicker
    
    // 初始化子系统
    this.geometryGenerator = new TextGeometryGenerator()
    this.inputOverlay = new TextInputOverlay(domElement)
    this.transformControls = new TextTransformControls(scene, camera, renderer)
    this.booleanOperator = new BooleanOperator()
    
    // 文字对象管理
    this.textObjects = new Map() // id -> TextObject
    this.selectedTextId = null
    this.isTextMode = false
    
    // 事件系统
    this.eventListeners = new Map()
    
    // 配置
    this.config = {
      maxTextObjects: 100,
      defaultTextConfig: this.getDefaultTextConfig(),
      performanceMode: false
    }
    
    // 绑定事件处理器
    this.setupEventHandlers()
  }
  
  /**
   * 启用文字添加模式
   */
  enableTextMode() {
    if (this.isTextMode) return
    
    this.isTextMode = true
    
    // 启用面拾取
    this.facePicker.enable()
    
    // 监听面拾取事件
    this.facePicker.on('faceSelected', this.handleFaceSelected.bind(this))
    
    console.log('文字添加模式已启用')
    this.emit('textModeEnabled')
  }
  
  /**
   * 禁用文字添加模式
   */
  disableTextMode() {
    if (!this.isTextMode) return
    
    this.isTextMode = false
    
    // 移除面拾取事件监听
    this.facePicker.off('faceSelected', this.handleFaceSelected.bind(this))
    
    // 隐藏输入覆盖层
    this.inputOverlay.hide()
    
    console.log('文字添加模式已禁用')
    this.emit('textModeDisabled')
  }
  
  /**
   * 处理面选择事件
   * @param {Object} faceInfo - 面信息
   */
  async handleFaceSelected(faceInfo) {
    if (!this.isTextMode) return
    
    try {
      // 检查是否点击了文字对象
      if (faceInfo.mesh.userData && faceInfo.mesh.userData.isTextObject) {
        // 点击的是文字对象，选择该文字
        const textId = faceInfo.mesh.userData.textId
        this.selectText(textId)
        return
      }
      
      // 计算输入框位置
      const screenPosition = this.calculateScreenPosition(faceInfo.point)
      
      // 显示输入覆盖层
      const textContent = await this.inputOverlay.show(screenPosition.x, screenPosition.y)
      
      if (textContent && this.validateTextContent(textContent)) {
        // 创建文字对象
        await this.createTextObject(textContent, faceInfo)
      }
      
    } catch (error) {
      console.error('处理面选择失败:', error)
      this.emit('error', { type: 'faceSelection', error })
    }
  }
  
  /**
   * 创建文字对象
   * @param {string} content - 文字内容
   * @param {Object} faceInfo - 面信息
   * @returns {Promise<string>} 文字对象ID
   */
  async createTextObject(content, faceInfo) {
    if (this.textObjects.size >= this.config.maxTextObjects) {
      throw new Error(`文字对象数量已达到最大限制: ${this.config.maxTextObjects}`)
    }
    
    const textId = this.generateTextId()
    
    try {
      // 生成文字几何体
      const geometry = await this.geometryGenerator.generate(content, this.config.defaultTextConfig)
      
      // 创建文字网格
      const material = new THREE.MeshPhongMaterial({ 
        color: this.config.defaultTextConfig.color 
      })
      const mesh = new THREE.Mesh(geometry, material)
      
      // 设置文字对象的用户数据，用于识别
      mesh.userData = {
        isTextObject: true,
        textId: textId,
        type: 'text'
      }
      
      // 计算文字位置和方向
      this.positionTextOnSurface(mesh, faceInfo)
      
      // 创建文字对象数据
      const textObject = {
        id: textId,
        content: content,
        mesh: mesh,
        geometry: geometry,
        material: material,
        targetMesh: faceInfo.mesh,
        targetFace: faceInfo.faceIndex,
        faceInfo: faceInfo,
        config: { ...this.config.defaultTextConfig },
        mode: 'raised',
        created: Date.now(),
        modified: Date.now()
      }
      
      // 添加到场景和管理器
      this.scene.add(mesh)
      this.textObjects.set(textId, textObject)
      
      // 将文字网格添加到面拾取器的可拾取列表中
      this.facePicker.addMesh(mesh)
      
      // 选中新创建的文字
      this.selectText(textId)
      
      console.log(`文字对象已创建: ${textId}`, textObject)
      this.emit('textCreated', textObject)
      
      return textId
      
    } catch (error) {
      console.error('创建文字对象失败:', error)
      this.emit('error', { type: 'textCreation', error, textId })
      throw error
    }
  }
  
  /**
   * 在表面上定位文字
   * @param {THREE.Mesh} textMesh - 文字网格
   * @param {Object} faceInfo - 面信息
   */
  positionTextOnSurface(textMesh, faceInfo) {
    // 设置位置
    textMesh.position.copy(faceInfo.point)
    
    // 计算表面法向量
    const normal = faceInfo.face ? faceInfo.face.normal.clone() : new THREE.Vector3(0, 1, 0)
    
    // 将法向量转换到世界坐标系
    normal.transformDirection(faceInfo.mesh.matrixWorld)
    normal.normalize()
    
    // 设置文字朝向（面向法向量）
    const up = new THREE.Vector3(0, 1, 0)
    if (Math.abs(normal.dot(up)) > 0.9) {
      up.set(1, 0, 0) // 如果法向量接近垂直，使用不同的up向量
    }
    
    textMesh.lookAt(textMesh.position.clone().add(normal))
    
    // 稍微偏移以避免z-fighting
    textMesh.position.add(normal.multiplyScalar(0.01))
  }
  
  /**
   * 计算3D点的屏幕位置
   * @param {THREE.Vector3} worldPosition - 世界坐标位置
   * @returns {Object} 屏幕坐标 {x, y}
   */
  calculateScreenPosition(worldPosition) {
    const vector = worldPosition.clone()
    vector.project(this.camera)
    
    const rect = this.domElement.getBoundingClientRect()
    const x = (vector.x * 0.5 + 0.5) * rect.width + rect.left
    const y = (vector.y * -0.5 + 0.5) * rect.height + rect.top
    
    return { x, y }
  }
  
  /**
   * 选中文字对象
   * @param {string} textId - 文字ID
   */
  selectText(textId) {
    if (!this.textObjects.has(textId)) {
      console.warn(`文字对象不存在: ${textId}`)
      return
    }
    
    // 取消之前的选择
    if (this.selectedTextId) {
      this.deselectText()
    }
    
    this.selectedTextId = textId
    const textObject = this.textObjects.get(textId)
    
    // 显示变换控制器
    this.transformControls.attach(textObject.mesh)
    
    // 添加选择高亮效果
    this.addSelectionHighlight(textObject.mesh)
    
    console.log(`文字对象已选中: ${textId}`)
    this.emit('textSelected', textObject)
  }
  
  /**
   * 取消选中文字对象
   */
  deselectText() {
    if (!this.selectedTextId) return
    
    const textObject = this.textObjects.get(this.selectedTextId)
    
    // 隐藏变换控制器
    this.transformControls.detach()
    
    // 移除选择高亮效果
    this.removeSelectionHighlight(textObject.mesh)
    
    console.log(`文字对象已取消选中: ${this.selectedTextId}`)
    this.emit('textDeselected', textObject)
    
    this.selectedTextId = null
  }
  
  /**
   * 添加选择高亮效果
   * @param {THREE.Mesh} mesh - 网格对象
   */
  addSelectionHighlight(mesh) {
    // 保存原始材质
    if (!mesh.userData.originalMaterial) {
      mesh.userData.originalMaterial = mesh.material
    }
    
    // 创建高亮材质
    const highlightMaterial = mesh.material.clone()
    highlightMaterial.emissive.setHex(0x444444) // 添加发光效果
    highlightMaterial.emissiveIntensity = 0.3
    
    mesh.material = highlightMaterial
  }
  
  /**
   * 移除选择高亮效果
   * @param {THREE.Mesh} mesh - 网格对象
   */
  removeSelectionHighlight(mesh) {
    // 恢复原始材质
    if (mesh.userData.originalMaterial) {
      mesh.material = mesh.userData.originalMaterial
      delete mesh.userData.originalMaterial
    }
  }
  
  /**
   * 删除文字对象
   * @param {string} textId - 文字ID
   */
  deleteText(textId) {
    if (!this.textObjects.has(textId)) {
      console.warn(`文字对象不存在: ${textId}`)
      return
    }
    
    const textObject = this.textObjects.get(textId)
    
    // 如果是当前选中的文字，先取消选中
    if (this.selectedTextId === textId) {
      this.deselectText()
    }
    
    // 从面拾取器中移除
    this.facePicker.removeMesh(textObject.mesh)
    
    // 从场景中移除
    this.scene.remove(textObject.mesh)
    
    // 清理几何体和材质
    textObject.geometry.dispose()
    textObject.material.dispose()
    
    // 从管理器中移除
    this.textObjects.delete(textId)
    
    console.log(`文字对象已删除: ${textId}`)
    this.emit('textDeleted', { id: textId, textObject })
  }
  
  /**
   * 更新文字内容
   * @param {string} textId - 文字ID
   * @param {string} newContent - 新内容
   */
  async updateTextContent(textId, newContent) {
    if (!this.textObjects.has(textId)) {
      console.warn(`文字对象不存在: ${textId}`)
      return
    }
    
    if (!this.validateTextContent(newContent)) {
      throw new Error('无效的文字内容')
    }
    
    const textObject = this.textObjects.get(textId)
    const oldContent = textObject.content
    
    try {
      // 生成新的几何体（使用当前配置）
      const newGeometry = await this.geometryGenerator.generate(newContent, textObject.config)
      
      // 更新网格几何体
      textObject.mesh.geometry.dispose() // 清理旧几何体
      textObject.mesh.geometry = newGeometry
      textObject.geometry = newGeometry
      textObject.content = newContent
      textObject.modified = Date.now()
      
      console.log(`文字内容已更新: ${textId}`, { oldContent, newContent })
      this.emit('textContentUpdated', { textObject, oldContent, newContent })
      
    } catch (error) {
      console.error('更新文字内容失败:', error)
      this.emit('error', { type: 'contentUpdate', error, textId })
      throw error
    }
  }
  
  /**
   * 更新文字配置并重新生成几何体
   * @param {string} textId - 文字ID
   * @param {Object} configUpdates - 配置更新
   */
  async updateTextConfig(textId, configUpdates) {
    if (!this.textObjects.has(textId)) {
      console.warn(`文字对象不存在: ${textId}`)
      return
    }
    
    const textObject = this.textObjects.get(textId)
    const oldConfig = { ...textObject.config }
    
    try {
      // 更新配置
      Object.assign(textObject.config, configUpdates)
      
      // 重新生成几何体
      const newGeometry = await this.geometryGenerator.generate(textObject.content, textObject.config)
      
      // 更新网格几何体
      textObject.mesh.geometry.dispose()
      textObject.mesh.geometry = newGeometry
      textObject.geometry = newGeometry
      textObject.modified = Date.now()
      
      console.log(`文字配置已更新: ${textId}`, { oldConfig, newConfig: textObject.config })
      this.emit('textConfigUpdated', { textObject, oldConfig, newConfig: textObject.config })
      
    } catch (error) {
      console.error('更新文字配置失败:', error)
      // 回滚配置
      textObject.config = oldConfig
      this.emit('error', { type: 'configUpdate', error, textId })
      throw error
    }
  }
  
  /**
   * 更新文字颜色
   * @param {string} textId - 文字ID
   * @param {number} color - 新颜色
   */
  updateTextColor(textId, color) {
    if (!this.textObjects.has(textId)) {
      console.warn(`文字对象不存在: ${textId}`)
      return
    }
    
    const textObject = this.textObjects.get(textId)
    const oldColor = textObject.material.color.getHex()
    
    textObject.material.color.setHex(color)
    textObject.config.color = color
    textObject.modified = Date.now()
    
    console.log(`文字颜色已更新: ${textId}`, { oldColor, newColor: color })
    this.emit('textColorUpdated', { textObject, oldColor, newColor: color })
  }
  
  /**
   * 切换文字模式（凸起/内嵌）
   * @param {string} textId - 文字ID
   * @param {string} mode - 模式 ('raised' | 'engraved')
   */
  async switchTextMode(textId, mode) {
    if (!this.textObjects.has(textId)) {
      console.warn(`文字对象不存在: ${textId}`)
      return
    }
    
    if (!['raised', 'engraved'].includes(mode)) {
      throw new Error(`无效的文字模式: ${mode}`)
    }
    
    const textObject = this.textObjects.get(textId)
    const oldMode = textObject.mode
    
    if (oldMode === mode) return // 模式相同，无需切换
    
    try {
      if (mode === 'engraved') {
        // 切换到内嵌模式，执行布尔操作
        await this.applyEngravingMode(textObject)
      } else {
        // 切换到凸起模式，恢复原始状态
        await this.applyRaisedMode(textObject)
      }
      
      textObject.mode = mode
      textObject.modified = Date.now()
      
      console.log(`文字模式已切换: ${textId}`, { oldMode, newMode: mode })
      this.emit('textModeChanged', { textObject, oldMode, newMode: mode })
      
    } catch (error) {
      console.error('切换文字模式失败:', error)
      this.emit('error', { type: 'modeSwitch', error, textId })
      throw error
    }
  }
  
  /**
   * 应用内嵌模式
   * @param {Object} textObject - 文字对象
   */
  async applyEngravingMode(textObject) {
    // 执行布尔减法操作
    const result = await this.booleanOperator.subtract(
      textObject.targetMesh.geometry,
      textObject.geometry,
      textObject.mesh.matrix
    )
    
    if (result) {
      // 更新目标网格几何体
      textObject.targetMesh.geometry.dispose()
      textObject.targetMesh.geometry = result
      
      // 隐藏文字网格（因为已经雕刻到目标网格中）
      textObject.mesh.visible = false
    } else {
      throw new Error('布尔操作失败')
    }
  }
  
  /**
   * 应用凸起模式
   * @param {Object} textObject - 文字对象
   */
  async applyRaisedMode(textObject) {
    // 如果之前是内嵌模式，需要恢复原始几何体
    if (textObject.mode === 'engraved') {
      // 这里需要保存原始几何体的备份
      // 暂时简化处理：显示文字网格
      textObject.mesh.visible = true
    }
  }
  
  /**
   * 获取所有文字对象
   * @returns {Array} 文字对象数组
   */
  getAllTextObjects() {
    return Array.from(this.textObjects.values())
  }
  
  /**
   * 获取选中的文字对象
   * @returns {Object|null} 文字对象或null
   */
  getSelectedTextObject() {
    return this.selectedTextId ? this.textObjects.get(this.selectedTextId) : null
  }
  
  /**
   * 设置事件处理器
   */
  setupEventHandlers() {
    // 监听变换控制器事件
    this.transformControls.on('change', () => {
      if (this.selectedTextId) {
        const textObject = this.textObjects.get(this.selectedTextId)
        textObject.modified = Date.now()
        this.emit('textTransformed', textObject)
      }
    })
    
    // 监听输入覆盖层事件
    this.inputOverlay.on('cancel', () => {
      console.log('文字输入已取消')
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
   * 销毁管理器，清理资源
   */
  destroy() {
    // 禁用文字模式
    this.disableTextMode()
    
    // 删除所有文字对象
    const textIds = Array.from(this.textObjects.keys())
    textIds.forEach(id => this.deleteText(id))
    
    // 清理子系统
    this.transformControls.dispose()
    this.inputOverlay.destroy()
    
    // 清理事件监听器
    this.eventListeners.clear()
    
    console.log('表面文字管理器已销毁')
  }
  
  /**
   * 验证文字内容
   * @param {string} content - 文字内容
   * @returns {boolean} 是否有效
   */
  validateTextContent(content) {
    return typeof content === 'string' && content.trim().length > 0
  }
  
  /**
   * 生成唯一文字ID
   * @returns {string} 唯一ID
   */
  generateTextId() {
    return `text_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
  }
  
  /**
   * 获取默认文字配置
   * @returns {Object} 默认配置
   */
  getDefaultTextConfig() {
    return {
      font: 'helvetiker',
      size: 1,
      thickness: 0.1,
      color: 0x333333,
      mode: 'raised', // 'raised' | 'engraved'
      curveSegments: 12,
      bevelEnabled: false,
      bevelThickness: 0.02,
      bevelSize: 0.01,
      bevelOffset: 0,
      bevelSegments: 5
    }
  }
}