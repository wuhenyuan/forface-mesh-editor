# Implementation Plan: TypeScript Migration

## Overview

将 forface-mesh-editor 项目从 JavaScript 迁移到 TypeScript。按照依赖顺序，从基础配置开始，逐层迁移各模块。

## Tasks

- [x] 1. TypeScript 环境配置
  - [x] 1.1 安装 TypeScript 及相关依赖
    - 安装 typescript, @types/node, @types/three
    - 安装 vue-tsc (Vue TypeScript 支持)
    - _Requirements: 1.1, 1.3_
  - [x] 1.2 创建 tsconfig.json 配置文件
    - 配置 compilerOptions (target, module, strict 等)
    - 配置 include/exclude 路径
    - _Requirements: 1.1_
  - [x] 1.3 更新 vite.config.js 为 vite.config.ts
    - 添加 TypeScript 支持配置
    - 更新入口文件引用
    - _Requirements: 1.4_

- [x] 2. 创建共享类型定义
  - [x] 2.1 创建 src/types 目录结构
    - 创建 index.ts 统一导出
    - _Requirements: 4.3_
  - [x] 2.2 创建 Three.js 扩展类型 (three-extensions.d.ts)
    - 扩展 Object3D.userData 类型
    - _Requirements: 2.3_
  - [x] 2.3 创建事件类型定义 (events.ts)
    - ViewerClickEvent, FaceInfo 等接口
    - _Requirements: 2.3_
  - [x] 2.4 创建业务类型定义 (text.ts, features.ts, history.ts)
    - TextConfig, TextObject, Feature, CommandSnapshot 等
    - _Requirements: 2.3, 3.3_
  - [x] 2.5 创建 Viewer 相关类型 (viewer.ts)
    - ViewerOptions, AddMeshOptions, LoadSTLOptions 等
    - _Requirements: 2.3_
  - [x] 2.6 创建 Store 状态类型 (store.ts)
    - EditorState, ContextMenuState 等
    - _Requirements: 5.2_

- [x] 3. 迁移 src/lib 基础模块
  - [x] 3.1 迁移 src/lib/viewer (Viewer.js, EventManager.js, index.js)
    - 添加类型注解
    - 导出类型定义
    - _Requirements: 4.1, 4.2_
  - [x] 3.2 迁移 src/lib/history (BaseCommand.js, CompositeCommand.js, HistoryManager.js, index.js)
    - 实现 ICommand 接口
    - 添加泛型支持
    - _Requirements: 4.1, 4.2_
  - [x] 3.3 迁移 src/lib/loaders (LoaderManager.js, ExportManager.js, index.js)
    - 添加类型注解
    - _Requirements: 4.1, 4.2_

- [x] 4. Checkpoint - 验证基础模块
  - 运行 tsc --noEmit 检查类型错误
  - 确保 vite dev 可以启动

- [-] 5. 迁移 src/lib/facePicking 模块
  - [-] 5.1 迁移核心文件 (FacePicker.js, OptimizedFacePicker.js, RaycastManager.js)
    - 添加 FaceInfo 类型
    - _Requirements: 4.1, 4.2_
  - [ ] 5.2 迁移特征检测 (FeatureDetector.js, FeatureBasedNaming.js, FeaturePool.js)
    - 添加 Feature 类型
    - _Requirements: 4.1, 4.2_
  - [ ] 5.3 迁移辅助文件 (SelectionManager.js, HighlightRenderer.js, EventHandler.js, DebugLogger.js, VertexBasedIdentifier.js, index.js)
    - _Requirements: 4.1, 4.2_

- [ ] 6. 迁移 src/lib/surfaceText 模块
  - [ ] 6.1 迁移核心文件 (SurfaceTextManager.js, TextGeometryGenerator.js)
    - 添加 TextConfig, TextObject 类型
    - _Requirements: 4.1, 4.2_
  - [ ] 6.2 迁移几何生成 (CurvedTextGeometry.js, CylinderTextGeometry.js, CSGCylinderText.js)
    - _Requirements: 4.1, 4.2_
  - [ ] 6.3 迁移辅助文件 (BooleanOperator.js, ConfigManager.js, CylinderSurfaceHelper.js, SimpleCylinderDetector.js, SurfaceIdentifier.js, FeatureBasedIdentifier.js)
    - _Requirements: 4.1, 4.2_
  - [ ] 6.4 迁移 UI 相关 (TextInputOverlay.js, TextPropertyPanel.js, TextTransformControls.js, index.js)
    - _Requirements: 4.1, 4.2_

