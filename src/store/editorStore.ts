/**
 * 缂栬緫鍣ㄧ姸鎬佺鐞? * 鍏煎 Vue 2.6+ 鐨勮交閲忕骇鐘舵€佺鐞? */
import Vue from 'vue';
type StoreEntity = {
  id: string;
  type?: string;
  content?: unknown;
  displayName?: string;
  meta?: {
    displayName?: string;
  };
  [key: string]: unknown;
};

const state = Vue.observable({
  currentFeature: 'base',
  viewMode: 'result', // 'result' | 'construct'
  viewModeBusy: false,

  menuVisible: true,
  menuItems: [],
  menuLoading: false,
  menuKeyword: '',

  selectedTextObject: null,
  selectedObject: null,

  entityMap: {},

  history: {
    undoCount: 0,
    redoCount: 0,
    canUndo: false,
    canRedo: false,
    isBusy: false,
    isApplying: false,
    transactionName: null,
    lastError: null,
  },

  workspaceRef: null,

  contextMenu: {
    visible: false,
    x: 0,
    y: 0,
    target: null,
    targetType: null, // 'text' | 'object' | 'surface' | 'empty'
    items: [],
  },

  colorPicker: {
    visible: false,
    x: 0,
    y: 0,
    target: null,
    currentColor: '#ffffff',
  },

  editMenu: {
    visible: false,
    x: 0,
    y: 0,
    target: null,
  },

  tooltip: {
    visible: false,
    x: 0,
    y: 0,
    content: '',
  },
});

const normalizeEntityForStore = (entity: any) => {
  if (!entity || !entity.id) return null;
  return { ...entity };
};

const buildTextList = () => {
  const entities = Object.values(state.entityMap as Record<string, StoreEntity>);
  const texts = entities.filter((entity) => entity?.type === 'text');
  return texts.map((entity, index) => {
    const content = typeof entity.content === 'string' ? entity.content : '';
    const displayName = entity.displayName || entity.meta?.displayName || `鏂囧瓧${index + 1}`;
    return { id: entity.id, content, displayName };
  });
};

// ==================== Getters ====================
const getters = {
  shouldShowMenu: () => state.currentFeature === 'base' && state.menuVisible,
  canUndo: () => state.history.canUndo,
  canRedo: () => state.history.canRedo,
  isHistoryBusy: () => state.history.isBusy,
  isHistoryApplying: () => state.history.isApplying,
  selectedTextName: () => {
    if (!state.selectedTextObject) return '';
    const item = buildTextList().find((t) => t.id === state.selectedTextObject.id);
    return item?.displayName || '';
  },
  isSelectedTextOnCylinder: () => {
    return state.selectedTextObject?.mesh?.userData?.surfaceType === 'cylinder';
  },
  getTextList: () => buildTextList(),
};

