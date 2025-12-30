/**
 * 编辑器应用（业务层）
 * 使用组合模式整合库的能力，不继承 Viewer
 */
import * as THREE from 'three'
import { Viewer } from '../lib/viewer/Viewer.js'
import { LoaderManager } from '../lib/loaders/LoaderManager.js'
import { ExportManager } from '../lib/loaders/ExportManager.js'
import { FacePicker, FacePickingUtils } from '../lib/facePicking/index.js'
import { SurfaceTextManager } from '../lib/surfaceText/index.js'
import { ObjectSelectionManager } from '../lib/objectSelection/index.js'
import { FeatureDetector } from '../lib/facePicking/FeatureDetector.js'
import { ProjectManager } from './ProjectManager.js'

export class EditorApp {
  constructor(container, options = {}) {
    this.container = container
    this.options = options
    
    // ========== 库层（来自 lib） ==========
    this.viewer = new Viewer(container, options)
    this.loader = new LoaderManager()
    this.exporter = new ExportManager()
    
    // ========== 业务层 ==========
    this.projectManager = new ProjectManager()
    this.featureDetector = new FeatureDetector()
    
    // 交互子系统（延迟初始化）
    this._facePicker = null
    this._textManager = null
    this._objectSelection = null
    
    // 业务状态
    this._textObjects = []
    this._selectedTextId = null
    this._textModeEnabled = false
    
    // 初始化
    this._setupEvents()
    this._setupProjectEvents()
  }
  
  // ==================== 事件连接 ====================
  
  _setupEvents() {
    // 转发 Viewer 事件
    this.viewer.events.on('click', (e) => this._onViewerClick(e))
    this.viewer.events.on('contextmenu', (e) => this._onViewerContextMenu(e))
    this.viewer.events.on('meshAdded', (e) => this._onMeshAdded(e))
    this.viewer.events.on('meshRemoved', (e) => this._onMeshRemoved(e))
  }
  
  _setupProjectEvents() {
    this.projectManager.onChange = (event) => {
      this.viewer.events.emit('projectChanged', event)
    }
    this.projectManager.onSave = (event) => {
      this.viewer.events.emit('projectSaved', event)
    }
    this.projectManager.onLoad = (event) => {
      this.viewer.events.emit('projectLoaded', event)
    }
  }
  
  _onViewerClick(e) {
    // 如果面拾取启用，转发给面拾取器
    if (this._facePicker?.enabled) {
      this._facePicker.handleClick(e.event)
    }
  }
  
  _onViewerContextMenu(e) {
    // 业务层处理右键菜单
    this.viewer.events.emit('editorContextMenu', e)
  }
  
  _onMeshAdded({ mesh }) {
    // 同步到面拾取器
    if (this._facePicker && FacePickingUtils.validateMesh(mesh)) {
      this._facePicker.addMesh(mesh)
    }
    // 同步到文字系统
    if (this._textManager) {
      this._textManager.setTargetMeshes(this.viewer.getMeshes())
    }
    // 同步到物体选择
    if (this._objectSelection && !mesh.userData.isHelper) {
      this._objectSelection.addSelectableObject(mesh)
    }
  }
  
  _onMeshRemoved({ mesh }) {
    if (this._facePicker) {
      this._facePicker.removeMesh(mesh)
    }
    if (this._objectSelection) {
      this._objectSelection.removeSelectableObject(mesh)
    }
  }
  
  // ==================== 模型加载 ====================
  
  /**
   * 加载模型
   */
  async loadModel(source, options = {}) {
    const {
      addToScene = true,
      detectFeatures = true,
      ...loaderOptions
    } = options
    
    // 使用 LoaderManager 加载
    const result = await this.loader.load(source, loaderOptions)
    
    // 添加到场景
    if (addToScene) {
      this.viewer.addMesh(result.model, {
        selectable: true,
        castShadow: true,
        receiveShadow: true
      })
    }
    
    // 特征检测（业务逻辑）
    if (detectFeatures) {
      await this.featureDetector.preprocessMesh(result.model)
    }
    
    this.viewer.events.emit('modelLoaded', {
      model: result.model,
      modelId: result.modelId,
      format: result.format,
      metadata: result.metadata
    })
    
    return result
  }
  
  // ==================== 模型导出 ====================
  
