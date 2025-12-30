/**
 * 编辑器状态管理
 * 兼容 Vue 2.6+ 的轻量级状态管理
 */
import Vue from 'vue'

// ==================== 1. 核心状态 ====================
const state = Vue.observable({
  // 功能区状态
  currentFeature: 'base', // 'base' | 'ornament' | 'text' | 'adjust'
  
  // 功能菜单状态
  menuVisible: true,
  menuItems: [],
  menuLoading: false,
  menuKeyword: '',
  
  // 选中状态
  selectedTextObject: null,
  selectedBaseObject: null,
  selectedObject: null, // 通用选中对象
  
  // 文字列表
  textList: [],
  textCounter: 0,
  
  // 撤销重做栈
  undoStack: [],
  redoStack: [],
  maxHistorySize: 50,
  
  // 工作区引用（用于调用 3D 操作）
  workspaceRef: null,
  
  // ========== 浮动 UI 状态 ==========
  // 右键菜单
  contextMenu: {
    visible: false,
    x: 0,
    y: 0,
    target: null,      // 右键点击的目标对象
    targetType: null,  // 'text' | 'object' | 'surface' | 'empty'
    items: []          // 菜单项
  },
  
  // 颜色选择器
  colorPicker: {
    visible: false,
    x: 0,
    y: 0,
    target: null,      // 要修改颜色的对象
    currentColor: '#ffffff'
  },
  
  // 编辑菜单（选中物体时显示）
  editMenu: {
    visible: false,
    x: 0,
    y: 0,
    target: null
  },
  
  // 工具提示
  tooltip: {
    visible: false,
    x: 0,
    y: 0,
    content: ''
  }
})

// ==================== 2. Getters ====================
const getters = {
  // 功能菜单是否显示
  shouldShowMenu: () => state.currentFeature === 'base' && state.menuVisible,
  
  // 是否可撤销/重做
  canUndo: () => state.undoStack.length > 0,
  canRedo: () => state.redoStack.length > 0,
  
  // 是否有选中文字
  hasSelectedText: () => !!state.selectedTextObject,
  
  // 当前选中文字的显示名
  selectedTextName: () => {
    if (!state.selectedTextObject) return ''
    const item = state.textList.find(t => t.id === state.selectedTextObject.id)
    return item?.displayName || ''
  },
  
  // 选中文字是否在圆柱面上
  isSelectedTextOnCylinder: () => {
    return state.selectedTextObject?.mesh?.userData?.surfaceType === 'cylinder'
  }
}

