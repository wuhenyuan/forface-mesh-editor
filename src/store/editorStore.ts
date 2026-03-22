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
  selectedEntityId: null,
  selectedObjectTransform: null,

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

const buildTransformFromObject = (object: any) => {
  if (!object) return null;
  return {
    position: [object.position?.x || 0, object.position?.y || 0, object.position?.z || 0],
    rotation: [object.rotation?.x || 0, object.rotation?.y || 0, object.rotation?.z || 0],
    scale: [object.scale?.x || 1, object.scale?.y || 1, object.scale?.z || 1],
  };
};

const resolveEntityIdFromObject = (object: any) => {
  const entityKey = object?.userData?.entityKey;
  if (typeof entityKey === 'string' && entityKey.length > 0) {
    return entityKey;
  }
  const textId = object?.userData?.textId;
  if (typeof textId === 'string' && textId.length > 0) {
    return textId;
  }
  return null;
};

const isTextSelectionObject = (object: any) => {
  return (
    object?.userData?.type === 'text' ||
    object?.userData?.isText === true ||
    object?.userData?.isTextObject === true ||
    object?.userData?.isTextEntityObject === true
  );
};

const normalizeTransformPayload = (payload: any) => {
  if (!payload || typeof payload !== 'object') return null;
  const position = Array.isArray(payload.position) ? payload.position : [0, 0, 0];
  const rotation = Array.isArray(payload.rotation) ? payload.rotation : [0, 0, 0];
  const scale = Array.isArray(payload.scale) ? payload.scale : [1, 1, 1];
  return {
    position: [...position],
    rotation: [...rotation],
    scale: [...scale],
  };
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

const getEntityDisplayName = (
  entity: StoreEntity,
  counters: { model: number; text: number }
) => {
  const directName = typeof entity.displayName === 'string' ? entity.displayName : '';
  const metaName = typeof entity.meta?.displayName === 'string' ? entity.meta.displayName : '';
  if (directName) return directName;
  if (metaName) return metaName;

  if (entity?.type === 'text') {
    counters.text += 1;
    return `Text ${counters.text}`;
  }

  counters.model += 1;
  return `Model ${counters.model}`;
};

const getEntitySummary = (entity: StoreEntity) => {
  if (entity?.type === 'text') {
    const content = typeof entity.content === 'string' ? entity.content.trim() : '';
    return content || 'Empty text';
  }

  if (typeof entity.resource === 'string' && entity.resource) {
    const segments = entity.resource.split(/[\\/]/).filter(Boolean);
    return segments[segments.length - 1] || entity.resource;
  }

  if (typeof entity.boolean === 'string' && entity.boolean) {
    return `Boolean: ${entity.boolean}`;
  }

  return 'Model entity';
};

const buildEntityList = () => {
  const entities = Object.values(state.entityMap as Record<string, StoreEntity>);
  const counters = { model: 0, text: 0 };
  return entities.map((entity) => {
    const content = typeof entity.content === 'string' ? entity.content : '';
    return {
      ...entity,
      content,
      displayName: getEntityDisplayName(entity, counters),
      typeLabel: entity?.type === 'text' ? 'Text' : 'Model',
      summary: getEntitySummary(entity),
    };
  });
};

const findEntityById = (id?: string | null) => {
  if (!id) return null;
  return buildEntityList().find((entity) => entity.id === id) || null;
};

const getSelectedRuntimeObject = () => {
  if (!state.selectedEntityId || !state.selectedObject) return null;
  return resolveEntityIdFromObject(state.selectedObject) === state.selectedEntityId
    ? state.selectedObject
    : null;
};

const getSelectedRuntimeText = () => {
  if (!state.selectedEntityId || !state.selectedTextObject) return null;
  return state.selectedTextObject.id === state.selectedEntityId ? state.selectedTextObject : null;
};

// ==================== Getters ====================
const getters = {
  shouldShowMenu: () => state.currentFeature === 'base' && state.menuVisible,
  canUndo: () => state.history.canUndo,
  canRedo: () => state.history.canRedo,
  isHistoryBusy: () => state.history.isBusy,
  isHistoryApplying: () => state.history.isApplying,
  selectedEntityId: () => state.selectedEntityId,
  selectedEntity: () => findEntityById(state.selectedEntityId),
  selectedRuntimeObject: () => getSelectedRuntimeObject(),
  selectedRuntimeText: () => getSelectedRuntimeText(),
  selectedTextName: () => {
    const item = findEntityById(state.selectedEntityId);
    return item?.displayName || '';
  },
  isSelectedTextOnCylinder: () => getSelectedRuntimeText()?.mesh?.userData?.surfaceType === 'cylinder',
  getEntityList: () => buildEntityList(),
  getTextList: () =>
    buildEntityList()
      .filter((entity) => entity?.type === 'text')
      .map((entity) => ({
        id: entity.id,
        content: typeof entity.content === 'string' ? entity.content : '',
        displayName: entity.displayName,
      })),
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
    const nextEntityId = resolveEntityIdFromObject(object);
    state.selectedObject = object || null;
    state.selectedEntityId = nextEntityId;
    state.selectedObjectTransform = buildTransformFromObject(object);
    if (!nextEntityId || state.selectedTextObject?.id !== nextEntityId || !isTextSelectionObject(object)) {
      state.selectedTextObject = null;
    }
  },

  deselectObject(object?: any) {
    const target = object || state.selectedObject;
    const targetEntityId = resolveEntityIdFromObject(target);
    state.selectedObject = null;
    state.selectedObjectTransform = null;
    const selectedRuntimeText = getSelectedRuntimeText();
    if (!selectedRuntimeText) {
      state.selectedEntityId = null;
      return;
    }
    if (!targetEntityId || selectedRuntimeText.id === targetEntityId) {
      state.selectedEntityId = selectedRuntimeText.id;
    }
  },

  setSelectedObjectTransform(transform: any) {
    state.selectedObjectTransform = normalizeTransformPayload(transform);
  },

  clearSelectedObjectTransform() {
    state.selectedObjectTransform = null;
  },

  syncSelectedObjectTransformFromObject(object?: any) {
    const target = object || getSelectedRuntimeObject();
    state.selectedObjectTransform = buildTransformFromObject(target);
  },

  selectText(textObject: any) {
    state.selectedTextObject = textObject || null;
    const nextEntityId = textObject?.id || null;
    state.selectedEntityId = nextEntityId || state.selectedEntityId || null;
    if (!nextEntityId) return;
    if (resolveEntityIdFromObject(state.selectedObject) !== nextEntityId) {
      state.selectedObject = null;
      state.selectedObjectTransform = null;
    }
  },

  deselectText(textObject?: any) {
    const targetId = textObject?.id || state.selectedTextObject?.id || null;
    state.selectedTextObject = null;
    if (!targetId) return;
    const selectedRuntimeObject = getSelectedRuntimeObject();
    if (selectedRuntimeObject) {
      const objectEntityId = resolveEntityIdFromObject(selectedRuntimeObject);
      state.selectedEntityId = objectEntityId || null;
      return;
    }
    if (state.selectedEntityId === targetId) {
      state.selectedEntityId = null;
    }
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
    state.selectedTextObject = null;
    state.selectedObject = null;
    state.selectedEntityId = null;
    state.selectedObjectTransform = null;
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
    if (state.selectedObject && resolveEntityIdFromObject(state.selectedObject) === id) {
      state.selectedObject = null;
      state.selectedObjectTransform = null;
    }
    if (state.selectedEntityId === id) {
      state.selectedEntityId = null;
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
