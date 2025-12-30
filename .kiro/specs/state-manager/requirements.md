# StateManager 统一状态管理

## 背景

当前编辑器的数据分散在三个地方：
1. `editorStore` - Vue 响应式状态（UI 绑定）
2. `EditorApp._textObjects` - 业务层文字对象列表
3. `SurfaceTextManager.textObjects` - 库层 3D 文字对象

这种分散的数据结构导致：
- 同步依赖事件机制，容易出现不一致
- 撤销/重做时需要手动同步多处数据
- Command 需要关心数据同步细节，职责不清晰

## 目标

创建 `StateManager` 作为单一数据源（Single Source of Truth），统一管理编辑器状态，简化数据流。

## 用户故事

### US-1: 统一数据源
作为开发者，我希望有一个统一的数据源管理所有编辑器状态，这样我可以避免数据不一致的问题。

**验收标准：**
- [ ] StateManager 维护 texts、base、model、selection 等核心数据
- [ ] 所有数据变更都通过 StateManager 的方法进行
- [ ] editorStore 只作为响应式数据的被动接收者
- [ ] Viewer/3D 场景只作为渲染层的被动接收者

### US-2: 快照与恢复
作为用户，我希望撤销/重做操作能够可靠地恢复状态，这样我可以放心地进行编辑操作。

**验收标准：**
- [ ] StateManager 提供 `createSnapshot()` 方法生成当前状态快照
- [ ] StateManager 提供 `restoreSnapshot(snapshot)` 方法恢复到指定快照
- [ ] 快照包含完整的可恢复数据（texts、base、selection 等）
- [ ] 恢复快照后，响应式数据和 3D 场景自动同步

### US-3: 简化 Command 实现
作为开发者，我希望 Command 只需要调用 StateManager 方法，不需要关心数据同步细节。

**验收标准：**
- [ ] TextCommand 重构为只调用 StateManager 方法
- [ ] Command 不再直接操作 viewer 或 editorStore
- [ ] 新增 Command 类型时，只需要调用 StateManager 对应方法

### US-4: 文字管理
作为用户，我希望添加、删除、修改文字时，UI 和 3D 场景能够自动保持同步。

**验收标准：**
- [ ] `addText(textData)` - 添加文字，自动同步到 store 和 viewer
- [ ] `removeText(textId)` - 删除文字，自动同步到 store 和 viewer
- [ ] `updateText(textId, changes)` - 更新文字属性，自动同步
- [ ] `getText(textId)` - 获取单个文字数据
- [ ] `getTexts()` - 获取所有文字数据

### US-5: 选择状态管理
作为用户，我希望选择状态在 UI 和 3D 场景中保持一致。

**验收标准：**
- [ ] `selectText(textId)` - 选中文字，同步到 store 和 viewer
- [ ] `deselectText()` - 取消选中，同步到 store 和 viewer
- [ ] `getSelectedTextId()` - 获取当前选中的文字 ID

## 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                      HistoryManager                         │
│                    (Command 执行/撤销)                       │
└─────────────────────┬───────────────────────────────────────┘
                      │ execute/undo
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                        Command                              │
│              (只调用 StateManager 方法)                      │
└─────────────────────┬───────────────────────────────────────┘
                      │ addText/removeText/updateText...
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                     StateManager                            │
│                   (单一数据源 SSOT)                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ _state: { texts, base, model, selection }           │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│         ┌────────────────┼────────────────┐                │
│         ▼                ▼                ▼                │
│   _syncToStore()   _syncToViewer()   onChange callback     │
└─────────────────────────────────────────────────────────────┘
          │                │
          ▼                ▼
┌─────────────────┐  ┌─────────────────┐
│   editorStore   │  │     Viewer      │
│  (响应式/UI)     │  │   (3D 渲染)     │
└─────────────────┘  └─────────────────┘
```

## 数据结构

```javascript
// StateManager 内部状态
_state = {
  texts: Map<string, TextData>,  // textId -> TextData
  base: BaseData | null,
  model: ModelData | null,
  selection: {
    textId: string | null,
    objectId: string | null
  }
}

// TextData 结构
TextData = {
  id: string,
  content: string,
  displayName: string,
  config: {
    font: string,
    size: number,
    thickness: number,
    color: string,
    mode: 'raised' | 'engraved'
  },
  transform: {
    position: [x, y, z],
    rotation: [x, y, z]
  },
  featureName: string,
  mesh: THREE.Mesh  // 3D 对象引用
}

// Snapshot 结构
Snapshot = {
  texts: Map<string, TextData>,
  selection: { textId, objectId },
  timestamp: number
}
```

## API 设计

```javascript
class StateManager {
  constructor(options: { viewer, store })
  
  // 文字管理
  addText(textData: TextData): string  // 返回 textId
  removeText(textId: string): boolean
  updateText(textId: string, changes: Partial<TextData>): boolean
  getText(textId: string): TextData | null
  getTexts(): TextData[]
  
  // 选择管理
  selectText(textId: string): void
  deselectText(): void
  getSelectedTextId(): string | null
  
  // 快照
  createSnapshot(): Snapshot
  restoreSnapshot(snapshot: Snapshot): Promise<void>
  
  // 内部同步（私有）
  _syncToStore(): void
  _syncToViewer(): Promise<void>
}
```

## 实现任务

### Task 1: 创建 StateManager 基础结构
- 创建 `src/editor/StateManager.js`
- 实现基础数据结构和构造函数
- 实现 `_syncToStore()` 和 `_syncToViewer()` 方法

### Task 2: 实现文字管理方法
- 实现 `addText()`, `removeText()`, `updateText()`
- 实现 `getText()`, `getTexts()`
- 确保每次变更后自动同步

### Task 3: 实现选择状态管理
- 实现 `selectText()`, `deselectText()`, `getSelectedTextId()`
- 同步选择状态到 store 和 viewer

### Task 4: 实现快照功能
- 实现 `createSnapshot()` - 深拷贝当前状态
- 实现 `restoreSnapshot()` - 恢复状态并同步

### Task 5: 重构 TextCommand
- 修改 TextCommand 只调用 StateManager 方法
- 移除直接操作 viewer 的代码

### Task 6: 重构 editorStore
- 移除 editorStore 中的数据修改逻辑
- 保留响应式状态声明
- 添加接收 StateManager 同步的方法

### Task 7: 集成到 EditorApp
- 在 EditorApp 中创建 StateManager 实例
- 连接 StateManager 与 viewer、store
- 更新现有的文字操作方法使用 StateManager

## 文件变更

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/editor/StateManager.js` | 新建 | 状态管理器核心实现 |
| `src/editor/commands/TextCommand.js` | 修改 | 重构为调用 StateManager |
| `src/store/editorStore.js` | 修改 | 改为被动接收数据 |
| `src/editor/EditorApp.js` | 修改 | 集成 StateManager |
| `src/editor/index.js` | 修改 | 导出 StateManager |

## 注意事项

1. **Viewer 保持纯净**：Viewer 是库层，不应该知道 StateManager 的存在，StateManager 通过调用 Viewer 的公开 API 进行同步
2. **异步操作**：3D 操作（如创建文字）是异步的，`_syncToViewer()` 需要是 async 方法
3. **性能考虑**：避免频繁的全量同步，可以考虑增量同步策略
4. **向后兼容**：重构过程中保持现有 API 可用，逐步迁移
