/**
 * 3D 场景查看器（纯净版）
 * 封装 Three.js 场景管理和基础 3D 交互逻辑
 * 不包含任何业务逻辑
 */
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EventManager } from './EventManager'
import type { 
  ViewerOptions, 
  AddMeshOptions, 
  ScreenshotOptions 
} from '../../types/viewer'
import type { ViewerClickEvent } from '../../types/events'

export interface CylinderOptions {
  radiusTop?: number
  radiusBottom?: number
  height?: number
  segments?: number
  color?: number
  position?: [number, number, number]
  name?: string
}

export interface BoxOptions {
  width?: number
  height?: number
  depth?: number
  color?: number
  position?: [number, number, number]
  name?: string
}

export interface SphereOptions {
  radius?: number
  segments?: number
  color?: number
  position?: [number, number, number]
  name?: string
}

export class Viewer {
  container: HTMLElement
  options: ViewerOptions
  scene: THREE.Scene | null
  camera: THREE.PerspectiveCamera | null
  renderer: THREE.WebGLRenderer | null
  controls: OrbitControls | null
  events: EventManager
  
  private _animationId: number | null
  private _isDisposed: boolean
  private _meshes: THREE.Mesh[]
  private _selectableObjects: THREE.Object3D[]
  private _selectedObject: THREE.Object3D | null
  private _hoveredObject: THREE.Object3D | null
  private _raycaster: THREE.Raycaster
  private _mouse: THREE.Vector2

  constructor(container: HTMLElement, options: ViewerOptions = {}) {
    this.container = container
    this.options = {
      backgroundColor: 0xf2f3f5,
      enableShadow: true,
      enableGrid: true,
      ...options
    }
    
    this.scene = null
    this.camera = null
    this.renderer = null
    this.controls = null
    this.events = new EventManager()
    
    this._animationId = null
    this._isDisposed = false
    this._meshes = []
    this._selectableObjects = []
    this._selectedObject = null
    this._hoveredObject = null
    this._raycaster = new THREE.Raycaster()
    this._mouse = new THREE.Vector2()
    
    this._init()
    this._bindEvents()
    this._animate()
  }
  
