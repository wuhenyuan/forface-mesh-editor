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

// 导出任务和布尔任务共用这一份最小状态结构。
// 布尔链路中的 progress / detail 会一路从 worker 透传到这里，再由 UI 决定如何展示。
const createTaskState = () => ({
  active: false,
  taskId: null,
  phase: '',
  progress: 0,
  message: '',
  currentFile: '',
  cacheHit: null,
  error: '',
  detail: null,
});

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

  exportTask: createTaskState(),
  // booleanTask 是布尔链路在 store 里的唯一真相源。
  // 无论任务来自 surfaceText 还是模型 CSG，最后都会收敛到这份状态。
  booleanTask: createTaskState(),

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

// 规范化实体数据，保证 store 内部至少拿到带 id 的对象副本。
const normalizeEntityForStore = (entity: any) => {
  if (!entity || !entity.id) return null;
  return { ...entity };
};

// 从运行时对象提取 position / rotation / scale，供属性面板和变换面板展示。
const buildTransformFromObject = (object: any) => {
  if (!object) return null;
  return {
    position: [object.position?.x || 0, object.position?.y || 0, object.position?.z || 0],
    rotation: [object.rotation?.x || 0, object.rotation?.y || 0, object.rotation?.z || 0],
    scale: [object.scale?.x || 1, object.scale?.y || 1, object.scale?.z || 1],
  };
};

// 优先从 entityKey 识别实体，兼容旧链路里仍然使用 textId 的对象。
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

// 判断一个运行时对象是否应按“文字对象”参与当前选择逻辑。
const isTextSelectionObject = (object: any) => {
  return (
    object?.userData?.type === 'text' ||
    object?.userData?.isText === true ||
    object?.userData?.isTextObject === true ||
    object?.userData?.isTextEntityObject === true
  );
};

// 归一化外部传入的变换数据，避免缺字段或数组长度不稳定。
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

// 从实体表中生成文字列表，供文字面板等 UI 直接消费。
const buildTextList = () => {
  const entities = Object.values(state.entityMap as Record<string, StoreEntity>);
  const texts = entities.filter((entity) => entity?.type === 'text');
  return texts.map((entity, index) => {
    const content = typeof entity.content === 'string' ? entity.content : '';
    const displayName = entity.displayName || entity.meta?.displayName || `鏂囧瓧${index + 1}`;
    return { id: entity.id, content, displayName };
  });
};

// 生成实体显示名，优先使用实体或 meta 中已有的名称。
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

// 为实体生成一段简短摘要，用于列表和悬浮信息展示。
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

// 把原始实体表转换成 UI 友好的实体列表。
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

// 按 id 在当前实体列表中查找实体。
const findEntityById = (id?: string | null) => {
  if (!id) return null;
  return buildEntityList().find((entity) => entity.id === id) || null;
};

// 获取当前“选中的运行时对象”，并校验它是否仍和选中的实体一致。
const getSelectedRuntimeObject = () => {
  if (!state.selectedEntityId || !state.selectedObject) return null;
  return resolveEntityIdFromObject(state.selectedObject) === state.selectedEntityId
    ? state.selectedObject
    : null;
};

// 获取当前“选中的运行时文字对象”。
const getSelectedRuntimeText = () => {
  if (!state.selectedEntityId || !state.selectedTextObject) return null;
  return state.selectedTextObject.id === state.selectedEntityId ? state.selectedTextObject : null;
};

// ==================== Getters ====================
const getters = {
  // 判断主菜单当前是否应该显示。
  shouldShowMenu: () => state.currentFeature === 'base' && state.menuVisible,
  // 读取是否可撤销。
  canUndo: () => state.history.canUndo,
  // 读取是否可重做。
  canRedo: () => state.history.canRedo,
  // 读取历史系统是否忙碌。
  isHistoryBusy: () => state.history.isBusy,
  // 读取历史系统是否正在应用记录。
  isHistoryApplying: () => state.history.isApplying,
  // 返回当前选中的实体 id。
  selectedEntityId: () => state.selectedEntityId,
  // 返回当前选中的实体信息。
  selectedEntity: () => findEntityById(state.selectedEntityId),
  // 返回当前选中的运行时模型对象。
  selectedRuntimeObject: () => getSelectedRuntimeObject(),
  // 返回当前选中的运行时文字对象。
  selectedRuntimeText: () => getSelectedRuntimeText(),
  // 返回当前选中文字的显示名。
  selectedTextName: () => {
    const item = findEntityById(state.selectedEntityId);
    return item?.displayName || '';
  },
  // 判断当前选中的文字是否位于圆柱面上。
  isSelectedTextOnCylinder: () => getSelectedRuntimeText()?.mesh?.userData?.surfaceType === 'cylinder',
  // 返回完整实体列表。
  getEntityList: () => buildEntityList(),
  // 返回仅包含文字实体的列表。
  getTextList: () =>
    buildEntityList()
      .filter((entity) => entity?.type === 'text')
      .map((entity) => ({
        id: entity.id,
        content: typeof entity.content === 'string' ? entity.content : '',
        displayName: entity.displayName,
      })),
  activeTaskState: () => {
    // UI 只消费一个“当前活跃任务”视图：
    // 优先显示正在执行的任务，其次才显示最近一次出错的任务。
    if (state.exportTask.active) {
      return {
        ...state.exportTask,
        type: 'export',
      };
    }
    if (state.booleanTask.active) {
      return {
        ...state.booleanTask,
        type: 'boolean',
      };
    }
    if (state.exportTask.error) {
      return {
        ...state.exportTask,
        type: 'export',
      };
    }
    if (state.booleanTask.error) {
      return {
        ...state.booleanTask,
        type: 'boolean',
      };
    }
    return null;
  },
};