- [ ] 7. 迁移 src/lib/objectSelection 模块
  - [ ] 7.1 迁移所有文件 (ObjectSelectionManager.js, ObjectSelector.js, ObjectTransformControls.js, index.js)
    - _Requirements: 4.1, 4.2_

- [ ] 8. 迁移 src/lib/index.js
  - 更新为 index.ts
  - 确保所有导出正确
  - _Requirements: 4.4_

- [ ] 9. Checkpoint - 验证 lib 模块
  - 运行 tsc --noEmit 检查类型错误
  - 确保无循环依赖问题

- [ ] 10. 迁移 src/core 模块
  - [ ] 10.1 迁移核心文件 (Viewer.js, EditorViewer.js, EventManager.js)
    - _Requirements: 2.1, 2.2, 2.4_
  - [ ] 10.2 迁移管理器 (LoaderManager.js, ExportManager.js, ProjectManager.js)
    - _Requirements: 2.1, 2.2_
  - [ ] 10.3 迁移 src/core/facePicking 子模块 (所有文件)
    - _Requirements: 2.1, 2.2_
  - [ ] 10.4 迁移 src/core/history 子模块 (所有文件，包括 TextCommand.js, TransformCommand.js)
    - _Requirements: 2.1, 2.2_
  - [ ] 10.5 迁移 src/core/objectSelection 子模块 (所有文件)
    - _Requirements: 2.1, 2.2_
  - [ ] 10.6 迁移 src/core/surfaceText 子模块 (所有文件)
    - _Requirements: 2.1, 2.2_
  - [ ] 10.7 迁移 src/core/index.js
    - _Requirements: 2.1, 2.5_

- [ ] 11. 迁移 src/editor 模块
  - [ ] 11.1 迁移 EditorApp.js
    - 添加完整类型注解
    - _Requirements: 3.1, 3.2_
  - [ ] 11.2 迁移 StateManager.js, ProjectManager.js
    - _Requirements: 3.1, 3.2_
  - [ ] 11.3 迁移 src/editor/commands (TextCommand.js, TransformCommand.js, index.js)
    - 实现 ICommand 接口
    - _Requirements: 3.1, 3.3_
  - [ ] 11.4 迁移 src/editor/index.js
    - _Requirements: 3.1_

- [ ] 12. 迁移 src/store 模块
  - [ ] 12.1 迁移 editorStore.js
    - 使用 EditorState 接口
    - 添加 getter/action 类型
    - _Requirements: 5.1, 5.2, 5.3_
  - [ ] 12.2 迁移 transformStore.js
    - _Requirements: 5.1, 5.2_
  - [ ] 12.3 迁移 src/store/index.js
    - _Requirements: 5.1, 5.4_

- [ ] 13. 迁移配置文件
  - [ ] 13.1 迁移 config/config.js 和 config/config2.js
    - 定义配置接口
    - _Requirements: 6.1, 6.2, 6.3_

- [ ] 14. 迁移入口文件
  - [ ] 14.1 迁移 src/main.js 为 src/main.ts
    - 添加 Vue 类型注解
    - _Requirements: 7.1, 7.2_
  - [ ] 14.2 迁移 src/index.js 为 src/index.ts
    - 更新导出
    - _Requirements: 7.1_
  - [ ] 14.3 更新 vite.config.ts 入口引用
    - 修改 lib.entry 为 src/main.ts
    - _Requirements: 7.3_

- [ ] 15. Final Checkpoint - 完整验证
  - 运行 tsc --noEmit 确保无类型错误
  - 运行 npm run build 确保构建成功
  - 运行 npm run dev 确保开发服务器正常

## Notes

- 迁移顺序按依赖关系设计：types → lib → core → editor → store → 入口
- 每个 Checkpoint 确保增量迁移的正确性
- Vue 组件文件 (.vue) 暂不处理，保持 JavaScript
- 对于无法推断的类型，使用 `unknown` 并添加 TODO 注释
