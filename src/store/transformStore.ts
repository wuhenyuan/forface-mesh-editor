/**
 * 变换状态管理
 * 管理编辑器中所有对象的 position/rotation/scale
 * 
 * 设计原则：
 * 1. 每个对象存储局部变换（相对于父级）
 * 2. Three.js 的 Object3D 层级自动处理世界变换
 * 3. Store 只管理数据，实际变换由 Viewer 应用
 */
import Vue from 'vue'

// ==================== 变换数据结构 ====================
/**
 * 创建默认变换对象
 * @returns {Transform}
 */
const createDefaultTransform = () => ({
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },  // 欧拉角（度数）
  scale: { x: 1, y: 1, z: 1 }
})

/**
 * 创建统一缩放的变换
 * @param {number} uniformScale 
 */
const createUniformScaleTransform = (uniformScale = 1) => ({
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: uniformScale, y: uniformScale, z: uniformScale }
})

// ==================== 核心状态 ====================
const state = Vue.observable({
  // 整体场景变换（用于导出时的整体调整）
  scene: createDefaultTransform(),
  
  // 主模型变换
  mainModel: {
    ...createDefaultTransform(),
    // 模型特有属性
    visible: true,
    locked: false  // 锁定后不可编辑
  },
  
  // 底座变换
  base: {
    ...createDefaultTransform(),
    visible: true,
    locked: false,
    // 底座可能需要自动对齐到模型底部
    autoAlignToModel: true
  },
  
  // 文字变换映射 { [textId]: TransformData }
  texts: {} as Record<string, any>,
  
  // 当前选中的变换目标
  activeTarget: null,  // 'scene' | 'mainModel' | 'base' | textId
  
  // 变换模式
  transformMode: 'translate',  // 'translate' | 'rotate' | 'scale'
  
  // 变换空间
  transformSpace: 'local'  // 'local' | 'world'
})

// ==================== Getters ====================
const getters = {
  // 获取当前选中目标的变换数据
  activeTransform: () => {
    const target = state.activeTarget
    if (!target) return null
    
    if (target === 'scene') return state.scene
    if (target === 'mainModel') return state.mainModel
    if (target === 'base') return state.base
    return state.texts[target] || null
  },
  
  // 获取所有文字的变换列表
  allTextTransforms: () => {
    return Object.entries(state.texts).map(([id, transform]) => ({
      id,
      ...transform
    }))
  },
  
  // 检查目标是否被锁定
  isTargetLocked: (target) => {
    if (target === 'mainModel') return state.mainModel.locked
    if (target === 'base') return state.base.locked
    return state.texts[target]?.locked || false
  }
}

