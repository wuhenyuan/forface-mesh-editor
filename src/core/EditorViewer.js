/**
 * 编辑器专用 Viewer
 * 在基础 Viewer 上集成面拾取、文字系统、物体选择等功能
 */
import { Viewer } from './Viewer.js'
import { FacePicker, FacePickingUtils } from '../utils/facePicking/index.js'
import { SurfaceTextManager } from '../utils/surfaceText/index.js'
import { ObjectSelectionManager } from '../utils/objectSelection/index.js'

export class EditorViewer extends Viewer {
  constructor(container, options = {}) {
    super(container, options)
    
    // 子系统
    this._facePicker = null
    this._surfaceTextManager = null
    this._objectSelectionManager = null
    
    // 文字对象列表
    this._textObjects = []
    this._selectedTextId = null
    
    // 模式状态
    this._textModeEnabled = false
    this._facePickingEnabled = false
    this._objectSelectionEnabled = false
  }
  
  // ==================== 面拾取系统 ====================
  
  /**
   * 初始化面拾取
   */
  initFacePicking() {
    if (this._facePicker) return this._facePicker
    
    try {
      this._facePicker = new FacePicker(
        this.scene, 
        this.camera, 
        this.renderer, 
        this.container
      )
      
      const validMeshes = this._meshes.filter(mesh => 
        FacePickingUtils.validateMesh(mesh)
      )
      this._facePicker.setMeshes(validMeshes)
      
      this._setupFacePickingEvents()
      
      console.log('面拾取系统已初始化')
      return this._facePicker
    } catch (error) {
      console.error('面拾取初始化失败:', error)
      return null
    }
  }
  
  _setupFacePickingEvents() {
    if (!this._facePicker) return
    
    this._facePicker.on('faceSelected', (faceInfo, originalEvent) => {
      this.events.emit('faceSelected', { faceInfo, originalEvent })
      
      // 如果文字模式启用，转发给文字系统
      if (this._textModeEnabled && this._surfaceTextManager) {
        this._surfaceTextManager.handleFaceSelected(faceInfo, originalEvent)
      }
    })
    
    this._facePicker.on('faceDeselected', (faceInfo) => {
      this.events.emit('faceDeselected', { faceInfo })
    })
    
    this._facePicker.on('selectionCleared', () => {
      this.events.emit('faceSelectionCleared')
    })
    
    this._facePicker.on('faceHover', (faceInfo) => {
      this.events.emit('faceHover', { faceInfo })
    })
    
    this._facePicker.on('faceHoverEnd', () => {
      this.events.emit('faceHoverEnd')
    })
  }
  
  /**
   * 启用面拾取
   */
  enableFacePicking() {
    if (!this._facePicker) {
      this.initFacePicking()
    }
    if (this._facePicker) {
      this._facePicker.enable()
      this._facePickingEnabled = true
      this.events.emit('facePickingEnabled')
    }
  }
  
  /**
   * 禁用面拾取
   */
  disableFacePicking() {
    if (this._facePicker) {
      this._facePicker.disable()
      this._facePickingEnabled = false
      this.events.emit('facePickingDisabled')
    }
  }
  
  /**
   * 获取面拾取器
   */
  getFacePicker() {
    return this._facePicker
  }
  
  // ==================== 文字系统 ====================
  
  /**
   * 初始化文字系统
   */
  initTextSystem() {
    if (this._surfaceTextManager) return this._surfaceTextManager
    
    try {
      this._surfaceTextManager = new SurfaceTextManager(
        this.scene,
        this.camera,
        this.renderer,
        this.container,
        null // 不依赖 facePicker
      )
      
      this._surfaceTextManager.setTargetMeshes(this._meshes)
      this._surfaceTextManager.enableClickListener()
      
      this._setupTextSystemEvents()
      
      console.log('文字系统已初始化')
      return this._surfaceTextManager
    } catch (error) {
      console.error('文字系统初始化失败:', error)
      return null
    }
  }
  