  /**
   * 导出模型
   */
  async exportModel(objects, format, options = {}) {
    return this.exporter.export(objects, format, options)
  }
  
  /**
   * 导出并下载
   */
  async exportAndDownload(objects, format, filename = 'model', options = {}) {
    await this.exporter.exportAndDownload(objects, format, filename, options)
    this.viewer.events.emit('modelExported', { format, filename })
  }
  
  /**
   * 导出场景
   */
  async exportScene(format, filename = 'scene', options = {}) {
    const meshes = this.viewer.getMeshes().filter(m => !m.userData.isHelper)
    if (meshes.length === 0) {
      throw new Error('场景中没有可导出的网格')
    }
    await this.exporter.exportAndDownload(meshes, format, filename, options)
    this.viewer.events.emit('sceneExported', { format, filename })
  }
  
  // ==================== 面拾取系统 ====================
  
  /**
   * 初始化面拾取
   */
  initFacePicking() {
    if (this._facePicker) return this._facePicker
    
    this._facePicker = new FacePicker(
      this.viewer.scene,
      this.viewer.camera,
      this.viewer.renderer,
      this.viewer.container
    )
    
    const validMeshes = this.viewer.getMeshes().filter(m => FacePickingUtils.validateMesh(m))
    this._facePicker.setMeshes(validMeshes)
    
    // 设置事件
    this._facePicker.on('faceSelected', (faceInfo, event) => {
      this.viewer.events.emit('faceSelected', { faceInfo, event })
      
      if (this._textModeEnabled && this._textManager) {
        this._textManager.handleFaceSelected(faceInfo, event)
      }
    })
    
    this._facePicker.on('faceDeselected', (faceInfo) => {
      this.viewer.events.emit('faceDeselected', { faceInfo })
    })
    
    this._facePicker.on('selectionCleared', () => {
      this.viewer.events.emit('faceSelectionCleared')
    })
    
    return this._facePicker
  }
  
  enableFacePicking() {
    if (!this._facePicker) this.initFacePicking()
    this._facePicker?.enable()
    this.viewer.events.emit('facePickingEnabled')
  }
  
  disableFacePicking() {
    this._facePicker?.disable()
    this.viewer.events.emit('facePickingDisabled')
  }
  
  getFacePicker() {
    return this._facePicker
  }
  
  // ==================== 文字系统 ====================
  
  /**
   * 初始化文字系统
   */
  initTextSystem() {
    if (this._textManager) return this._textManager
    
    this._textManager = new SurfaceTextManager(
      this.viewer.scene,
      this.viewer.camera,
      this.viewer.renderer,
      this.viewer.container,
      null
    )
    
    this._textManager.setTargetMeshes(this.viewer.getMeshes())
    this._textManager.enableClickListener()
    
    // 设置事件
    this._textManager.on('textCreated', (textObject) => {
      this._textObjects.push(textObject)
      this.viewer.events.emit('textCreated', { textObject })
    })
    
    this._textManager.on('textSelected', (textObject) => {
      this._selectedTextId = textObject.id
      this.viewer.events.emit('textSelected', { textObject })
    })
    
    this._textManager.on('textDeselected', (textObject) => {
      this._selectedTextId = null
      this.viewer.events.emit('textDeselected', { textObject })
    })
    
    this._textManager.on('textDeleted', ({ id, textObject }) => {
      const index = this._textObjects.findIndex(obj => obj.id === id)
      if (index !== -1) this._textObjects.splice(index, 1)
      if (this._selectedTextId === id) this._selectedTextId = null
      this.viewer.events.emit('textDeleted', { id, textObject })
    })
    
    // 拖动时禁用相机控制
    if (this._textManager.transformControls) {
      this._textManager.transformControls.on('dragging-changed', (isDragging) => {
        this.viewer.setControlsEnabled(!isDragging)
      })
    }
    
    return this._textManager
  }
  
  enableTextMode() {
    if (!this._textManager) this.initTextSystem()
    this._textManager?.enableTextMode()
    this._textModeEnabled = true
    this.viewer.events.emit('textModeEnabled')
  }
  
  disableTextMode() {
    this._textManager?.disableTextMode()
    this._textModeEnabled = false
    this.viewer.events.emit('textModeDisabled')
  }
  
  async createText(content, faceInfo) {
    if (!this._textManager) this.initTextSystem()
    return this._textManager?.createTextObject(content, faceInfo)
  }
  