// ==================== Actions ====================
const actions = {
  getCore() {
    return state.workspaceRef?.value?.getCore?.() || null;
  },

  setWorkspaceRef(ref: any) {
    state.workspaceRef = ref || null;
  },

  setHistorySnapshot(snapshot: Record<string, any> | null) {
    if (!snapshot) return;
    Object.assign(state.history, snapshot);
  },

  setFeature(key: string) {
    state.currentFeature = key;
  },

  setMenuItems(items: any[]) {
    state.menuItems = Array.isArray(items) ? items : [];
  },

  setMenuLoading(loading: boolean) {
    state.menuLoading = !!loading;
  },

  setMenuKeyword(keyword: string) {
    state.menuKeyword = keyword || '';
  },

  selectObject(object: any) {
    state.selectedObject = object || null;
  },

  deselectObject() {
    state.selectedObject = null;
  },

  selectText(textObject: any) {
    state.selectedTextObject = textObject || null;
  },

  deselectText() {
    state.selectedTextObject = null;
  },

  showContextMenu({ x, y, target, targetType }: Record<string, any>) {
    this.hideAllFloatingUI();
    const items = this._getContextMenuItems(targetType, target);
    state.contextMenu = {
      visible: true,
      x,
      y,
      target,
      targetType,
      items,
    };
  },

  hideContextMenu() {
    state.contextMenu.visible = false;
    state.contextMenu.target = null;
  },

  _getContextMenuItems(targetType: string, target: any) {
    const baseItems = [{ key: 'resetView', label: '閲嶇疆瑙嗗浘', icon: 'el-icon-refresh' }];

    switch (targetType) {
      case 'text':
        return [
          { key: 'editText', label: '缂栬緫鏂囧瓧', icon: 'el-icon-edit' },
          { key: 'changeColor', label: '淇敼棰滆壊', icon: 'el-icon-brush' },
          { key: 'duplicate', label: '澶嶅埗', icon: 'el-icon-copy-document' },
          { key: 'delete', label: '鍒犻櫎', icon: 'el-icon-delete', danger: true },
          { divider: true },
          ...baseItems,
        ];
      case 'object':
        return [
          { key: 'select', label: '閫変腑', icon: 'el-icon-aim' },
          { key: 'changeColor', label: '淇敼棰滆壊', icon: 'el-icon-brush' },
          { key: 'hide', label: '闅愯棌', icon: 'el-icon-view' },
          { divider: true },
          ...baseItems,
        ];
      case 'surface':
        return [
          { key: 'addText', label: '娣诲姞鏂囧瓧', icon: 'el-icon-edit-outline' },
          { key: 'changeColor', label: '淇敼琛ㄩ潰棰滆壊', icon: 'el-icon-brush' },
          { divider: true },
          ...baseItems,
        ];
      default:
        return baseItems;
    }
  },

  showColorPicker({ x, y, target, currentColor }: Record<string, any>) {
    this.hideAllFloatingUI();
    state.colorPicker = {
      visible: true,
      x,
      y,
      target,
      currentColor: currentColor || '#ffffff',
    };
  },

  hideColorPicker() {
    state.colorPicker.visible = false;
    state.colorPicker.target = null;
  },

  setPickerColor(color: string) {
    state.colorPicker.currentColor = color;
  },

  showEditMenu({ x, y, target }: Record<string, any>) {
    this.hideAllFloatingUI();
    state.editMenu = {
      visible: true,
      x,
      y,
      target,
    };
  },

  hideEditMenu() {
    state.editMenu.visible = false;
    state.editMenu.target = null;
  },

  showTooltip({ x, y, content }: Record<string, any>) {
    state.tooltip = { visible: true, x, y, content };
  },

  hideTooltip() {
    state.tooltip.visible = false;
  },

  hideAllFloatingUI() {
    state.contextMenu.visible = false;
    state.colorPicker.visible = false;
    state.editMenu.visible = false;
    state.tooltip.visible = false;
  },

  async setViewMode(mode: 'construct' | 'result', options: Record<string, any> = {}) {
    if (!mode) return;
    if (state.viewModeBusy) return;
    if (state.viewMode === mode && !options.force) return;

    state.viewModeBusy = true;
    try {
      const core = this.getCore();
      if (core?.setViewMode) {
        await core.setViewMode(mode);
      }
      state.viewMode = mode;
    } finally {
      state.viewModeBusy = false;
    }
  },

  async toggleViewMode() {
    const next = state.viewMode === 'result' ? 'construct' : 'result';
    await this.setViewMode(next);
  },

  async executeCommand(command: any) {
    const core = this.getCore();
    if (core?.executeCommand) {
      return await core.executeCommand(command);
    }
    return await command?.execute?.();
  },

  async undo() {
    const core = this.getCore();
    return await core?.undo?.();
  },

  async redo() {
    const core = this.getCore();
    return await core?.redo?.();
  },

  async addEntity(entity: any, options: Record<string, any> = {}) {
    const core = this.getCore();
    if (!core?.addEntity) throw new Error('EditorCore not ready');
    return await core.addEntity(entity, options);
  },

  async updateEntity(
    id: string,
    patch: Record<string, any> = {},
    options: Record<string, any> = {}
  ) {
    const core = this.getCore();
    if (!core?.updateEntity) throw new Error('EditorCore not ready');
    return await core.updateEntity(id, patch, options);
  },

  async delEntity(id: string, options: Record<string, any> = {}) {
    const core = this.getCore();
    if (!core?.delEntity) throw new Error('EditorCore not ready');
    return await core.delEntity(id, options);
  },

  resetEntities() {
    state.entityMap = {};
  },

  syncEntityAdded(payload: Record<string, any> = {}) {
    const entity = payload.entity;
    if (!entity) return;
    this._upsertEntity(entity);
  },

  syncEntityUpdated(payload: Record<string, any> = {}) {
    const entity = payload.entity;
    const id = payload.id || payload.key || entity?.id;
    if (entity) {
      this._upsertEntity(entity);
      return;
    }
    if (!id) return;
    const current = state.entityMap[id] || { id };
    const next = { ...current, ...(payload.patch || {}) };
    this._upsertEntity(next);
  },

  syncEntityRemoved(payload: Record<string, any> = {}) {
    const id = payload.id || payload.key || payload.entity?.id;
    if (!id) return;
    this._removeEntityById(id);
  },

  _upsertEntity(entity: any) {
    const normalized = normalizeEntityForStore(entity);
    if (!normalized) return;
    Vue.set(state.entityMap, normalized.id, normalized);
  },

  _removeEntityById(id: string) {
    Vue.delete(state.entityMap, id);
    if (state.selectedTextObject?.id === id) {
      state.selectedTextObject = null;
    }
  },
};

// ==================== 瀵煎嚭 ====================
export const useEditorStore = () => ({
  state,
  ...getters,
  ...actions,
});

export { state, getters, actions };

export default { state, getters, actions, useEditorStore };
