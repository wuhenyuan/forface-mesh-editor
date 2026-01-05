/**
 * 选择状态管理器
 * 负责管理面的选择状态，支持单选和多选模式
 */
export class SelectionManager {
  selectedFaces: Map<string, any>
  selectionMode: 'single' | 'multi'
  hoverFace: any
  selectionHistory: any[]
  historyIndex: number
  maxHistorySize: number
  eventCallbacks: Map<string, any[]>

  constructor() {
    // 使用Map存储选中的面，key为面ID，value为面信息
    this.selectedFaces = new Map()
    
    // 选择模式：'single' 或 'multi'
    this.selectionMode = 'single'
    
    // 悬停的面
    this.hoverFace = null
    
    // 选择历史记录（用于撤销/重做）
    this.selectionHistory = []
    this.historyIndex = -1
    this.maxHistorySize = 50
    
    // 事件回调
    this.eventCallbacks = new Map()
  }
  
  /**
   * 添加面到选择中
   * @param {Object} faceInfo - 面信息对象
   * @param {boolean} recordHistory - 是否记录到历史
   * @returns {boolean} 是否成功添加
   */
  addFace(faceInfo: any, recordHistory: boolean = true) {
    if (!faceInfo || !faceInfo.id) {
      console.warn('无效的面信息')
      return false
    }
    
    // 记录当前状态到历史
    if (recordHistory) {
      this.recordCurrentState()
    }
    
    // 如果是单选模式，先清除之前的选择
    if (this.selectionMode === 'single') {
      this.selectedFaces.clear()
    }
    
    this.selectedFaces.set(faceInfo.id, faceInfo)
    this.emitEvent('faceAdded', faceInfo)
    this.emitEvent('selectionChanged', this.getSelectionSummary())
    
    return true
  }
  
  /**
   * 从选择中移除面
   * @param {Object} faceInfo - 面信息对象
   * @param {boolean} recordHistory - 是否记录到历史
   * @returns {boolean} 是否成功移除
   */
  removeFace(faceInfo: any, recordHistory: boolean = true) {
    if (!faceInfo || !faceInfo.id) {
      console.warn('无效的面信息')
      return false
    }
    
    if (!this.selectedFaces.has(faceInfo.id)) {
      return false
    }
    
    // 记录当前状态到历史
    if (recordHistory) {
      this.recordCurrentState()
    }
    
    const removed = this.selectedFaces.delete(faceInfo.id)
    
    if (removed) {
      this.emitEvent('faceRemoved', faceInfo)
      this.emitEvent('selectionChanged', this.getSelectionSummary())
    }
    
    return removed
  }
  
  /**
   * 清除所有选择
   * @param {boolean} recordHistory - 是否记录到历史
   */
  clearAll(recordHistory: boolean = true) {
    if (this.selectedFaces.size === 0) {
      return
    }
    
    // 记录当前状态到历史
    if (recordHistory) {
      this.recordCurrentState()
    }
    
    const clearedFaces = Array.from(this.selectedFaces.values())
    this.selectedFaces.clear()
    
    this.emitEvent('selectionCleared', clearedFaces)
    this.emitEvent('selectionChanged', this.getSelectionSummary())
  }
  
  /**
   * 检查面是否被选中
   * @param {Object} faceInfo - 面信息对象
   * @returns {boolean} 是否被选中
   */
  contains(faceInfo: any) {
    if (!faceInfo || !faceInfo.id) {
      return false
    }
    
    return this.selectedFaces.has(faceInfo.id)
  }
  
  /**
   * 获取所有选中的面
   * @returns {Object[]} 选中的面信息数组
   */
  getAll() {
    return Array.from(this.selectedFaces.values())
  }
  
  /**
   * 获取选中面的数量
   * @returns {number} 选中面的数量
   */
  getCount() {
    return this.selectedFaces.size
  }
  
  /**
   * 检查是否有选中的面
   * @returns {boolean} 是否有选择
   */
  hasSelection() {
    return this.selectedFaces.size > 0
  }
  
  /**
   * 根据面ID获取面信息
   * @param {string} faceId - 面ID
   * @returns {Object|null} 面信息对象或null
   */
  getFaceById(faceId: string) {
    return this.selectedFaces.get(faceId) || null
  }
  
  /**
   * 设置选择模式
   * @param {'single'|'multi'} mode - 选择模式
   * @param {boolean} recordHistory - 是否记录到历史
   */
  setSelectionMode(mode: any, recordHistory: boolean = true) {
    if (mode !== 'single' && mode !== 'multi') {
      console.warn('无效的选择模式，应为 "single" 或 "multi"')
      return
    }
    
    if (this.selectionMode === mode) {
      return // 模式没有变化
    }
    
    // 记录当前状态到历史
    if (recordHistory) {
      this.recordCurrentState()
    }
    
    const oldMode = this.selectionMode
    this.selectionMode = mode
    
    // 如果切换到单选模式且当前有多个选择，只保留第一个
    if (mode === 'single' && this.selectedFaces.size > 1) {
      const firstFace = this.selectedFaces.values().next().value
      this.selectedFaces.clear()
      if (firstFace) {
        this.selectedFaces.set(firstFace.id, firstFace)
      }
    }
    
    this.emitEvent('selectionModeChanged', { oldMode, newMode: mode })
    this.emitEvent('selectionChanged', this.getSelectionSummary())
  }
  