// ==================== 3. Actions ====================
const actions = {
  // --- 初始化 ---
  setWorkspaceRef(ref) {
    state.workspaceRef = ref
  },
  
  // --- 功能区 ---
  setFeature(feature) {
    console.log('🔥 store.setFeature:', feature)
    state.currentFeature = feature
    // 只有底座显示菜单
    state.menuVisible = feature === 'base'
  },
  
  // --- 功能菜单 ---
  setMenuVisible(visible) {
    state.menuVisible = visible
  },
  
  setMenuItems(items) {
    state.menuItems = items
  },
  
  setMenuLoading(loading) {
    state.menuLoading = loading
  },
  
  setMenuKeyword(keyword) {
    state.menuKeyword = keyword
  },
  
  // --- 文字管理 ---
  addText(textObject) {
    state.textCounter++
    const displayName = `文字${state.textCounter}`
    state.textList.push({
      id: textObject.id,
      content: textObject.content,
      displayName
    })
    
    this._pushHistory({
      type: 'TEXT_ADD',
      payload: { id: textObject.id, content: textObject.content, displayName }
    })
  },
  
  removeText(textId) {
    const index = state.textList.findIndex(t => t.id === textId)
    if (index !== -1) {
      const removed = state.textList.splice(index, 1)[0]
      this._pushHistory({
        type: 'TEXT_REMOVE',
        payload: { ...removed, index }
      })
    }
    
    if (state.selectedTextObject?.id === textId) {
      state.selectedTextObject = null
    }
  },
  
  selectText(textObject) {
    state.selectedTextObject = textObject
  },
  
  deselectText() {
    state.selectedTextObject = null
  },
  
  updateTextInList(textId, content) {
    const item = state.textList.find(t => t.id === textId)
    if (item) {
      const oldContent = item.content
      item.content = content
      this._pushHistory({
        type: 'TEXT_UPDATE',
        payload: { textId, from: oldContent, to: content }
      })
    }
  },
  
  // ========== 浮动 UI 操作 ==========
  
  // --- 右键菜单 ---
  showContextMenu({ x, y, target, targetType }) {
    // 先关闭其他浮动 UI
    this.hideAllFloatingUI()
    
    // 根据目标类型生成菜单项
    const items = this._getContextMenuItems(targetType, target)
    
    state.contextMenu = {
      visible: true,
      x,
      y,
      target,
      targetType,
      items
    }
  },
  
  hideContextMenu() {
    state.contextMenu.visible = false
    state.contextMenu.target = null
  },
  
  _getContextMenuItems(targetType, target) {
    const baseItems = [
      { key: 'resetView', label: '重置视图', icon: 'el-icon-refresh' }
    ]
    
    switch (targetType) {
      case 'text':
        return [
          { key: 'editText', label: '编辑文字', icon: 'el-icon-edit' },
          { key: 'changeColor', label: '修改颜色', icon: 'el-icon-brush' },
          { key: 'duplicate', label: '复制', icon: 'el-icon-copy-document' },
          { key: 'delete', label: '删除', icon: 'el-icon-delete', danger: true },
          { divider: true },
          ...baseItems
        ]
      case 'object':
        return [
          { key: 'select', label: '选中', icon: 'el-icon-aim' },
          { key: 'changeColor', label: '修改颜色', icon: 'el-icon-brush' },
          { key: 'hide', label: '隐藏', icon: 'el-icon-view' },
          { divider: true },
          ...baseItems
        ]
      case 'surface':
        return [
          { key: 'addText', label: '添加文字', icon: 'el-icon-edit-outline' },
          { key: 'changeColor', label: '修改表面颜色', icon: 'el-icon-brush' },
          { divider: true },
          ...baseItems
        ]
      default: // empty
        return baseItems
    }
  },
  
  // --- 颜色选择器 ---
  showColorPicker({ x, y, target, currentColor }) {
    this.hideAllFloatingUI()
    state.colorPicker = {
      visible: true,
      x,
      y,
      target,
      currentColor: currentColor || '#ffffff'
    }
  },
  
  hideColorPicker() {
    state.colorPicker.visible = false
    state.colorPicker.target = null
  },
  
  setPickerColor(color) {
    state.colorPicker.currentColor = color
  },
  
  // --- 编辑菜单 ---
  showEditMenu({ x, y, target }) {
    this.hideAllFloatingUI()
    state.editMenu = {
      visible: true,
      x,
      y,
      target
    }
  },
  
  hideEditMenu() {
    state.editMenu.visible = false
    state.editMenu.target = null
  },
  
  // --- 工具提示 ---
  showTooltip({ x, y, content }) {
    state.tooltip = { visible: true, x, y, content }
  },
  
  hideTooltip() {
    state.tooltip.visible = false
  },
  
  // --- 关闭所有浮动 UI ---
  hideAllFloatingUI() {
    state.contextMenu.visible = false
    state.colorPicker.visible = false
    state.editMenu.visible = false
    state.tooltip.visible = false
  },
  
  // --- 撤销重做 ---
  _pushHistory(action) {
    state.undoStack.push(action)
    state.redoStack = []
    if (state.undoStack.length > state.maxHistorySize) {
      state.undoStack.shift()
    }
  },
  
  undo() {
    if (state.undoStack.length === 0) return null
    const action = state.undoStack.pop()
    state.redoStack.push(action)
    return action
  },
  
  redo() {
    if (state.redoStack.length === 0) return null
    const action = state.redoStack.pop()
    state.undoStack.push(action)
    return action
  },
  
  // --- 重置 ---
  reset() {
    state.currentFeature = 'base'
    state.menuVisible = true
    state.menuItems = []
    state.selectedTextObject = null
    state.textList = []
    state.textCounter = 0
    state.undoStack = []
    state.redoStack = []
  }
}

// ==================== 4. 导出 ====================
export const useEditorStore = () => ({
  state,
  ...getters,
  ...actions
})

// 直接导出 state 和 actions，方便在 Options API 中使用
export { state, getters, actions }

export default { state, getters, actions, useEditorStore }
