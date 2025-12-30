/**
 * 3D 场景查看器
 * 封装 Three.js 场景管理和所有 3D 交互逻辑
 */
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { EventManager } from './EventManager.js'
import { OptimizedFacePicker } from './facePicking/OptimizedFacePicker.js'
import { FeatureDetector } from './facePicking/FeatureDetector.js'
import { FeatureBasedNaming } from './facePicking/FeatureBasedNaming.js'

export class Viewer {
  constructor(container, options = {}) {
    this.container = container
    this.options = {
      backgroundColor: 0xf2f3f5,
      enableShadow: true,
      enableGrid: true,
      ...options
    }
    
    // 核心对象
    this.scene = null
    this.camera = null
    this.renderer = null
    this.controls = null
    
    // 事件管理器
    this.events = new EventManager()
    
    // 状态
    this._animationId = null
    this._isDisposed = false
    
    // 对象管理
    this._meshes = []           // 所有网格对象
    this._selectableObjects = [] // 可选择的对象
    this._selectedObject = null
    this._hoveredObject = null
    
    // 交互
    this._raycaster = new THREE.Raycaster()
    this._mouse = new THREE.Vector2()
    
    // 子系统（延迟初始化）
    this._facePicker = null
    this._surfaceTextManager = null
    this._objectSelectionManager = null
    
    // 特征检测系统
    this._featureDetector = new FeatureDetector()
    this._featureNaming = new FeatureBasedNaming()
    this._featureOnlyMode = false  // 只允许选中特征面的开关
    this._detectedFeatures = new Map() // meshId -> features
    
    // 初始化
    this._init()
    this._bindEvents()
    this._animate()
  }
  
  // ==================== 初始化 ====================
  