  _setupTextSystemEvents() {
    if (!this._surfaceTextManager) return
    
    this._surfaceTextManager.on('textCreated', (textObject) => {
      this._textObjects.push(textObject)
      this.events.emit('textCreated', { textObject })
    })
    
    this._surfaceTextManager.on('textSelected', (textObject) => {
      this._selectedTextId = textObject.id
      this.events.emit('textSelected', { textObject })
    })
    
    this._surfaceTextManager.on('textDeselected', (textObject) => {
      this._selectedTextId = null
      this.events.emit('textDeselected', { textObject })
    })
    
    this._surfaceTextManager.on('textDeleted', ({ id, textObject }) => {
      const index = this._textObjects.findIndex(obj => obj.id === id)
      if (index !== -1) {
        this._textObjects.splice(index, 1)
      }
      if (this._selectedTextId === id) {
        this._selectedTextId = null
      }
      this.events.emit('textDeleted', { id, textObject })
    })
    
    this._surfaceTextManager.on('textModeEnabled', () => {
      this._textModeEnabled = true
      this.events.emit('textModeEnabled')
    })
    
    this._surfaceTextManager.on('textModeDisabled', () => {
      this._textModeEnabled = false
      this.events.emit('textModeDisabled')
    })
    
    // 拖动时禁用相机控制
    if (this._surfaceTextManager.transformControls) {
      this._surfaceTextManager.transformControls.addEventListener('dragging-changed', (event) => {
        this.setControlsEnabled(!event.value)
      })
    }
  }
  
  /**
   * 启用文字添加模式
   */
  enableTextMode() {
    if (!this._surfaceTextManager) {
      this.initTextSystem()
    }
    if (this._surfaceTextManager) {
      this._surfaceTextManager.enableTextMode()
    }
  }
  
  /**
   * 禁用文字添加模式
   */
  disableTextMode() {
    if (this._surfaceTextManager) {
      this._surfaceTextManager.disableTextMode()
    }
  }
  
  /**
   * 创建文字
   */
  async createText(content, faceInfo) {
    if (!this._surfaceTextManager) {
      this.initTextSystem()
    }
    return this._surfaceTextManager?.createTextObject(content, faceInfo)
  }
  
  /**
   * 更新文字内容
   */
  async updateTextContent(textId, content) {
    return this._surfaceTextManager?.updateTextContent(textId, content)
  }
  
  /**
   * 更新文字颜色
   */
  updateTextColor(textId, color) {
    const colorHex = typeof color === 'string' 
      ? parseInt(color.replace('#', ''), 16) 
      : color
    this._surfaceTextManager?.updateTextColor(textId, colorHex)
  }
  
  /**
   * 更新文字配置
   */
  async updateTextConfig(textId, config) {
    return this._surfaceTextManager?.updateTextConfig(textId, config)
  }
  
  /**
   * 切换文字模式（凸起/内嵌）
   */
  async switchTextMode(textId, mode) {
    return this._surfaceTextManager?.switchTextMode(textId, mode)
  }
  
  /**
   * 删除文字
   */
  deleteText(textId) {
    this._surfaceTextManager?.deleteText(textId)
  }
  
  /**
   * 选择文字
   */
  selectText(textId) {
    this._surfaceTextManager?.selectText(textId)
  }
  
  /**
   * 获取文字对象列表
   */
  getTextObjects() {
    return [...this._textObjects]
  }
  
  /**
   * 获取选中的文字对象
   */
  getSelectedTextObject() {
    return this._surfaceTextManager?.getSelectedTextObject()
  }
  
  /**
   * 获取文字管理器
   */
  getTextManager() {
    return this._surfaceTextManager
  }
  
  // ==================== 物体选择系统 ====================
  
