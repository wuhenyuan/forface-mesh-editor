# 3D 编辑器架构设计（内核 / 插件 / 适配器）

> v3.0 | 2026-01-03

## 设计目标

- UI 框架无关：核心编辑能力不依赖 Vue/React，仅由 UI 适配层对接
- 命令驱动：所有编辑操作以 Command 执行，统一支持撤销/重做
- 插件化：功能（文字/CSG/拾取/导入导出…）以插件注册到内核
- 可替换适配器：渲染(Three.js)、IO(浏览器/Node) 通过 Adapter/Port 解耦

## 分层架构（更像“编辑器”的结构）

```
┌─────────────────────────────────────────────────────────────────────────┐
│ App Shell (Vue / React / SSR)                                            │
│ - Layout / Panels / Menu / Shortcut / Theme                              │
├─────────────────────────────────────────────────────────────────────────┤
│ UI Adapter (framework binding)                                           │
│ - store / view-model（UI 状态投影，不是 SSOT）                           │
│ - UI 事件 → dispatch(Command)                                            │
│ - subscribe(editor.state / editor.events)                                │
├─────────────────────────────────────────────────────────────────────────┤
│ Editor Core (framework-agnostic JS library)                              │
│ ┌────────────────┬──────────────────┬────────────────┬────────────────┐ │
│ │ Document Model  │ Command + History│ Tool System     │ Plugin Host     │ │
│ │ (SSOT)          │ (undo/redo)      │ (modes)         │ (features)      │ │
│ └────────────────┴──────────────────┴────────────────┴────────────────┘ │
│ Services: Selection | Inspector | Asset/Project | EventBus | Validation  │
├─────────────────────────────────────────────────────────────────────────┤
│ Adapters (replaceable)                                                   │
│ - Renderer Adapter: Three.js viewport / picking / gizmos                 │
│ - IO Adapter: load/save/export (Browser FS / Node FS / HTTP)             │
├─────────────────────────────────────────────────────────────────────────┤
│ Dependencies                                                             │
│ three.js | three-mesh-bvh | three-bvh-csg | troika-text | ...            │
└─────────────────────────────────────────────────────────────────────────┘
```

## 数据流（命令驱动）

```
用户输入/菜单点击
   ↓
UI Adapter 组装 Command / Action
   ↓
EditorCore.execute(command)
   ↓
DocumentModel(SSOT) 更新 + History 记录
   ↓
事件/状态快照发布（subscribe）
   ├─ UI store 更新 → UI 重渲染
   └─ ViewportAdapter 同步渲染（需要时）
```

## 代码组织建议（回答 EditorApp + Lib）

- 把 `EditorApp` + `lib/*` 视为同一个“框架无关编辑器 SDK”，对外只暴露稳定 API（例如 `createEditor()` / `execute()` / `subscribe()`）
- UI 层（Vue/React）只做：组件 + store + 适配器；不要直接散落调用 three.js 或内部 manager
- 推荐拆分为多包（或 monorepo）：
  - `@forface/editor-core`：Document/Command/History/Tool/Plugin（尽量不依赖 DOM）
  - `@forface/editor-three`：Three.js ViewportAdapter + gizmo/picking
  - `@forface/editor-vue` / `@forface/editor-react`：UI 组件与绑定层

示例（monorepo）：

```
packages/
  editor-core/
  editor-three/
  editor-vue/
  editor-react/   # optional
apps/
  demo-vue/
```
