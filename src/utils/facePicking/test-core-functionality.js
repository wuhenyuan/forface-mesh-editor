/**
 * 核心面拾取功能测试
 * 用于验证基本功能是否正常工作
 */

import * as THREE from 'three'
import { FacePicker, RaycastManager, SelectionManager, FacePickingUtils } from './index.js'

/**
 * 测试核心功能
 */
export function testCoreFunctionality() {
  console.log('🧪 开始测试面拾取核心功能...')
  
  const results = {
    raycastManager: testRaycastManager(),
    selectionManager: testSelectionManager(),
    facePicker: testFacePicker(),
    utils: testUtils()
  }
  
  const allPassed = Object.values(results).every(result => result.passed)
  
  console.log('📊 测试结果汇总:')
  Object.entries(results).forEach(([component, result]) => {
    console.log(`  ${result.passed ? '✅' : '❌'} ${component}: ${result.message}`)
  })
  
  console.log(`🎯 总体结果: ${allPassed ? '✅ 所有测试通过' : '❌ 部分测试失败'}`)
  
  return { allPassed, results }
}

/**
 * 测试RaycastManager
 */
function testRaycastManager() {
  try {
    console.log('🔍 测试RaycastManager...')
    
    // 创建测试相机
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000)
    camera.position.set(0, 0, 5)
    
    // 创建RaycastManager
    const raycastManager = new RaycastManager(camera)
    
    // 测试屏幕坐标转换
    const rect = { left: 0, top: 0, width: 800, height: 600 }
    const ndc = raycastManager.screenToNDC(400, 300, rect)
    
    if (Math.abs(ndc.x) < 0.01 && Math.abs(ndc.y) < 0.01) {
      console.log('  ✅ 屏幕坐标转换正常')
    } else {
      throw new Error('屏幕坐标转换失败')
    }
    
    // 测试网格验证
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 })
    const mesh = new THREE.Mesh(geometry, material)
    
    if (RaycastManager.validateMesh(mesh)) {
      console.log('  ✅ 网格验证正常')
    } else {
      throw new Error('网格验证失败')
    }
    
    // 测试几何体兼容性检查
    const compatibility = RaycastManager.checkGeometryCompatibility(geometry)
    if (compatibility.isCompatible && compatibility.type === 'BufferGeometry') {
      console.log('  ✅ 几何体兼容性检查正常')
    } else {
      throw new Error('几何体兼容性检查失败')
    }
    
    return { passed: true, message: '所有功能正常' }
    
  } catch (error) {
    console.error('  ❌ RaycastManager测试失败:', error.message)
    return { passed: false, message: error.message }
  }
}

/**
 * 测试SelectionManager
 */
function testSelectionManager() {
  try {
    console.log('📋 测试SelectionManager...')
    
    const selectionManager = new SelectionManager()
    
    // 创建测试面信息
    const faceInfo1 = { id: 'face_1', mesh: {}, faceIndex: 0 }
    const faceInfo2 = { id: 'face_2', mesh: {}, faceIndex: 1 }
    
    // 测试单选模式
    selectionManager.setSelectionMode('single')
    selectionManager.addFace(faceInfo1, false)
    
    if (selectionManager.getCount() === 1 && selectionManager.contains(faceInfo1)) {
      console.log('  ✅ 单选模式添加正常')
    } else {
      throw new Error('单选模式添加失败')
    }
    
    // 测试单选模式替换
    selectionManager.addFace(faceInfo2, false)
    if (selectionManager.getCount() === 1 && selectionManager.contains(faceInfo2)) {
      console.log('  ✅ 单选模式替换正常')
    } else {
      throw new Error('单选模式替换失败')
    }
    
    // 测试多选模式
    selectionManager.setSelectionMode('multi')
    selectionManager.addFace(faceInfo1, false)
    
    if (selectionManager.getCount() === 2) {
      console.log('  ✅ 多选模式正常')
    } else {
      throw new Error('多选模式失败')
    }
    
    // 测试清除选择
    selectionManager.clearAll(false)
    if (selectionManager.getCount() === 0) {
      console.log('  ✅ 清除选择正常')
    } else {
      throw new Error('清除选择失败')
    }
    
    // 测试状态验证
    if (selectionManager.validateState()) {
      console.log('  ✅ 状态验证正常')
    } else {
      throw new Error('状态验证失败')
    }
    
    return { passed: true, message: '所有功能正常' }
    
  } catch (error) {
    console.error('  ❌ SelectionManager测试失败:', error.message)
    return { passed: false, message: error.message }
  }
}

