/**
 * 表面文字雕刻系统
 * 提供在3D网格表面添加文字的完整功能
 */

import { SurfaceTextManager } from './SurfaceTextManager.js'

export { SurfaceTextManager } from './SurfaceTextManager.js'
export { TextGeometryGenerator } from './TextGeometryGenerator.js'
export { TextInputOverlay } from './TextInputOverlay.js'
export { TextTransformControls } from './TextTransformControls.js'
export { BooleanOperator } from './BooleanOperator.js'
export { TextPropertyPanel } from './TextPropertyPanel.js'

// 测试工具
export { runAllTextSystemTests } from './test-text-system.js'

/**
 * 创建表面文字管理器的便捷函数
 * @param {THREE.Scene} scene - Three.js场景
 * @param {THREE.Camera} camera - Three.js相机
 * @param {THREE.WebGLRenderer} renderer - Three.js渲染器
 * @param {HTMLElement} domElement - DOM元素
 * @param {Object} facePicker - 面拾取器实例
 * @returns {SurfaceTextManager} 表面文字管理器实例
 */
export function createSurfaceTextManager(scene, camera, renderer, domElement, facePicker) {
  return new SurfaceTextManager(scene, camera, renderer, domElement, facePicker)
}

/**
 * 文字对象工具函数
 */
export const TextUtils = {
  /**
   * 验证文字内容
   * @param {string} content - 文字内容
   * @returns {boolean} 是否有效
   */
  validateTextContent(content) {
    return typeof content === 'string' && content.trim().length > 0
  },
  
  /**
   * 生成唯一文字ID
   * @returns {string} 唯一ID
   */
  generateTextId() {
    return `text_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
  },
  
  /**
   * 计算文字边界框
   * @param {THREE.TextGeometry} geometry - 文字几何体
   * @returns {THREE.Box3} 边界框
   */
  calculateTextBounds(geometry) {
    geometry.computeBoundingBox()
    return geometry.boundingBox
  },
  
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