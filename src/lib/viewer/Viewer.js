/**
 * 3D 场景查看器（纯净版）
 * 封装 Three.js 场景管理和基础 3D 交互逻辑
 * 不包含任何业务逻辑
 */
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EventManager } from './EventManager.js'

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
    
    if (width && height) {
      this.renderer.setSize(width, height)
      this.camera.aspect = width / height
      this.camera.updateProjectionMatrix()
      this.renderer.render(this.scene, this.camera)
    }
    
    const dataUrl = this.renderer.domElement.toDataURL(type, quality)
    
    if (width && height) {
      this._onResize()
    }
    
    return dataUrl
  }
  
  // ==================== 销毁 ====================
  
  dispose() {
    this._isDisposed = true
    
    if (this._animationId) {
      cancelAnimationFrame(this._animationId)
    }
    
    this._unbindEvents()
    this.events.clear()
    
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