  /**
   * 初始化物体选择
   */
  initObjectSelection() {
    if (this._objectSelectionManager) return this._objectSelectionManager
    
    try {
      this._objectSelectionManager = new ObjectSelectionManager(
        this.scene,
        this.camera,
        this.renderer,
        this.renderer.domElement
      )
      
      const selectableObjects = this._meshes.filter(mesh => !mesh.userData.isHelper)
      this._objectSelectionManager.setSelectableObjects(selectableObjects)
      
      this._setupObjectSelectionEvents()
      
      console.log('物体选择系统已初始化')
      return this._objectSelectionManager
    } catch (error) {
      console.error('物体选择系统初始化失败:', error)
      return null
    }
  }
  
  _setupObjectSelectionEvents() {
    if (!this._objectSelectionManager) return
    
    this._objectSelectionManager.on('objectSelected', (object) => {
      this.events.emit('objectSelected', { object })
    })
    
    this._objectSelectionManager.on('objectDeselected', (object) => {
      this.events.emit('objectDeselected', { object })
    })
    
    this._objectSelectionManager.on('selectionCleared', () => {
      this.events.emit('objectSelectionCleared')
    })
    
    this._objectSelectionManager.on('draggingChanged', (isDragging) => {
      this.setControlsEnabled(!isDragging)
      this.events.emit('objectDragging', { isDragging })
    })
    
    this._objectSelectionManager.on('objectTransformed', (data) => {
      this.events.emit('objectTransformed', data)
    })
    
    this._objectSelectionManager.on('transformModeChanged', (mode) => {
      this.events.emit('transformModeChanged', { mode })
    })
  }
  
  /**
   * 启用物体选择
   */
  enableObjectSelection() {
    if (!this._objectSelectionManager) {
      this.initObjectSelection()
    }
    if (this._objectSelectionManager) {
      this._objectSelectionManager.enable()
      this._objectSelectionEnabled = true
      this.events.emit('objectSelectionEnabled')
    }
  }
  
  /**
   * 禁用物体选择
   */
  disableObjectSelection() {
    if (this._objectSelectionManager) {
      this._objectSelectionManager.disable()
      this._objectSelectionEnabled = false
      this.events.emit('objectSelectionDisabled')
    }
  }
  
  /**
   * 设置变换模式
   */
  setTransformMode(mode) {
    this._objectSelectionManager?.setTransformMode(mode)
  }
  
  /**
   * 获取物体选择管理器
   */
  getObjectSelectionManager() {
    return this._objectSelectionManager
  }
  
  // ==================== 重写父类方法 ====================
  
  /**
   * 添加网格时同步到子系统
   */
  addMesh(mesh, options = {}) {
    const result = super.addMesh(mesh, options)
    
    // 同步到面拾取
    if (this._facePicker && FacePickingUtils.validateMesh(mesh)) {
      this._facePicker.addMesh(mesh)
    }
    
    // 同步到文字系统
    if (this._surfaceTextManager) {
      this._surfaceTextManager.setTargetMeshes(this._meshes)
    }
    
    // 同步到物体选择
    if (this._objectSelectionManager && !mesh.userData.isHelper) {
      this._objectSelectionManager.addSelectableObject(mesh)
    }
    
    return result
  }
  
  /**
   * 移除网格时同步到子系统
   */
  removeMesh(mesh) {
    if (this._facePicker) {
      this._facePicker.removeMesh(mesh)
    }
    
    if (this._objectSelectionManager) {
      this._objectSelectionManager.removeSelectableObject(mesh)
    }
    
    super.removeMesh(mesh)
  }
  
  /**
   * 销毁时清理子系统
   */
  dispose() {
    if (this._facePicker) {
      this._facePicker.destroy()
      this._facePicker = null
    }
    
    if (this._surfaceTextManager) {
      this._surfaceTextManager.destroy?.()
      this._surfaceTextManager = null
    }
    
    if (this._objectSelectionManager) {
      this._objectSelectionManager.destroy()
      this._objectSelectionManager = null
    }
    
    this._textObjects = []
    
    super.dispose()
  }
}

export default EditorViewer