  async updateTextContent(textId, content) {
    return this._textManager?.updateTextContent(textId, content)
  }
  
  updateTextColor(textId, color) {
    const colorHex = typeof color === 'string' 
      ? parseInt(color.replace('#', ''), 16) 
      : color
    this._textManager?.updateTextColor(textId, colorHex)
  }
  
  async updateTextConfig(textId, config) {
    return this._textManager?.updateTextConfig(textId, config)
  }
  
  async switchTextMode(textId, mode) {
    return this._textManager?.switchTextMode(textId, mode)
  }
  
  async deleteText(textId) {
    return await this._textManager?.deleteText(textId)
  }
  
  selectText(textId) {
    this._textManager?.selectText(textId)
  }
  
  getTextObjects() {
    return [...this._textObjects]
  }
  
  getSelectedTextObject() {
    return this._textManager?.getSelectedTextObject()
  }
  
  getTextManager() {
    return this._textManager
  }
  
  // ==================== 物体选择系统 ====================
  
  initObjectSelection() {
    if (this._objectSelection) return this._objectSelection
    
    this._objectSelection = new ObjectSelectionManager(
      this.viewer.scene,
      this.viewer.camera,
      this.viewer.renderer,
      this.viewer.renderer.domElement
    )
    
    const selectableObjects = this.viewer.getMeshes().filter(m => !m.userData.isHelper)
    this._objectSelection.setSelectableObjects(selectableObjects)
    
    this._objectSelection.on('objectSelected', (object) => {
      this.viewer.events.emit('objectSelected', { object })
    })
    
    this._objectSelection.on('objectDeselected', (object) => {
      this.viewer.events.emit('objectDeselected', { object })
    })
    
    this._objectSelection.on('draggingChanged', (isDragging) => {
      this.viewer.setControlsEnabled(!isDragging)
    })
    
    return this._objectSelection
  }
  
  enableObjectSelection() {
    if (!this._objectSelection) this.initObjectSelection()
    this._objectSelection?.enable()
    this.viewer.events.emit('objectSelectionEnabled')
  }
  
  disableObjectSelection() {
    this._objectSelection?.disable()
    this.viewer.events.emit('objectSelectionDisabled')
  }
  
  setTransformMode(mode) {
    this._objectSelection?.setTransformMode(mode)
  }
  
  getObjectSelectionManager() {
    return this._objectSelection
  }
  
  // ==================== 项目管理 ====================
  
  createProject(options = {}) {
    this._clearScene()
    const project = this.projectManager.createProject(options)
    this.viewer.events.emit('projectCreated', project)
    return project
  }
  
  saveProject(key) {
    this._syncStateToProject()
    const storageKey = key || `editor_project_${this.projectManager.projectInfo.id}`
    return this.projectManager.saveToLocal(storageKey)
  }
  
  async loadProject(key = 'editor_project') {
    const data = this.projectManager.loadFromLocal(key)
    if (!data) return null
    await this._restoreProjectState(data)
    return data
  }
  
  exportProjectFile(filename) {
    this._syncStateToProject()
    this.projectManager.exportProjectFile(filename || this.projectManager.getProjectName())
  }
  
  async importProjectFile(file) {
    const data = await this.projectManager.importProjectFile(file)
    await this._restoreProjectState(data)
    return data
  }
  
  getLocalProjectList() {
    return this.projectManager.getLocalProjectList()
  }
  
  deleteLocalProject(key) {
    this.projectManager.deleteLocalProject(key)
  }
  
  getProjectName() {
    return this.projectManager.getProjectName()
  }
  
  setProjectName(name) {
    this.projectManager.setProjectName(name)
  }
  
  isProjectDirty() {
    return this.projectManager.isDirty()
  }
  
  getProjectManager() {
    return this.projectManager
  }
  