/**
 * 测试FacePicker
 */
function testFacePicker() {
  try {
    console.log('🎯 测试FacePicker...')
    
    // 创建测试环境
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000)
    const renderer = new THREE.WebGLRenderer()
    const domElement = document.createElement('div')
    
    // 创建FacePicker
    const facePicker = new FacePicker(scene, camera, renderer, domElement)
    
    // 测试启用/禁用
    facePicker.enable()
    if (facePicker.enabled) {
      console.log('  ✅ 启用功能正常')
    } else {
      throw new Error('启用功能失败')
    }
    
    facePicker.disable()
    if (!facePicker.enabled) {
      console.log('  ✅ 禁用功能正常')
    } else {
      throw new Error('禁用功能失败')
    }
    
    // 测试网格管理
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 })
    const mesh = new THREE.Mesh(geometry, material)
    
    facePicker.addMesh(mesh)
    if (facePicker.meshes.includes(mesh)) {
      console.log('  ✅ 网格添加正常')
    } else {
      throw new Error('网格添加失败')
    }
    
    facePicker.removeMesh(mesh)
    if (!facePicker.meshes.includes(mesh)) {
      console.log('  ✅ 网格移除正常')
    } else {
      throw new Error('网格移除失败')
    }
    
    // 测试事件系统
    let eventFired = false
    facePicker.on('test', () => { eventFired = true })
    facePicker.emit('test')
    
    if (eventFired) {
      console.log('  ✅ 事件系统正常')
    } else {
      throw new Error('事件系统失败')
    }
    
    return { passed: true, message: '所有功能正常' }
    
  } catch (error) {
    console.error('  ❌ FacePicker测试失败:', error.message)
    return { passed: false, message: error.message }
  }
}

/**
 * 测试工具函数
 */
function testUtils() {
  try {
    console.log('🔧 测试工具函数...')
    
    // 创建测试网格
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 })
    const mesh = new THREE.Mesh(geometry, material)
    
    // 测试网格验证
    if (FacePickingUtils.validateMesh(mesh)) {
      console.log('  ✅ 网格验证正常')
    } else {
      throw new Error('网格验证失败')
    }
    
    // 测试可拾取标记
    FacePickingUtils.setMeshPickable(mesh, true)
    if (FacePickingUtils.isMeshPickable(mesh)) {
      console.log('  ✅ 可拾取标记正常')
    } else {
      throw new Error('可拾取标记失败')
    }
    
    // 测试网格信息获取
    const meshInfo = FacePickingUtils.getMeshInfo(mesh)
    if (meshInfo && meshInfo.geometry && meshInfo.geometry.isCompatible) {
      console.log('  ✅ 网格信息获取正常')
    } else {
      throw new Error('网格信息获取失败')
    }
    
    return { passed: true, message: '所有功能正常' }
    
  } catch (error) {
    console.error('  ❌ 工具函数测试失败:', error.message)
    return { passed: false, message: error.message }
  }
}

/**
 * 运行集成测试
 */
export function runIntegrationTest() {
  console.log('🔄 运行集成测试...')
  
  try {
    // 创建完整的测试环境
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(75, 800/600, 0.1, 1000)
    camera.position.set(0, 0, 5)
    
    const renderer = new THREE.WebGLRenderer()
    renderer.setSize(800, 600)
    
    const domElement = document.createElement('div')
    domElement.style.width = '800px'
    domElement.style.height = '600px'
    
    // 创建测试网格
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    const material = new THREE.MeshBasicMaterial({ color: 0x409eff })
    const mesh = new THREE.Mesh(geometry, material)
    scene.add(mesh)
    
    // 创建面拾取器
    const facePicker = new FacePicker(scene, camera, renderer, domElement)
    facePicker.addMesh(mesh)
    facePicker.enable()
    
    // 模拟鼠标点击事件
    const mockEvent = {
      clientX: 400,
      clientY: 300,
      ctrlKey: false,
      metaKey: false,
      key: 'Escape'
    }
    
    // 测试点击处理
    facePicker.handleClick(mockEvent)
    console.log('  ✅ 点击事件处理正常')
    
    // 测试键盘处理
    facePicker.handleKeyDown(mockEvent)
    console.log('  ✅ 键盘事件处理正常')
    
    // 清理
    facePicker.destroy()
    console.log('  ✅ 资源清理正常')
    
    console.log('🎉 集成测试通过')
    return true
    
  } catch (error) {
    console.error('❌ 集成测试失败:', error.message)
    return false
  }
}