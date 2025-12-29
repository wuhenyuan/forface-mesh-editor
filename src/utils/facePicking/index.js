/**
 * 面拾取工具包
 * 提供3D网格面级拾取和选择功能
 * 包含优化的 BVH + Feature 预处理系统
 */

import { RaycastManager } from './RaycastManager.js'

// 核心组件
export { FacePicker } from './FacePicker.js'
export { RaycastManager } from './RaycastManager.js'
export { SelectionManager } from './SelectionManager.js'
export { HighlightRenderer } from './HighlightRenderer.js'
export { EventHandler } from './EventHandler.js'

// 优化组件
export { OptimizedFacePicker } from './OptimizedFacePicker.js'
export { FeatureDetector } from './FeatureDetector.js'
export { FeaturePool } from './FeaturePool.js'

// 调试和测试工具
export { DebugLogger, debugLogger } from './DebugLogger.js'
export { runFinalIntegrationTests } from './integration-test-final.js'
export { runFinalValidation } from './final-validation.js'

/**
 * 创建面拾取器的便捷函数
 * @param {THREE.Scene} scene - Three.js场景
 * @param {THREE.Camera} camera - Three.js相机
 * @param {THREE.WebGLRenderer} renderer - Three.js渲染器
 * @param {HTMLElement} domElement - DOM元素
 * @returns {FacePicker} 面拾取器实例
 */
export function createFacePicker(scene, camera, renderer, domElement) {
  return new FacePicker(scene, camera, renderer, domElement)
}

/**
 * 创建优化面拾取器的便捷函数
 * @param {THREE.Scene} scene - Three.js场景
 * @param {THREE.Camera} camera - Three.js相机
 * @param {THREE.WebGLRenderer} renderer - Three.js渲染器
 * @param {HTMLElement} domElement - DOM元素
 * @returns {Promise<OptimizedFacePicker>} 优化面拾取器实例
 */
export async function createOptimizedFacePicker(scene, camera, renderer, domElement) {
  const { OptimizedFacePicker } = await import('./OptimizedFacePicker.js')
  return new OptimizedFacePicker(scene, camera, renderer, domElement)
}

/**
 * 面拾取工具函数
 */