// ==================== Actions ====================
const actions = {
  // --- 选中目标 ---
  setActiveTarget(target) {
    state.activeTarget = target
  },
  
  clearActiveTarget() {
    state.activeTarget = null
  },
  
  // --- 变换模式 ---
  setTransformMode(mode) {
    if (['translate', 'rotate', 'scale'].includes(mode)) {
      state.transformMode = mode
    }
  },
  
  setTransformSpace(space) {
    if (['local', 'world'].includes(space)) {
      state.transformSpace = space
    }
  },
  
  // --- 通用变换更新 ---
  /**
   * 更新指定目标的变换
   * @param {string} target - 'scene' | 'mainModel' | 'base' | textId
   * @param {Partial<Transform>} transform - 要更新的变换属性
   */
  updateTransform(target, transform) {
    let targetObj = this._getTargetObject(target)
    if (!targetObj) return
    
    // 检查是否锁定
    if (targetObj.locked) {
      console.warn(`Target ${target} is locked`)
      return
    }
    
    // 合并更新
    if (transform.position) {
      Object.assign(targetObj.position, transform.position)
    }
    if (transform.rotation) {
      Object.assign(targetObj.rotation, transform.rotation)
    }
    if (transform.scale) {
      Object.assign(targetObj.scale, transform.scale)
    }
  },
  
  /**
   * 设置位置
   */
  setPosition(target, x, y, z) {
    this.updateTransform(target, { 
      position: { x, y, z } 
    })
  },
  
  /**
   * 设置旋转（度数）
   */
  setRotation(target, x, y, z) {
    this.updateTransform(target, { 
      rotation: { x, y, z } 
    })
  },
  
  /**
   * 设置缩放
   */
  setScale(target, x, y, z) {
    this.updateTransform(target, { 
      scale: { x, y, z } 
    })
  },
  
  /**
   * 设置统一缩放
   */
  setUniformScale(target, scale) {
    this.setScale(target, scale, scale, scale)
  },
  
  // --- 文字变换管理 ---
  /**
   * 添加文字变换
   * @param {string} textId 
   * @param {object} options - 初始变换和表面信息
   */
  addTextTransform(textId: string, options: Record<string, any> = {}) {
    const {
      surfaceType = 'plane',  // 'plane' | 'cylinder'
      surfaceId = null,       // 关联的表面 ID
      initialTransform = null
    } = options
    
    Vue.set(state.texts, textId, {
      ...createDefaultTransform(),
      ...initialTransform,
      // 文字特有属性
      surfaceType,
      surfaceId,
      visible: true,
      locked: false,
      // 圆柱面文字的额外参数
      ...(surfaceType === 'cylinder' ? {
        arcAngle: 90,      // 弧度范围（度）
        curveSegments: 20  // 曲线分段数
      } : {})
    })
  },
  
  /**
   * 移除文字变换
   */
  removeTextTransform(textId) {
    Vue.delete(state.texts, textId)
    if (state.activeTarget === textId) {
      state.activeTarget = null
    }
  },
  
  /**
   * 更新文字的表面参数（圆柱面专用）
   */
  updateTextSurfaceParams(textId, params) {
    const textTransform = state.texts[textId]
    if (!textTransform) return
    
    if (params.arcAngle !== undefined) {
      textTransform.arcAngle = params.arcAngle
    }
    if (params.curveSegments !== undefined) {
      textTransform.curveSegments = params.curveSegments
    }
  },
  
  // --- 锁定/解锁 ---
  toggleLock(target) {
    const targetObj = this._getTargetObject(target)
    if (targetObj && 'locked' in targetObj) {
      targetObj.locked = !targetObj.locked
    }
  },
  
  // --- 可见性 ---
  toggleVisibility(target) {
    const targetObj = this._getTargetObject(target)
    if (targetObj && 'visible' in targetObj) {
      targetObj.visible = !targetObj.visible
    }
  },
  
  // --- 重置变换 ---
  resetTransform(target) {
    const targetObj = this._getTargetObject(target)
    if (!targetObj || targetObj.locked) return
    
    const defaults = createDefaultTransform()
    targetObj.position = { ...defaults.position }
    targetObj.rotation = { ...defaults.rotation }
    targetObj.scale = { ...defaults.scale }
  },
  
  // --- 导出用：获取完整变换数据 ---
  getExportData() {
    return {
      scene: { ...state.scene },
      mainModel: {
        position: { ...state.mainModel.position },
        rotation: { ...state.mainModel.rotation },
        scale: { ...state.mainModel.scale }
      },
      base: {
        position: { ...state.base.position },
        rotation: { ...state.base.rotation },
        scale: { ...state.base.scale }
      },
      texts: Object.fromEntries(
        Object.entries(state.texts).map(([id, t]) => [id, {
          position: { ...t.position },
          rotation: { ...t.rotation },
          scale: { ...t.scale },
          surfaceType: t.surfaceType,
          surfaceId: t.surfaceId,
          ...(t.surfaceType === 'cylinder' ? {
            arcAngle: t.arcAngle,
            curveSegments: t.curveSegments
          } : {})
        }])
      )
    }
  },
  
  // --- 从数据恢复 ---
  loadFromData(data) {
    if (data.scene) {
      Object.assign(state.scene, data.scene)
    }
    if (data.mainModel) {
      Object.assign(state.mainModel, data.mainModel)
    }
    if (data.base) {
      Object.assign(state.base, data.base)
    }
    if (data.texts) {
      state.texts = {}
      Object.entries(data.texts).forEach(([id, transform]) => {
        Vue.set(state.texts, id, {
          ...createDefaultTransform(),
          ...(transform as any),
          visible: true,
          locked: false
        })
      })
    }
  },
  
  // --- 内部方法 ---
  _getTargetObject(target) {
    if (target === 'scene') return state.scene
    if (target === 'mainModel') return state.mainModel
    if (target === 'base') return state.base
    return state.texts[target]
  }
}

// ==================== 导出 ====================
export const useTransformStore = () => ({
  state,
  ...getters,
  ...actions
})

export { state, getters, actions, createDefaultTransform }

export default { state, getters, actions, useTransformStore }