// ==================== Actions ====================
const actions = {
  // 读取当前已挂载的 EditorCore 实例。
  getCore() {
    return state.workspaceRef?.value?.getCore?.() || null;
  },

  // 记录工作区引用，供 action 间接访问 core。
  setWorkspaceRef(ref: any) {
    state.workspaceRef = ref || null;
  },

  // 用最新历史快照刷新 store 中的历史状态。
  setHistorySnapshot(snapshot: Record<string, any> | null) {
    if (!snapshot) return;
    Object.assign(state.history, snapshot);
  },

  // 重置指定任务状态。
  _resetTaskState(target: 'exportTask' | 'booleanTask') {
    Object.assign(state[target], createTaskState());
  },

  _applyTaskProgress(target: 'exportTask' | 'booleanTask', payload: Record<string, any> = {}) {
    // 无论 payload 来自 worker 真进度，还是 bridge 补出来的模拟进度，
    // 到 store 以后都统一归一成同一份结构，避免组件层理解多套协议。
    const detail = payload?.detail && typeof payload.detail === 'object' ? payload.detail : null;
    const progress =
      typeof payload.progress === 'number' && Number.isFinite(payload.progress)
        ? Math.max(0, Math.min(payload.progress, 1))
        : 0;

    Object.assign(state[target], {
      active: progress < 1,
      taskId: typeof payload.taskId === 'string' ? payload.taskId : state[target].taskId,
      phase: typeof payload.phase === 'string' ? payload.phase : state[target].phase,
      progress,
      message: typeof payload.message === 'string' ? payload.message : '',
      currentFile:
        typeof detail?.currentFile === 'string' ? detail.currentFile : state[target].currentFile,
      cacheHit:
        typeof detail?.cacheHit === 'boolean' ? detail.cacheHit : state[target].cacheHit,
      error: '',
      detail,
    });
  },

  // 把错误信息写入指定任务状态。
  _applyTaskError(target: 'exportTask' | 'booleanTask', payload: Record<string, any> = {}) {
    const message =
      typeof payload.error === 'string'
        ? payload.error
        : typeof payload.error?.message === 'string'
          ? payload.error.message
          : 'Task failed';

    Object.assign(state[target], {
      active: false,
      error: message,
    });
  },

  // 同步导出任务进度。
  syncExportProgress(payload: Record<string, any> = {}) {
    this._applyTaskProgress('exportTask', payload);
  },

  // 同步导出任务错误。
  syncExportError(payload: Record<string, any> = {}) {
    this._applyTaskError('exportTask', payload);
  },

  // 清空导出任务状态。
  clearExportTask() {
    this._resetTaskState('exportTask');
  },

  syncBooleanProgress(payload: Record<string, any> = {}) {
    // 布尔事件在事件总线层不做二次加工，直接写入 booleanTask，
    // 这样进度条看到的就是 worker 当前阶段的原始状态。
    this._applyTaskProgress('booleanTask', payload);
  },

  syncBooleanError(payload: Record<string, any> = {}) {
    // 错误也与进度走同一条链路，方便 UI 统一从 activeTaskState 派生展示。
    this._applyTaskError('booleanTask', payload);
  },

  // 清空布尔任务状态。
  clearBooleanTask() {
    this._resetTaskState('booleanTask');
  },

  // 切换当前功能页签。
  setFeature(key: string) {
    state.currentFeature = key;
  },

  // 更新菜单项列表。
  setMenuItems(items: any[]) {
    state.menuItems = Array.isArray(items) ? items : [];
  },

  // 更新菜单加载状态。
  setMenuLoading(loading: boolean) {
    state.menuLoading = !!loading;
  },

  // 更新菜单搜索关键字。
  setMenuKeyword(keyword: string) {
    state.menuKeyword = keyword || '';
  },

  // 选中一个运行时对象，并同步实体选择与变换快照。
  selectObject(object: any) {
    const nextEntityId = resolveEntityIdFromObject(object);
    state.selectedObject = object || null;
    state.selectedEntityId = nextEntityId;
    state.selectedObjectTransform = buildTransformFromObject(object);
    if (!nextEntityId || state.selectedTextObject?.id !== nextEntityId || !isTextSelectionObject(object)) {
      state.selectedTextObject = null;
    }
  },

  // 取消对象选择，但尽量保留与当前文字对象一致的实体选择。
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

  // 直接设置当前选中对象的变换快照。
  setSelectedObjectTransform(transform: any) {
    state.selectedObjectTransform = normalizeTransformPayload(transform);
  },

  // 清空选中对象的变换快照。
  clearSelectedObjectTransform() {
    state.selectedObjectTransform = null;
  },

  // 从运行时对象重新同步一次变换快照。
  syncSelectedObjectTransformFromObject(object?: any) {
    const target = object || getSelectedRuntimeObject();
    state.selectedObjectTransform = buildTransformFromObject(target);
  },

  // 选中文字对象，并在需要时清除模型对象选择。
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

  // 取消文字选择，并根据当前对象选择回退实体选择。
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

  // 显示上下文菜单。
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

  // 隐藏上下文菜单。
  hideContextMenu() {
    state.contextMenu.visible = false;
    state.contextMenu.target = null;
  },

  // 根据命中目标类型生成右键菜单项。
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

  // 显示颜色选择器。
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

  // 隐藏颜色选择器。
  hideColorPicker() {
    state.colorPicker.visible = false;
    state.colorPicker.target = null;
  },

  // 更新颜色选择器当前颜色。
  setPickerColor(color: string) {
    state.colorPicker.currentColor = color;
  },

  // 显示编辑菜单。
  showEditMenu({ x, y, target }: Record<string, any>) {
    this.hideAllFloatingUI();
    state.editMenu = {
      visible: true,
      x,
      y,
      target,
    };
  },

  // 隐藏编辑菜单。
  hideEditMenu() {
    state.editMenu.visible = false;
    state.editMenu.target = null;
  },

  // 显示提示浮层。
  showTooltip({ x, y, content }: Record<string, any>) {
    state.tooltip = { visible: true, x, y, content };
  },

  // 隐藏提示浮层。
  hideTooltip() {
    state.tooltip.visible = false;
  },

  // 隐藏所有浮层类 UI。
  hideAllFloatingUI() {
    state.contextMenu.visible = false;
    state.colorPicker.visible = false;
    state.editMenu.visible = false;
    state.tooltip.visible = false;
  },

  // 切换构造态 / 结果态视图模式。
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

  // 在两种视图模式间切换。
  async toggleViewMode() {
    const next = state.viewMode === 'result' ? 'construct' : 'result';
    await this.setViewMode(next);
  },

  // 通过 core 或命令对象执行一条命令。
  async executeCommand(command: any) {
    const core = this.getCore();
    if (core?.executeCommand) {
      return await core.executeCommand(command);
    }
    return await command?.execute?.();
  },

  // 执行撤销。
  async undo() {
    const core = this.getCore();
    return await core?.undo?.();
  },

  // 执行重做。
  async redo() {
    const core = this.getCore();
    return await core?.redo?.();
  },

  // 添加实体。
  async addEntity(entity: any, options: Record<string, any> = {}) {
    const core = this.getCore();
    if (!core?.addEntity) throw new Error('EditorCore not ready');
    return await core.addEntity(entity, options);
  },

  // 更新实体。
  async updateEntity(
    id: string,
    patch: Record<string, any> = {},
    options: Record<string, any> = {}
  ) {
    const core = this.getCore();
    if (!core?.updateEntity) throw new Error('EditorCore not ready');
    return await core.updateEntity(id, patch, options);
  },

  // 删除实体。
  async delEntity(id: string, options: Record<string, any> = {}) {
    const core = this.getCore();
    if (!core?.delEntity) throw new Error('EditorCore not ready');
    return await core.delEntity(id, options);
  },

  // 清空当前实体与选择态缓存。
  resetEntities() {
    state.entityMap = {};
    state.selectedTextObject = null;
    state.selectedObject = null;
    state.selectedEntityId = null;
    state.selectedObjectTransform = null;
  },

  // 同步“实体已添加”事件到 store。
  syncEntityAdded(payload: Record<string, any> = {}) {
    const entity = payload.entity;
    if (!entity) return;
    this._upsertEntity(entity);
  },

  // 同步“实体已更新”事件到 store。
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

  // 同步“实体已删除”事件到 store。
  syncEntityRemoved(payload: Record<string, any> = {}) {
    const id = payload.id || payload.key || payload.entity?.id;
    if (!id) return;
    this._removeEntityById(id);
  },

  // 向实体表写入或覆盖一条实体记录。
  _upsertEntity(entity: any) {
    const normalized = normalizeEntityForStore(entity);
    if (!normalized) return;
    Vue.set(state.entityMap, normalized.id, normalized);
  },

  // 从实体表删除一条实体记录，并同步清理选择状态。
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
// 暴露组合式风格的 store 访问入口。
export const useEditorStore = () => ({
  state,
  ...getters,
  ...actions,
});

export { state, getters, actions };

export default { state, getters, actions, useEditorStore };