export const FacePickingUtils = {
  /**
   * 验证网格是否适合面拾取
   * @param {THREE.Mesh} mesh - 网格对象
   * @returns {boolean} 是否有效
   */
  validateMesh(mesh) {
    // 直接实现验证逻辑，避免循环依赖
    if (!mesh || !mesh.geometry) {
      return false
    }
    
    if (!mesh.visible) {
      return false
    }
    
    const geometry = mesh.geometry
    
    if (geometry.isBufferGeometry) {
      const positionAttribute = geometry.getAttribute('position')
      if (!positionAttribute || positionAttribute.count === 0) {
        return false
      }
      
      const indexAttribute = geometry.getIndex()
      const faceCount = indexAttribute 
        ? indexAttribute.count / 3 
        : positionAttribute.count / 3
      
      return faceCount >= 1
    }
    
    if (geometry.isGeometry) {
      return geometry.vertices?.length > 0 && geometry.faces?.length > 0
    }
    
    return false
  },
  
  /**
   * 从场景中获取所有可拾取的网格
   * @param {THREE.Scene} scene - Three.js场景
   * @param {boolean} includeChildren - 是否包含子对象
   * @returns {THREE.Mesh[]} 网格数组
   */
  getPickableMeshes(scene, includeChildren = true) {
    const meshes = []
    
    if (includeChildren) {
      scene.traverse((object) => {
        if (object.isMesh && this.validateMesh(object) && this.isMeshPickable(object)) {
          meshes.push(object)
        }
      })
    } else {
      scene.children.forEach((object) => {
        if (object.isMesh && this.validateMesh(object) && this.isMeshPickable(object)) {
          meshes.push(object)
        }
      })
    }
    
    return meshes
  },
  
  /**
   * 为网格添加面拾取标记
   * @param {THREE.Mesh} mesh - 网格对象
   * @param {boolean} pickable - 是否可拾取
   */
  setMeshPickable(mesh, pickable = true) {
    if (mesh && mesh.userData) {
      mesh.userData.facePickable = pickable
    }
  },
  
  /**
   * 检查网格是否标记为可拾取
   * @param {THREE.Mesh} mesh - 网格对象
   * @returns {boolean} 是否可拾取
   */
  isMeshPickable(mesh) {
    return mesh && mesh.userData && mesh.userData.facePickable !== false
  },
  
  /**
   * 批量设置网格的可拾取状态
   * @param {THREE.Mesh[]} meshes - 网格数组
   * @param {boolean} pickable - 是否可拾取
   */
  setMeshesPickable(meshes, pickable = true) {
    meshes.forEach(mesh => this.setMeshPickable(mesh, pickable))
  },
  
  /**
   * 获取网格的几何体信息
   * @param {THREE.Mesh} mesh - 网格对象
   * @returns {Object} 几何体信息
   */
  getMeshInfo(mesh) {
    if (!mesh || !mesh.geometry) {
      return null
    }
    
    // 直接实现兼容性检查，避免循环依赖
    const geometry = mesh.geometry
    const compatibility = {
      isCompatible: false,
      type: 'unknown',
      faceCount: 0,
      hasIndices: false,
      warnings: []
    }
    
    if (geometry.isBufferGeometry) {
      compatibility.type = 'BufferGeometry'
      const positionAttribute = geometry.getAttribute('position')
      if (positionAttribute) {
        const indexAttribute = geometry.getIndex()
        compatibility.faceCount = indexAttribute 
          ? indexAttribute.count / 3 
          : positionAttribute.count / 3
        compatibility.hasIndices = !!indexAttribute
        compatibility.isCompatible = compatibility.faceCount > 0
      }
    } else if (geometry.isGeometry) {
      compatibility.type = 'Geometry'
      compatibility.faceCount = geometry.faces ? geometry.faces.length : 0
      compatibility.isCompatible = compatibility.faceCount > 0
    }
    
    return {
      name: mesh.name || 'Unnamed Mesh',
      uuid: mesh.uuid,
      visible: mesh.visible,
      pickable: this.isMeshPickable(mesh),
      geometry: compatibility,
      position: mesh.position.clone(),
      rotation: mesh.rotation.clone(),
      scale: mesh.scale.clone()
    }
  },
  
  /**
   * 过滤出有效的可拾取网格
   * @param {THREE.Mesh[]} meshes - 网格数组
   * @returns {THREE.Mesh[]} 有效的网格数组
   */
  filterValidMeshes(meshes) {
    return meshes.filter(mesh => 
      this.validateMesh(mesh) && 
      this.isMeshPickable(mesh) && 
      mesh.visible
    )
  },
  
  /**
   * 创建网格的调试信息
   * @param {THREE.Mesh[]} meshes - 网格数组
   * @returns {Object} 调试信息
   */
  createDebugInfo(meshes) {
    const validMeshes = this.filterValidMeshes(meshes)
    const invalidMeshes = meshes.filter(mesh => !this.validateMesh(mesh))
    
    return {
      total: meshes.length,
      valid: validMeshes.length,
      invalid: invalidMeshes.length,
      validMeshes: validMeshes.map(mesh => this.getMeshInfo(mesh)),
      invalidMeshes: invalidMeshes.map(mesh => ({
        name: mesh.name || 'Unnamed Mesh',
        uuid: mesh.uuid,
        issues: this.validateMesh(mesh) ? [] : ['Invalid geometry']
      }))
    }
  },
  
  /**
   * 运行完整的验证测试
   * @returns {Promise<Object>} 测试结果
   */
  async runValidationTests() {
    const { runFinalIntegrationTests } = await import('./integration-test-final.js')
    const { runFinalValidation } = await import('./final-validation.js')
    
    const integrationResults = await runFinalIntegrationTests()
    const validationResults = await runFinalValidation()
    
    return {
      integration: integrationResults,
      validation: validationResults,
      overall: {
        success: integrationResults.success && validationResults.success,
        timestamp: new Date().toISOString()
      }
    }
  }
}