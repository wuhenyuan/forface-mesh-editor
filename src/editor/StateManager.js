/**
 * StateManager - 统一状态管理器
 * 作为编辑器的单一数据源（Single Source of Truth）
 * 
 * 职责：
 * 1. 维护核心数据（texts, base, model, selection）
 * 2. 提供数据变更方法
 * 3. 自动同步到 editorStore（响应式）和 Viewer（3D）
 * 4. 提供快照/恢复能力（支持撤销重做）
 */

export class StateManager {
  constructor(options = {}) {
    const { viewer = null, store = null, onChange = null } = options
    
    // 外部依赖
    this._viewer = viewer
    this._store = store
    this._onChange = onChange
    
    // 核心状态（单一数据源）
    this._state = {
      texts: new Map(),      // textId -> TextData
      base: null,            // BaseData
      model: null,           // ModelData
      selection: {
        textId: null,
        objectId: null
      }
    }
    
    // 文字计数器（用于生成 displayName）
    this._textCounter = 0
    
    // 同步锁，防止循环同步
    this._syncing = false
  }
  
  // ==================== 初始化 ====================
  
  /**
   * 设置 Viewer 引用
   */
  setViewer(viewer) {
    this._viewer = viewer
  }
  
  /**
   * 设置 Store 引用
   */
  setStore(store) {
    this._store = store
  }
  
  // ==================== 文字管理 ====================
  
  /**
   * 添加文字
   * @param {Object} textData - 文字数据
   * @returns {string} textId
   */
  addText(textData) {
    const id = textData.id || this._generateTextId()
    
    // 生成 displayName
    this._textCounter++
    const displayName = textData.displayName || `文字${this._textCounter}`
    
    const data = {
      id,
      content: textData.content || '',
      displayName,
      config: {
        font: textData.config?.font || 'helvetiker',
        size: textData.config?.size || 1,
        thickness: textData.config?.thickness || 0.1,
        color: textData.config?.color || '#333333',
        mode: textData.config?.mode || 'raised',
        ...textData.config
      },
      transform: {
        position: textData.transform?.position || [0, 0, 0],
        rotation: textData.transform?.rotation || [0, 0, 0]
      },
      featureName: textData.featureName || '',
      faceInfo: textData.faceInfo || null,
      mesh: textData.mesh || null,  // 3D 对象引用
      _raw: textData._raw || null   // 原始 textObject 引用
    }
    
    this._state.texts.set(id, data)
    this._syncToStore()
    this._notifyChange('textAdded', { textId: id, data })
    
    return id
  }
  
  /**
   * 删除文字
   * @param {string} textId
   * @returns {boolean}
   */
  removeText(textId) {
    if (!this._state.texts.has(textId)) return false
    
    const data = this._state.texts.get(textId)
    this._state.texts.delete(textId)
    
    // 如果删除的是选中的文字，清除选中状态
    if (this._state.selection.textId === textId) {
      this._state.selection.textId = null
    }
    
    this._syncToStore()
    this._notifyChange('textRemoved', { textId, data })
    
    return true
  }
  
  /**
   * 更新文字
   * @param {string} textId
   * @param {Object} changes - 要更新的字段
   * @returns {boolean}
   */
  updateText(textId, changes) {
    const data = this._state.texts.get(textId)
    if (!data) return false
    
    // 深度合并 config
    if (changes.config) {
      data.config = { ...data.config, ...changes.config }
      delete changes.config
    }
    
    // 深度合并 transform
    if (changes.transform) {
      data.transform = { ...data.transform, ...changes.transform }
      delete changes.transform
    }
    
    // 合并其他字段
    Object.assign(data, changes)
    
    this._syncToStore()
    this._notifyChange('textUpdated', { textId, changes })
    
    return true
  }
  
  /**
   * 获取单个文字数据
   * @param {string} textId
   * @returns {Object|null}
   */
  getText(textId) {
    return this._state.texts.get(textId) || null
  }
  
  /**
   * 获取所有文字数据
   * @returns {Array}
   */
  getTexts() {
    return Array.from(this._state.texts.values())
  }
  
  /**
   * 获取文字数量
   */
  getTextCount() {
    return this._state.texts.size
  }
  
  // ==================== 选择状态管理 ====================
  
  /**
   * 选中文字
   * @param {string} textId
   */
  selectText(textId) {
    if (!this._state.texts.has(textId)) return
    
    this._state.selection.textId = textId
    this._syncToStore()
    this._notifyChange('textSelected', { textId })
  }
  
  /**
   * 取消选中文字
   */
  deselectText() {
    const prevId = this._state.selection.textId
    this._state.selection.textId = null
    this._syncToStore()
    
    if (prevId) {
      this._notifyChange('textDeselected', { textId: prevId })
    }
  }
  
  /**
   * 获取选中的文字 ID
   * @returns {string|null}
   */
  getSelectedTextId() {
    return this._state.selection.textId
  }
  
  /**
   * 获取选中的文字数据
   * @returns {Object|null}
   */
  getSelectedText() {
    const id = this._state.selection.textId
    return id ? this.getText(id) : null
  }
  
  // ==================== 快照功能 ====================
  
  /**
   * 创建当前状态快照
   * @returns {Object} snapshot
   */
  createSnapshot() {
    const textsSnapshot = new Map()
    
    for (const [id, data] of this._state.texts) {
      // 深拷贝，但不包含 mesh 和 _raw（3D 对象引用）
      textsSnapshot.set(id, {
        id: data.id,
        content: data.content,
        displayName: data.displayName,
        config: { ...data.config },
        transform: {
          position: [...data.transform.position],
          rotation: [...data.transform.rotation]
        },
        featureName: data.featureName,
        faceInfo: data.faceInfo ? { ...data.faceInfo } : null
      })
    }
    
    return {
      texts: textsSnapshot,
      selection: { ...this._state.selection },
      textCounter: this._textCounter,
      timestamp: Date.now()
    }
  }
  