  _init() {
    const rect = this.container.getBoundingClientRect()
    
    // 渲染器
    this.renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      preserveDrawingBuffer: true
    })
    this.renderer.setSize(rect.width, rect.height)
    this.renderer.setPixelRatio(window.devicePixelRatio)
    this.renderer.shadowMap.enabled = this.options.enableShadow
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.container.appendChild(this.renderer.domElement)
    
    // 场景
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(this.options.backgroundColor)
    
    // 相机
    this.camera = new THREE.PerspectiveCamera(60, rect.width / rect.height, 0.1, 1000)
    this.camera.position.set(30, 30, 60)
    
    // 控制器
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = false
    
    // 默认场景设置
    this._setupLighting()
    if (this.options.enableGrid) {
      this._setupGrid()
    }
    
    // 初始化面拾取器
    this._initFacePicker()
  }
  
  /**
   * 初始化面拾取器
   */
  _initFacePicker() {
    this._facePicker = new OptimizedFacePicker(
      this.scene,
      this.camera,
      this.renderer,
      this.renderer.domElement
    )
    
    // 监听面拾取事件
    this._facePicker.on('faceSelected', (faceInfo, event) => {
      this.events.emit('faceSelected', { faceInfo, event })
    })
    
    this._facePicker.on('faceDeselected', (faceInfo, event) => {
      this.events.emit('faceDeselected', { faceInfo, event })
    })
    
    this._facePicker.on('featureSelected', (data) => {
      this.events.emit('featureSelected', data)
    })
    
    this._facePicker.on('selectionChanged', (summary) => {
      this.events.emit('faceSelectionChanged', summary)
    })
  }
  
  _setupLighting() {
    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1)
    this.scene.add(hemi)
    
    const ambient = new THREE.AmbientLight(0xffffff, 0.35)
    this.scene.add(ambient)
    
    const dir = new THREE.DirectionalLight(0xffffff, 0.6)
    dir.position.set(5, 10, 7.5)
    dir.castShadow = true
    dir.shadow.mapSize.width = 2048
    dir.shadow.mapSize.height = 2048
    this.scene.add(dir)
  }
  
  _setupGrid() {
    const grid = new THREE.GridHelper(20, 20, 0xcccccc, 0xeeeeee)
    grid.userData.isHelper = true
    this.scene.add(grid)
  }
  
  // ==================== 事件绑定 ====================
  
  _bindEvents() {
    const canvas = this.renderer.domElement
    
    this._onClick = this._onClick.bind(this)
    this._onDblClick = this._onDblClick.bind(this)
    this._onContextMenu = this._onContextMenu.bind(this)
    this._onMouseMove = this._onMouseMove.bind(this)
    this._onMouseDown = this._onMouseDown.bind(this)
    this._onMouseUp = this._onMouseUp.bind(this)
    this._onResize = this._onResize.bind(this)
    this._onKeyDown = this._onKeyDown.bind(this)
    
    canvas.addEventListener('click', this._onClick)
    canvas.addEventListener('dblclick', this._onDblClick)
    canvas.addEventListener('contextmenu', this._onContextMenu)
    canvas.addEventListener('mousemove', this._onMouseMove)
    canvas.addEventListener('mousedown', this._onMouseDown)
    canvas.addEventListener('mouseup', this._onMouseUp)
    
    window.addEventListener('resize', this._onResize)
    window.addEventListener('keydown', this._onKeyDown)
  }
  
  _unbindEvents() {
    const canvas = this.renderer.domElement
    
    canvas.removeEventListener('click', this._onClick)
    canvas.removeEventListener('dblclick', this._onDblClick)
    canvas.removeEventListener('contextmenu', this._onContextMenu)
    canvas.removeEventListener('mousemove', this._onMouseMove)
    canvas.removeEventListener('mousedown', this._onMouseDown)
    canvas.removeEventListener('mouseup', this._onMouseUp)
    
    window.removeEventListener('resize', this._onResize)
    window.removeEventListener('keydown', this._onKeyDown)
  }
  
  // ==================== 事件处理 ====================
  
  _updateMouse(event) {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this._mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this._mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  }
  
  _raycast(objects = null) {
    this._raycaster.setFromCamera(this._mouse, this.camera)
    const targets = objects || this._selectableObjects.filter(obj => obj.visible)
    return this._raycaster.intersectObjects(targets, true)
  }
  
  _getTargetType(object) {
    if (!object) return 'empty'
    if (object.userData.isText) return 'text'
    if (object.userData.isSurface || object.userData.isMesh) return 'surface'
    return 'object'
  }
  
  _findSelectableParent(object) {
    let current = object
    while (current) {
      if (this._selectableObjects.includes(current)) {
        return current
      }
      current = current.parent
    }
    return object
  }
  
  _onClick(event) {
    this._updateMouse(event)
    const intersects = this._raycast()
    
    if (intersects.length > 0) {
      const hit = intersects[0]
      const target = this._findSelectableParent(hit.object)
      
      // 特征面过滤模式检查
      if (this._featureOnlyMode && hit.faceIndex !== undefined) {
        const feature = this.getFeatureByFace(hit.object, hit.faceIndex)
        if (!feature) {
          // 未识别的面，不触发点击事件
          console.log('[Viewer] 特征面过滤: 点击的面未被识别为特征')
          this.events.emit('click', { 
            target: null, 
            targetType: 'empty', 
            event,
            filtered: true,
            reason: 'not_a_feature'
          })
          return
        }
      }
      
      this.events.emit('click', {
        target,
        targetType: this._getTargetType(target),
        point: hit.point,
        faceIndex: hit.faceIndex,
        face: hit.face,
        uv: hit.uv,
        event
      })
    } else {
      this.events.emit('click', { target: null, targetType: 'empty', event })
    }
  }
  
  _onDblClick(event) {
    this._updateMouse(event)
    const intersects = this._raycast()
    
    if (intersects.length > 0) {
      const hit = intersects[0]
      const target = this._findSelectableParent(hit.object)
      
      this.events.emit('dblclick', {
        target,
        targetType: this._getTargetType(target),
        point: hit.point,
        faceIndex: hit.faceIndex,
        face: hit.face,
        event
      })
    }
  }
  
  _onContextMenu(event) {
    event.preventDefault()
    this._updateMouse(event)
    const intersects = this._raycast()
    
    let target = null
    let targetType = 'empty'
    let point = null
    let faceIndex = null
    
    if (intersects.length > 0) {
      const hit = intersects[0]
      target = this._findSelectableParent(hit.object)
      targetType = this._getTargetType(target)
      point = hit.point
      faceIndex = hit.faceIndex
    }
    
    this.events.emit('contextmenu', {
      x: event.clientX,
      y: event.clientY,
      target,
      targetType,
      point,
      faceIndex,
      event
    })
  }
  
  _onMouseMove(event) {
    this._updateMouse(event)
    const intersects = this._raycast()
    
    const newHovered = intersects.length > 0 
      ? this._findSelectableParent(intersects[0].object) 
      : null
    
    if (newHovered !== this._hoveredObject) {
      if (this._hoveredObject) {
        this.events.emit('hoverEnd', { target: this._hoveredObject })
      }
      
      this._hoveredObject = newHovered
      
      if (newHovered) {
        this.events.emit('hover', {
          target: newHovered,
          targetType: this._getTargetType(newHovered),
          point: intersects[0]?.point,
          event
        })
      }
    }
    
    this.events.emit('mousemove', { event, intersects })
  }
  
  _onMouseDown(event) {
    this.events.emit('mousedown', { event })
  }
  
  _onMouseUp(event) {
    this.events.emit('mouseup', { event })
  }
  
  _onResize() {
    const rect = this.container.getBoundingClientRect()
    this.camera.aspect = rect.width / rect.height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(rect.width, rect.height)
    
    this.events.emit('resize', { width: rect.width, height: rect.height })
  }
  
  _onKeyDown(event) {
    this.events.emit('keydown', { key: event.key, event })
    
    if (event.key === 'Escape') {
      this.clearSelection()
      this.events.emit('escape')
    }
    
    if (event.key === 'Delete' && this._selectedObject) {
      this.events.emit('deleteRequest', { target: this._selectedObject })
    }
  }
  
  // ==================== 渲染循环 ====================
  
  _animate() {
    if (this._isDisposed) return
    
    this._animationId = requestAnimationFrame(() => this._animate())
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }
  
  // ==================== 对象管理 ====================
  
  /**
   * 添加网格到场景
   */
  addMesh(mesh, options = {}) {
    const { selectable = true, castShadow = true, receiveShadow = true } = options
    
    mesh.castShadow = castShadow
    mesh.receiveShadow = receiveShadow
    
    this.scene.add(mesh)
    this._meshes.push(mesh)
    
    if (selectable && !mesh.userData.isHelper) {
      this._selectableObjects.push(mesh)
    }
    
    this.events.emit('meshAdded', { mesh })
    return mesh
  }
  
  /**
   * 移除网格
   */
  removeMesh(mesh) {
    this.scene.remove(mesh)
    
    const meshIndex = this._meshes.indexOf(mesh)
    if (meshIndex > -1) this._meshes.splice(meshIndex, 1)
    
    const selectableIndex = this._selectableObjects.indexOf(mesh)
    if (selectableIndex > -1) this._selectableObjects.splice(selectableIndex, 1)
    
    if (this._selectedObject === mesh) {
      this._selectedObject = null
    }
    
    // 清理资源
    if (mesh.geometry) mesh.geometry.dispose()
    if (mesh.material) {
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(m => m.dispose())
      } else {
        mesh.material.dispose()
      }
    }
    
    this.events.emit('meshRemoved', { mesh })
  }
  
  /**
   * 获取所有网格
   */
  getMeshes() {
    return [...this._meshes]
  }
  
  /**
   * 根据名称查找网格
   */
  getMeshByName(name) {
    return this._meshes.find(m => m.name === name)
  }
  
  // ==================== 模型加载 ====================
  
  /**
   * 加载 STL 模型
   */
  loadSTL(url, options = {}) {
    return new Promise((resolve, reject) => {
      const loader = new STLLoader()
      
      const {
        color = 0x999999,
        roughness = 0.8,
        metalness = 0.1,
        scale = null,
        targetSize = 4,
        position = [0, 0, 0],
        name = 'STLModel'
      } = options
      
      loader.load(
        url,
        (geometry) => {
          geometry.center()
          
          const material = new THREE.MeshStandardMaterial({ color, roughness, metalness })
          const mesh = new THREE.Mesh(geometry, material)
          
          // 自动缩放
          if (scale) {
            mesh.scale.setScalar(scale)
          } else {
            const box = new THREE.Box3().setFromBufferAttribute(geometry.attributes.position)
            const size = new THREE.Vector3()
            box.getSize(size)
            const maxDim = Math.max(size.x, size.y, size.z) || 1
            mesh.scale.setScalar(targetSize / maxDim)
          }
          
          mesh.position.set(...position)
          mesh.name = name
          
          this.addMesh(mesh)
          this.events.emit('modelLoaded', { mesh, type: 'stl' })
          resolve(mesh)
        },
        (progress) => {
          const percent = progress.total ? (progress.loaded / progress.total * 100) : 0
          this.events.emit('loadProgress', { percent, type: 'stl' })
        },
        (error) => {
          this.events.emit('loadError', { error, type: 'stl' })
          reject(error)
        }
      )
    })
  }
  
  // ==================== 几何体创建 ====================
  
  /**
   * 创建圆柱体
   */
  createCylinder(options = {}) {
    const {
      radiusTop = 5,
      radiusBottom = 5,
      height = 15,
      segments = 256,
      color = 0x67c23a,
      position = [0, 7.5, 0],
      name = 'Cylinder'
    } = options
    
    const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments)
    const material = new THREE.MeshStandardMaterial({ 
      color,
      roughness: 0.6,
      metalness: 0.2
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(...position)
    mesh.name = name
    mesh.userData.isSurface = true
    
    return this.addMesh(mesh)
  }
  
  /**
   * 创建立方体
   */
  createBox(options = {}) {
    const {
      width = 5,
      height = 5,
      depth = 5,
      color = 0x409eff,
      position = [0, 2.5, 0],
      name = 'Box'
    } = options
    
    const geometry = new THREE.BoxGeometry(width, height, depth)
    const material = new THREE.MeshStandardMaterial({ color })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(...position)
    mesh.name = name
    mesh.userData.isSurface = true
    
    return this.addMesh(mesh)
  }
  
  /**
   * 创建球体
   */
  createSphere(options = {}) {
    const {
      radius = 3,
      segments = 64,
      color = 0xe6a23c,
      position = [0, 3, 0],
      name = 'Sphere'
    } = options
    
    const geometry = new THREE.SphereGeometry(radius, segments, segments)
    const material = new THREE.MeshStandardMaterial({ color })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(...position)
    mesh.name = name
    mesh.userData.isSurface = true
    
    return this.addMesh(mesh)
  }
  
  // ==================== 选择管理 ====================
  
  /**
   * 选中对象
   */
  select(object) {
    if (this._selectedObject === object) return
    
    const previous = this._selectedObject
    this._selectedObject = object
    
    if (previous) {
      this.events.emit('deselect', { target: previous })
    }
    
    if (object) {
      this.events.emit('select', {
        target: object,
        targetType: this._getTargetType(object)
      })
    }
  }
  
  /**
   * 清除选择
   */
  clearSelection() {
    if (this._selectedObject) {
      const previous = this._selectedObject
      this._selectedObject = null
      this.events.emit('deselect', { target: previous })
      this.events.emit('selectionCleared')
    }
  }
  
  /**
   * 获取选中对象
   */
  getSelectedObject() {
    return this._selectedObject
  }
  
  // ==================== 相机控制 ====================
  
  /**
   * 重置视图
   */
  resetView() {
    this.camera.position.set(30, 30, 60)
    this.camera.lookAt(0, 0, 0)
    this.controls.reset()
    this.events.emit('viewReset')
  }
  
  /**
   * 聚焦到对象
   */
  focusOn(object) {
    if (!object) return
    
    const box = new THREE.Box3().setFromObject(object)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    
    const distance = maxDim * 2
    this.camera.position.set(
      center.x + distance,
      center.y + distance,
      center.z + distance
    )
    this.controls.target.copy(center)
    this.controls.update()
    
    this.events.emit('focusChanged', { target: object })
  }
  
  /**
   * 启用/禁用相机控制
   */
  setControlsEnabled(enabled) {
    this.controls.enabled = enabled
  }
  
  // ==================== 材质操作 ====================
  
  /**
   * 修改对象颜色
   */
  setObjectColor(object, color) {
    if (!object || !object.material) return
    
    const colorValue = typeof color === 'string' 
      ? parseInt(color.replace('#', ''), 16) 
      : color
    
    if (Array.isArray(object.material)) {
      object.material.forEach(m => m.color.setHex(colorValue))
    } else {
      object.material.color.setHex(colorValue)
    }
    
    this.events.emit('colorChanged', { object, color: colorValue })
  }
  
  /**
   * 设置对象可见性
   */
  setObjectVisible(object, visible) {
    if (!object) return
    object.visible = visible
    this.events.emit('visibilityChanged', { object, visible })
  }
  
  // ==================== 工具方法 ====================
  
  /**
   * 获取 canvas 元素
   */
  getCanvas() {
    return this.renderer.domElement
  }
  
  /**
   * 获取容器尺寸
   */
  getSize() {
    const rect = this.container.getBoundingClientRect()
    return { width: rect.width, height: rect.height }
  }
  
  /**
   * 截图
   */
  screenshot(options = {}) {
    const { width, height, type = 'image/png', quality = 1 } = options
    
    // 如果指定了尺寸，临时调整
    if (width && height) {
      this.renderer.setSize(width, height)
      this.camera.aspect = width / height
      this.camera.updateProjectionMatrix()
      this.renderer.render(this.scene, this.camera)
    }
    
    const dataUrl = this.renderer.domElement.toDataURL(type, quality)
    
    // 恢复原尺寸
    if (width && height) {
      this._onResize()
    }
    
    return dataUrl
  }
  
  // ==================== 特征检测系统 ====================
  
  /**
   * 为网格检测特征（平面、圆柱面等）
   * @param {THREE.Mesh} mesh - 网格对象
   * @returns {Promise<Object>} 特征数据
   */
  async detectFeatures(mesh) {
    if (!mesh || !mesh.geometry) {
      console.warn('无效的网格对象')
      return null
    }
    
    const meshId = this._featureDetector.generateMeshId(mesh)
    
    // 检查缓存
    if (this._detectedFeatures.has(meshId)) {
      return this._detectedFeatures.get(meshId)
    }
    
    console.log(`[Viewer] 开始检测网格特征: ${mesh.name || meshId}`)
    
    try {
      // 执行特征检测
      const features = await this._featureDetector.preprocessMesh(mesh)
      
      // 生成特征命名
      const namedFeatures = this._featureNaming.detectAndNameFeatures(mesh, meshId)
      
      // 合并结果
      const result = {
        meshId,
        meshName: mesh.name,
        ...features,
        namedFeatures
      }
      
      // 缓存结果
      this._detectedFeatures.set(meshId, result)
      
      // 更新面拾取器
      if (this._facePicker) {
        await this._facePicker.setMeshes([mesh])
      }
      
      this.events.emit('featuresDetected', { mesh, features: result })
      
      console.log(`[Viewer] 特征检测完成: ${features.planes.length} 个平面, ${features.cylinders.length} 个圆柱面`)
      
      return result
      
    } catch (error) {
      console.error('[Viewer] 特征检测失败:', error)
      this.events.emit('featureDetectionError', { mesh, error })
      return null
    }
  }
  
  /**
   * 批量检测多个网格的特征
   * @param {THREE.Mesh[]} meshes - 网格数组
   * @returns {Promise<Map>} meshId -> features 的映射
   */
  async detectFeaturesForMeshes(meshes) {
    const results = new Map()
    
    for (const mesh of meshes) {
      const features = await this.detectFeatures(mesh)
      if (features) {
        results.set(features.meshId, features)
      }
    }
    
    // 更新面拾取器
    if (this._facePicker && meshes.length > 0) {
      await this._facePicker.setMeshes(meshes)
    }
    
    return results
  }
  
  /**
   * 根据面索引获取特征信息
   * @param {THREE.Mesh} mesh - 网格对象
   * @param {number} faceIndex - 面索引
   * @returns {Object|null} 特征信息
   */
  getFeatureByFace(mesh, faceIndex) {
    const meshId = this._featureDetector.generateMeshId(mesh)
    
    // 从特征命名系统获取
    const featureName = this._featureNaming.getFeatureNameByTriangle(meshId, faceIndex)
    if (featureName) {
      return this._featureNaming.getFeatureByName(featureName)
    }
    
    // 从特征检测器获取
    return this._featureDetector.getFeatureByFaceIndex(meshId, faceIndex)
  }
  
  /**
   * 获取网格的所有特征
   * @param {THREE.Mesh} mesh - 网格对象
   * @returns {Object|null} 特征数据
   */
  getMeshFeatures(mesh) {
    const meshId = this._featureDetector.generateMeshId(mesh)
    return this._detectedFeatures.get(meshId) || null
  }
  
  /**
   * 获取特征的所有三角形索引
   * @param {string} featureName - 特征名字
   * @returns {Array} 三角形索引数组
   */
  getFeatureTriangles(featureName) {
    return this._featureNaming.getFeatureTriangles(featureName)
  }
  
  /**
   * 选择整个特征（选中特征包含的所有面）
   * @param {THREE.Mesh} mesh - 网格对象
   * @param {string} featureId - 特征ID
   */
  selectFeature(mesh, featureId) {
    if (!this._facePicker) return
    
    const meshId = this._featureDetector.generateMeshId(mesh)
    this._facePicker.selectFeature(meshId, featureId)
  }
  
  /**
   * 设置特征面过滤模式
   * @param {boolean} enabled - 是否只允许选中识别出的特征面
   */
  setFeatureOnlyMode(enabled) {
    this._featureOnlyMode = enabled
    console.log(`[Viewer] 特征面过滤模式: ${enabled ? '开启' : '关闭'}`)
    this.events.emit('featureOnlyModeChanged', { enabled })
  }
  
  /**
   * 获取特征面过滤模式状态
   * @returns {boolean} 是否开启
   */
  isFeatureOnlyMode() {
    return this._featureOnlyMode
  }
  
  /**
   * 启用面拾取功能
   */
  enableFacePicking() {
    if (this._facePicker) {
      this._facePicker.enable()
      console.log('[Viewer] 面拾取功能已启用')
    }
  }
  
  /**
   * 禁用面拾取功能
   */
  disableFacePicking() {
    if (this._facePicker) {
      this._facePicker.disable()
      console.log('[Viewer] 面拾取功能已禁用')
    }
  }
  
  /**
   * 获取面拾取器实例
   * @returns {OptimizedFacePicker|null}
   */
  getFacePicker() {
    return this._facePicker
  }
  
  /**
   * 获取特征检测器实例
   * @returns {FeatureDetector}
   */
  getFeatureDetector() {
    return this._featureDetector
  }
  
  /**
   * 获取特征命名系统实例
   * @returns {FeatureBasedNaming}
   */
  getFeatureNaming() {
    return this._featureNaming
  }
  
  /**
   * 清除特征缓存
   * @param {THREE.Mesh} mesh - 网格对象（可选，不传则清除所有）
   */
  clearFeatureCache(mesh = null) {
    if (mesh) {
      const meshId = this._featureDetector.generateMeshId(mesh)
      this._detectedFeatures.delete(meshId)
      this._featureDetector.clearCache(meshId)
    } else {
      this._detectedFeatures.clear()
      this._featureDetector.clearCache()
      this._featureNaming.clearCache()
    }
    console.log('[Viewer] 特征缓存已清除')
  }
  
  /**
   * 获取特征检测统计信息
   * @returns {Object} 统计信息
   */
  getFeatureStats() {
    const detectorStats = this._featureDetector.getCacheStats()
    const facePickerStats = this._facePicker?.getPerformanceStats() || {}
    
    return {
      detector: detectorStats,
      facePicker: facePickerStats,
      cachedMeshes: this._detectedFeatures.size,
      featureOnlyMode: this._featureOnlyMode
    }
  }
  
  // ==================== 销毁 ====================
  
  dispose() {
    this._isDisposed = true
    
    if (this._animationId) {
      cancelAnimationFrame(this._animationId)
    }
    
    this._unbindEvents()
    this.events.clear()
    
    // 清理面拾取器
    if (this._facePicker) {
      this._facePicker.destroy()
      this._facePicker = null
    }
    
    // 清理特征检测系统
    this._featureDetector.clearCache()
    this._featureNaming.clearCache()
    this._detectedFeatures.clear()
    
    // 清理所有网格
    this._meshes.forEach(mesh => {
      if (mesh.geometry) mesh.geometry.dispose()
      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(m => m.dispose())
        } else {
          mesh.material.dispose()
        }
      }
    })
    this._meshes = []
    this._selectableObjects = []
    
    this.controls.dispose()
    this.renderer.dispose()
    
    if (this.container.contains(this.renderer.domElement)) {
      this.container.removeChild(this.renderer.domElement)
    }
    
    this.events.emit('disposed')
  }
}

export default Viewer