  private _init(): void {
    const rect = this.container.getBoundingClientRect()
    
    this.renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      preserveDrawingBuffer: true
    })
    this.renderer.setSize(rect.width, rect.height)
    this.renderer.setPixelRatio(window.devicePixelRatio)
    this.renderer.shadowMap.enabled = this.options.enableShadow ?? true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.container.appendChild(this.renderer.domElement)
    
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(this.options.backgroundColor)
    
    this.camera = new THREE.PerspectiveCamera(60, rect.width / rect.height, 0.1, 1000)
    this.camera.position.set(30, 30, 60)
    
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = false
    
    this._setupLighting()
    if (this.options.enableGrid) {
      this._setupGrid()
    }
  }
  
  private _setupLighting(): void {
    if (!this.scene) return
    
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
  
  private _setupGrid(): void {
    if (!this.scene) return
    
    const grid = new THREE.GridHelper(20, 20, 0xcccccc, 0xeeeeee)
    grid.userData.isHelper = true
    this.scene.add(grid)
  }
  
  private _bindEvents(): void {
    if (!this.renderer) return
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
  
  private _unbindEvents(): void {
    if (!this.renderer) return
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
  
  private _updateMouse(event: MouseEvent): void {
    if (!this.renderer) return
    const rect = this.renderer.domElement.getBoundingClientRect()
    this._mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this._mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  }
  
  private _raycast(objects: THREE.Object3D[] | null = null): THREE.Intersection[] {
    if (!this.camera) return []
    this._raycaster.setFromCamera(this._mouse, this.camera)
    const targets = objects || this._selectableObjects.filter(obj => obj.visible)
    return this._raycaster.intersectObjects(targets, true)
  }
  
  private _getTargetType(object: THREE.Object3D | null): 'text' | 'surface' | 'object' | 'empty' {
    if (!object) return 'empty'
    if (object.userData.isText) return 'text'
    if (object.userData.isSurface || object.userData.isMesh) return 'surface'
    return 'object'
  }
  
  private _findSelectableParent(object: THREE.Object3D): THREE.Object3D {
    let current: THREE.Object3D | null = object
    while (current) {
      if (this._selectableObjects.includes(current)) {
        return current
      }
      current = current.parent
    }
    return object
  }
  
  private _onClick(event: MouseEvent): void {
    this._updateMouse(event)
    const intersects = this._raycast()
    
    if (intersects.length > 0) {
      const hit = intersects[0]
      const target = this._findSelectableParent(hit.object)
      
      this.events.emit<ViewerClickEvent>('click', {
        target,
        targetType: this._getTargetType(target),
        point: hit.point,
        faceIndex: hit.faceIndex,
        face: hit.face as THREE.Face,
        uv: hit.uv,
        event
      })
    } else {
      this.events.emit<ViewerClickEvent>('click', { target: null, targetType: 'empty', event })
    }
  }
  
  private _onDblClick(event: MouseEvent): void {
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
  
  private _onContextMenu(event: MouseEvent): void {
    event.preventDefault()
    this._updateMouse(event)
    const intersects = this._raycast()
    
    let target: THREE.Object3D | null = null
    let targetType: 'text' | 'surface' | 'object' | 'empty' = 'empty'
    let point: THREE.Vector3 | null = null
    let faceIndex: number | undefined = undefined
    
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
  
  private _onMouseMove(event: MouseEvent): void {
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
  
  private _onMouseDown(event: MouseEvent): void {
    this.events.emit('mousedown', { event })
  }
  
  private _onMouseUp(event: MouseEvent): void {
    this.events.emit('mouseup', { event })
  }
  
  private _onResize(): void {
    if (!this.camera || !this.renderer) return
    const rect = this.container.getBoundingClientRect()
    this.camera.aspect = rect.width / rect.height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(rect.width, rect.height)
    
    this.events.emit('resize', { width: rect.width, height: rect.height })
  }
  
  private _onKeyDown(event: KeyboardEvent): void {
    this.events.emit('keydown', { key: event.key, event })
    
    if (event.key === 'Escape') {
      this.clearSelection()
      this.events.emit('escape')
    }
    
    if (event.key === 'Delete' && this._selectedObject) {
      this.events.emit('deleteRequest', { target: this._selectedObject })
    }
  }
  
  private _animate(): void {
    if (this._isDisposed) return
    
    this._animationId = requestAnimationFrame(() => this._animate())
    this.controls?.update()
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera)
    }
  }
  
  addMesh(mesh: THREE.Mesh, options: AddMeshOptions = {}): THREE.Mesh {
    const { selectable = true, castShadow = true, receiveShadow = true } = options
    
    mesh.castShadow = castShadow
    mesh.receiveShadow = receiveShadow
    
    this.scene?.add(mesh)
    this._meshes.push(mesh)
    
    if (selectable && !mesh.userData.isHelper) {
      this._selectableObjects.push(mesh)
    }
    
    this.events.emit('meshAdded', { mesh })
    return mesh
  }
  
  removeMesh(mesh: THREE.Mesh): void {
    this.scene?.remove(mesh)
    
    const meshIndex = this._meshes.indexOf(mesh)
    if (meshIndex > -1) this._meshes.splice(meshIndex, 1)
    
    const selectableIndex = this._selectableObjects.indexOf(mesh)
    if (selectableIndex > -1) this._selectableObjects.splice(selectableIndex, 1)
    
    if (this._selectedObject === mesh) {
      this._selectedObject = null
    }
    
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
  
  getMeshes(): THREE.Mesh[] {
    return [...this._meshes]
  }
  
  getMeshByName(name: string): THREE.Mesh | undefined {
    return this._meshes.find(m => m.name === name)
  }
  
  createCylinder(options: CylinderOptions = {}): THREE.Mesh {
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
  
  createBox(options: BoxOptions = {}): THREE.Mesh {
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
  
  createSphere(options: SphereOptions = {}): THREE.Mesh {
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
  
  select(object: THREE.Object3D | null): void {
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
  
  clearSelection(): void {
    if (this._selectedObject) {
      const previous = this._selectedObject
      this._selectedObject = null
      this.events.emit('deselect', { target: previous })
      this.events.emit('selectionCleared')
    }
  }
  
  getSelectedObject(): THREE.Object3D | null {
    return this._selectedObject
  }
  
  resetView(): void {
    if (!this.camera || !this.controls) return
    this.camera.position.set(30, 30, 60)
    this.camera.lookAt(0, 0, 0)
    this.controls.reset()
    this.events.emit('viewReset')
  }
  
  focusOn(object: THREE.Object3D | null): void {
    if (!object || !this.camera || !this.controls) return
    
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
  
  setControlsEnabled(enabled: boolean): void {
    if (this.controls) {
      this.controls.enabled = enabled
    }
  }
  
  setObjectColor(object: THREE.Object3D | null, color: string | number): void {
    if (!object || !(object as THREE.Mesh).material) return
    
    const mesh = object as THREE.Mesh
    const colorValue = typeof color === 'string' 
      ? parseInt(color.replace('#', ''), 16) 
      : color
    
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach(m => (m as THREE.MeshStandardMaterial).color.setHex(colorValue))
    } else {
      (mesh.material as THREE.MeshStandardMaterial).color.setHex(colorValue)
    }
    
    this.events.emit('colorChanged', { object, color: colorValue })
  }
  
  setObjectVisible(object: THREE.Object3D | null, visible: boolean): void {
    if (!object) return
    object.visible = visible
    this.events.emit('visibilityChanged', { object, visible })
  }
  
  getCanvas(): HTMLCanvasElement | null {
    return this.renderer?.domElement ?? null
  }
  
  getSize(): { width: number; height: number } {
    const rect = this.container.getBoundingClientRect()
    return { width: rect.width, height: rect.height }
  }
  
  screenshot(options: ScreenshotOptions = {}): string {
    const { width, height, type = 'image/png', quality = 1 } = options
    
    if (width && height && this.renderer && this.camera) {
      this.renderer.setSize(width, height)
      this.camera.aspect = width / height
      this.camera.updateProjectionMatrix()
      this.renderer.render(this.scene!, this.camera)
    }
    
    const dataUrl = this.renderer?.domElement.toDataURL(type, quality) ?? ''
    
    if (width && height) {
      this._onResize()
    }
    
    return dataUrl
  }
  
  dispose(): void {
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
    
    this.controls?.dispose()
    this.renderer?.dispose()
    
    if (this.renderer && this.container.contains(this.renderer.domElement)) {
      this.container.removeChild(this.renderer.domElement)
    }
    
    this.events.emit('disposed')
  }
}

export default Viewer