  /**
   * 创建单个文字的快照
   * @param {string} textId
   * @returns {Object|null}
   */
  createTextSnapshot(textId) {
    const data = this._state.texts.get(textId)
    if (!data) return null
    
    return {
      id: data.id,
      content: data.content,
      displayName: data.displayName,
      config: { ...data.config },
      transform: {
        position: [...data.transform.position],
        rotation: [...data.transform.rotation]
      },
      featureName: data.featureName,
      faceInfo: data.faceInfo ? { ...data.faceInfo } : null
    }
  }
  
  /**
   * 恢复到指定快照
   * @param {Object} snapshot
   */
  async restoreSnapshot(snapshot) {
    if (!snapshot) return
    
    // 恢复文字数据
    this._state.texts.clear()
    for (const [id, data] of snapshot.texts) {
      this._state.texts.set(id, { ...data })
    }
    
    // 恢复选择状态
    this._state.selection = { ...snapshot.selection }
    
    // 恢复计数器
    if (snapshot.textCounter !== undefined) {
      this._textCounter = snapshot.textCounter
    }
    
    // 同步到 store
    this._syncToStore()
    
    // 同步到 viewer（需要重建 3D 对象）
    await this._syncToViewer()
    
    this._notifyChange('snapshotRestored', { snapshot })
  }
  
  /**
   * 恢复单个文字
   * @param {Object} textSnapshot
   */
  async restoreText(textSnapshot) {
    if (!textSnapshot || !textSnapshot.id) return
    
    // 如果文字已存在，先删除 3D 对象
    if (this._state.texts.has(textSnapshot.id)) {
      await this._viewer?.deleteText?.(textSnapshot.id)
    }
    
    // 添加到状态
    this._state.texts.set(textSnapshot.id, { ...textSnapshot })
    
    // 重建 3D 对象
    if (this._viewer && textSnapshot.faceInfo) {
      const textObject = await this._viewer.createText?.(
        textSnapshot.content,
        textSnapshot.faceInfo
      )
      if (textObject) {
        // 应用配置
        await this._viewer.updateTextConfig?.(textSnapshot.id, textSnapshot.config)
        // 更新 mesh 引用
        const data = this._state.texts.get(textSnapshot.id)
        if (data) {
          data.mesh = textObject.mesh
          data._raw = textObject
        }
      }
    }
    
    this._syncToStore()
    this._notifyChange('textRestored', { textId: textSnapshot.id })
  }

  
  // ==================== 内部同步方法 ====================
  
  /**
   * 同步到 editorStore（响应式数据）
   * @private
   */
  _syncToStore() {
    if (this._syncing || !this._store) return
    
    this._syncing = true
    try {
      // 同步文字列表
      const textList = this.getTexts().map(t => ({
        id: t.id,
        content: t.content,
        displayName: t.displayName
      }))
      
      // 调用 store 的接收方法
      if (this._store.receiveTexts) {
        this._store.receiveTexts(textList)
      }
      
      // 同步选中状态
      if (this._store.receiveSelection) {
        this._store.receiveSelection(this._state.selection)
      }
      
      // 同步计数器
      if (this._store.receiveTextCounter) {
        this._store.receiveTextCounter(this._textCounter)
      }
    } finally {
      this._syncing = false
    }
  }
  
  /**
   * 同步到 Viewer（3D 场景）
   * 用于快照恢复时重建 3D 对象
   * @private
   */
  async _syncToViewer() {
    if (!this._viewer) return
    
    // 获取当前 viewer 中的文字
    const viewerTexts = this._viewer.getTextObjects?.() || []
    const viewerTextIds = new Set(viewerTexts.map(t => t.id))
    const stateTextIds = new Set(this._state.texts.keys())
    
    // 删除 viewer 中多余的文字
    for (const id of viewerTextIds) {
      if (!stateTextIds.has(id)) {
        await this._viewer.deleteText?.(id)
      }
    }
    
    // 创建/更新 state 中的文字
    for (const [id, data] of this._state.texts) {
      if (!viewerTextIds.has(id)) {
        // 需要创建
        if (data.faceInfo) {
          const textObject = await this._viewer.createText?.(data.content, data.faceInfo)
          if (textObject) {
            data.mesh = textObject.mesh
            data._raw = textObject
            // 应用配置
            await this._viewer.updateTextConfig?.(id, data.config)
          }
        }
      }
    }
    
    // 同步选中状态
    const selectedId = this._state.selection.textId
    if (selectedId) {
      this._viewer.selectText?.(selectedId)
    }
  }
  
  /**
   * 通知变更
   * @private
   */
  _notifyChange(type, payload) {
    if (this._onChange) {
      this._onChange(type, payload)
    }
  }
  
  /**
   * 生成文字 ID
   * @private
   */
  _generateTextId() {
    return `text_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
  
  // ==================== 辅助方法 ====================
  
  /**
   * 清空所有状态
   */
  clear() {
    this._state.texts.clear()
    this._state.base = null
    this._state.model = null
    this._state.selection = { textId: null, objectId: null }
    this._textCounter = 0
    
    this._syncToStore()
    this._notifyChange('cleared', {})
  }
  
  /**
   * 获取完整状态（用于调试）
   */
  getState() {
    return {
      texts: this.getTexts(),
      base: this._state.base,
      model: this._state.model,
      selection: { ...this._state.selection },
      textCounter: this._textCounter
    }
  }
  
  /**
   * 销毁
   */
  dispose() {
    this.clear()
    this._viewer = null
    this._store = null
    this._onChange = null
  }
}

export default StateManager