  /**
   * 获取当前选择模式
   * @returns {'single'|'multi'} 选择模式
   */
  getSelectionMode() {
    return this.selectionMode
  }
  
  /**
   * 设置单选模式
   */
  setSingleSelectMode() {
    this.setSelectionMode('single')
  }
  
  /**
   * 设置多选模式
   */
  setMultiSelectMode() {
    this.setSelectionMode('multi')
  }
  
  /**
   * 设置悬停的面
   * @param {Object|null} faceInfo - 面信息对象或null
   */
  setHoverFace(faceInfo: any) {
    this.hoverFace = faceInfo
  }
  
  /**
   * 获取悬停的面
   * @returns {Object|null} 面信息对象或null
   */
  getHoverFace() {
    return this.hoverFace
  }
  
  /**
   * 清除悬停状态
   */
  clearHover() {
    this.hoverFace = null
  }
  
  /**
   * 切换面的选择状态
   * @param {Object} faceInfo - 面信息对象
   * @param {boolean} recordHistory - 是否记录到历史
   * @returns {boolean} 切换后的选择状态（true为选中，false为未选中）
   */
  toggleFace(faceInfo, recordHistory = true) {
    if (!faceInfo || !faceInfo.id) {
      console.warn('无效的面信息')
      return false
    }
    
    if (this.contains(faceInfo)) {
      this.removeFace(faceInfo, recordHistory)
      return false
    } else {
      this.addFace(faceInfo, recordHistory)
      return true
    }
  }
  
  /**
   * 批量添加面到选择中
   * @param {Object[]} faceInfos - 面信息对象数组
   * @param {boolean} recordHistory - 是否记录到历史
   * @returns {number} 成功添加的数量
   */
  addMultipleFaces(faceInfos, recordHistory = true) {
    if (!Array.isArray(faceInfos) || faceInfos.length === 0) {
      return 0
    }
    
    // 记录当前状态到历史
    if (recordHistory) {
      this.recordCurrentState()
    }
    
    let addedCount = 0
    
    // 如果是单选模式，只添加第一个
    if (this.selectionMode === 'single') {
      if (faceInfos[0] && faceInfos[0].id) {
        this.selectedFaces.clear()
        this.selectedFaces.set(faceInfos[0].id, faceInfos[0])
        addedCount = 1
      }
    } else {
      // 多选模式，添加所有有效的面
      faceInfos.forEach(faceInfo => {
        if (faceInfo && faceInfo.id) {
          this.selectedFaces.set(faceInfo.id, faceInfo)
          addedCount++
        }
      })
    }
    
    if (addedCount > 0) {
      this.emitEvent('multipleFacesAdded', faceInfos.slice(0, addedCount))
      this.emitEvent('selectionChanged', this.getSelectionSummary())
    }
    
    return addedCount
  }
  
  /**
   * 批量移除面从选择中
   * @param {Object[]} faceInfos - 面信息对象数组
   * @param {boolean} recordHistory - 是否记录到历史
   * @returns {number} 成功移除的数量
   */
  removeMultipleFaces(faceInfos, recordHistory = true) {
    if (!Array.isArray(faceInfos) || faceInfos.length === 0) {
      return 0
    }
    
    // 记录当前状态到历史
    if (recordHistory) {
      this.recordCurrentState()
    }
    
    let removedCount = 0
    const removedFaces = []
    
    faceInfos.forEach(faceInfo => {
      if (faceInfo && faceInfo.id && this.selectedFaces.has(faceInfo.id)) {
        this.selectedFaces.delete(faceInfo.id)
        removedFaces.push(faceInfo)
        removedCount++
      }
    })
    
    if (removedCount > 0) {
      this.emitEvent('multipleFacesRemoved', removedFaces)
      this.emitEvent('selectionChanged', this.getSelectionSummary())
    }
    
    return removedCount
  }
  
  /**
   * 获取选择状态的摘要信息
   * @returns {Object} 状态摘要
   */
  getSelectionSummary() {
    return {
      count: this.getCount(),
      mode: this.selectionMode,
      hasSelection: this.hasSelection(),
      hasHover: this.hoverFace !== null,
      faceIds: Array.from(this.selectedFaces.keys())
    }
  }
  