  _syncStateToProject() {
    const meshes = this.viewer.getMeshes().filter(m => !m.userData.isHelper)
    if (meshes.length > 0) {
      const mainMesh = meshes[0]
      const box = new THREE.Box3().setFromObject(mainMesh)
      const size = box.getSize(new THREE.Vector3())
      
      this.projectManager.updateFinalModelConfig({
        scale: mainMesh.scale.toArray(),
        boundingBox: size.toArray()
      })
    }
    
    this.projectManager.config.texts = []
    this._textObjects.forEach(textObj => {
      this.projectManager.addTextConfig({
        id: textObj.id,
        displayName: textObj.displayName,
        content: textObj.content,
        font: textObj.config?.font,
        size: textObj.config?.size,
        thickness: textObj.config?.thickness,
        mode: textObj.mode,
        color: textObj.material?.color ? '#' + textObj.material.color.getHexString() : '#333333',
        position: textObj.mesh?.position?.toArray() || [0, 0, 0],
        rotation: textObj.mesh?.rotation?.toArray() || [0, 0, 0],
        featureName: textObj.featureName
      })
    })
    
    this.projectManager.updatePropIdentifier()
  }
  
  async _restoreProjectState(projectData) {
    const config = projectData.config
    this._clearScene()
    
    if (config.originModelPath) {
      try {
        await this.loadModel(config.originModelPath)
      } catch (error) {
        console.warn('[EditorApp] 加载原始模型失败:', error)
      }
    }
    
    if (config.baseModelPath) {
      try {
        await this.loadModel(config.baseModelPath, { name: 'base' })
      } catch (error) {
        console.warn('[EditorApp] 加载底座模型失败:', error)
      }
    }
  }
  
  _clearScene() {
    this._textObjects.forEach(textObj => {
      this._textManager?.deleteText(textObj.id)
    })
    this._textObjects = []
    
    const meshesToRemove = this.viewer.getMeshes().filter(m => !m.userData.isHelper)
    meshesToRemove.forEach(mesh => this.viewer.removeMesh(mesh))
    
    this.featureDetector?.clearCache()
  }
  
  // ==================== 特征检测 ====================
  
  async detectFeatures(mesh) {
    return this.featureDetector.preprocessMesh(mesh)
  }
  
  getFeatureByFace(mesh, faceIndex) {
    const meshId = this.featureDetector.generateMeshId(mesh)
    return this.featureDetector.getFeatureByFaceIndex(meshId, faceIndex)
  }
  
  getMeshFeatures(mesh) {
    const meshId = this.featureDetector.generateMeshId(mesh)
    return this.featureDetector.getFeatures(meshId)
  }
  
  getFeatureDetector() {
    return this.featureDetector
  }
  
  // ==================== 便捷方法（代理到 Viewer） ====================
  
  // 场景操作
  get scene() { return this.viewer.scene }
  get camera() { return this.viewer.camera }
  get renderer() { return this.viewer.renderer }
  get controls() { return this.viewer.controls }
  get events() { return this.viewer.events }
  
  addMesh(mesh, options) { return this.viewer.addMesh(mesh, options) }
  removeMesh(mesh) { return this.viewer.removeMesh(mesh) }
  getMeshes() { return this.viewer.getMeshes() }
  getMeshByName(name) { return this.viewer.getMeshByName(name) }
  
  // 几何体创建
  createCylinder(options) { return this.viewer.createCylinder(options) }
  createBox(options) { return this.viewer.createBox(options) }
  createSphere(options) { return this.viewer.createSphere(options) }
  
  // 选择
  select(object) { return this.viewer.select(object) }
  clearSelection() { return this.viewer.clearSelection() }
  getSelectedObject() { return this.viewer.getSelectedObject() }
  
  // 相机
  resetView() { return this.viewer.resetView() }
  focusOn(object) { return this.viewer.focusOn(object) }
  setControlsEnabled(enabled) { return this.viewer.setControlsEnabled(enabled) }
  
  // 材质
  setObjectColor(object, color) { return this.viewer.setObjectColor(object, color) }
  setObjectVisible(object, visible) { return this.viewer.setObjectVisible(object, visible) }
  
  // 工具
  getCanvas() { return this.viewer.getCanvas() }
  getSize() { return this.viewer.getSize() }
  screenshot(options) { return this.viewer.screenshot(options) }
  
  // ==================== 销毁 ====================
  
  dispose() {
    // 清理业务层
    this._facePicker?.destroy()
    this._textManager?.destroy?.()
    this._objectSelection?.destroy()
    this.projectManager?.dispose()
    this.featureDetector?.clearCache()
    
    // 清理库层
    this.loader?.dispose()
    this.exporter?.dispose()
    this.viewer?.dispose()
    
    this._textObjects = []
    this._facePicker = null
    this._textManager = null
    this._objectSelection = null
  }
}

export default EditorApp