  /**
   * 验证选择状态的一致性
   * @returns {boolean} 状态是否一致
   */
  validateState() {
    // 检查单选模式下是否只有一个选择
    if (this.selectionMode === 'single' && this.selectedFaces.size > 1) {
      console.warn('单选模式下存在多个选择')
      return false
    }
    
    // 检查所有选中的面是否有有效的ID
    for (const [id, faceInfo] of this.selectedFaces) {
      if (!faceInfo.id || faceInfo.id !== id) {
        console.warn('选择状态不一致：面ID不匹配')
        return false
      }
    }
    
    return true
  }
  
  /**
   * 记录当前选择状态到历史
   */
  recordCurrentState() {
    const currentState = {
      selectedFaces: new Map(this.selectedFaces),
      selectionMode: this.selectionMode,
      timestamp: Date.now()
    }
    
    // 移除当前索引之后的历史记录
    this.selectionHistory = this.selectionHistory.slice(0, this.historyIndex + 1)
    
    // 添加新状态
    this.selectionHistory.push(currentState)
    this.historyIndex++
    
    // 限制历史记录大小
    if (this.selectionHistory.length > this.maxHistorySize) {
      this.selectionHistory.shift()
      this.historyIndex--
    }
  }
  
  /**
   * 撤销上一次操作
   * @returns {boolean} 是否成功撤销
   */
  undo() {
    if (this.historyIndex <= 0) {
      return false
    }
    
    this.historyIndex--
    const previousState = this.selectionHistory[this.historyIndex]
    
    if (previousState) {
      this.selectedFaces = new Map(previousState.selectedFaces)
      this.selectionMode = previousState.selectionMode
      
      this.emitEvent('undoPerformed', previousState)
      this.emitEvent('selectionChanged', this.getSelectionSummary())
      return true
    }
    
    return false
  }
  
  /**
   * 重做下一次操作
   * @returns {boolean} 是否成功重做
   */
  redo() {
    if (this.historyIndex >= this.selectionHistory.length - 1) {
      return false
    }
    
    this.historyIndex++
    const nextState = this.selectionHistory[this.historyIndex]
    
    if (nextState) {
      this.selectedFaces = new Map(nextState.selectedFaces)
      this.selectionMode = nextState.selectionMode
      
      this.emitEvent('redoPerformed', nextState)
      this.emitEvent('selectionChanged', this.getSelectionSummary())
      return true
    }
    
    return false
  }
  
  /**
   * 检查是否可以撤销
   * @returns {boolean} 是否可以撤销
   */
  canUndo() {
    return this.historyIndex > 0
  }
  
  /**
   * 检查是否可以重做
   * @returns {boolean} 是否可以重做
   */
  canRedo() {
    return this.historyIndex < this.selectionHistory.length - 1
  }
  
  /**
   * 清除历史记录
   */
  clearHistory() {
    this.selectionHistory = []
    this.historyIndex = -1
  }
  
  /**
   * 添加事件监听器
   * @param {string} eventName - 事件名称
   * @param {Function} callback - 回调函数
   */
  on(eventName: string, callback: (...args: any[]) => void) {
    if (!this.eventCallbacks.has(eventName)) {
      this.eventCallbacks.set(eventName, [])
    }
    this.eventCallbacks.get(eventName).push(callback)
  }
  
  /**
   * 移除事件监听器
   * @param {string} eventName - 事件名称
   * @param {Function} callback - 回调函数
   */
  off(eventName: string, callback: (...args: any[]) => void) {
    if (!this.eventCallbacks.has(eventName)) return
    
    const callbacks = this.eventCallbacks.get(eventName)
    const index = callbacks.indexOf(callback)
    if (index !== -1) {
      callbacks.splice(index, 1)
    }
  }
  
  /**
   * 发出事件
   * @param {string} eventName - 事件名称
   * @param {...any} args - 事件参数
   */
  emitEvent(eventName: string, ...args: any[]) {
    if (!this.eventCallbacks.has(eventName)) return
    
    const callbacks = this.eventCallbacks.get(eventName)
    callbacks.forEach(callback => {
      try {
        callback(...args)
      } catch (error) {
        console.error(`Error in SelectionManager event listener for ${eventName}:`, error)
      }
    })
  }
  
  /**
   * 获取选择操作的统计信息
   * @returns {Object} 统计信息
   */
  getSelectionStats() {
    const meshGroups = new Map()
    
    // 按网格分组统计
    this.selectedFaces.forEach(faceInfo => {
      const meshId = faceInfo.mesh.uuid
      if (!meshGroups.has(meshId)) {
        meshGroups.set(meshId, {
          mesh: faceInfo.mesh,
          faceCount: 0,
          totalArea: 0
        })
      }
      
      const group = meshGroups.get(meshId)
      group.faceCount++
      if (faceInfo.area) {
        group.totalArea += faceInfo.area
      }
    })
    
    return {
      totalFaces: this.selectedFaces.size,
      meshCount: meshGroups.size,
      meshGroups: Array.from(meshGroups.values()),
      selectionMode: this.selectionMode,
      hasHistory: this.selectionHistory.length > 0,
      canUndo: this.canUndo(),
      canRedo: this.canRedo()
    }
  }
}
