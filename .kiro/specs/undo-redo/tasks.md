# Implementation Plan: 撤销重做系统

## Overview

基于命令模式实现撤销重做系统，分阶段完成：核心框架 → 各类命令 → Store 集成 → UI 集成 → 快捷键支持。

## Tasks

- [ ] 1. 创建核心框架
  - [ ] 1.1 创建 HistoryManager 类
    - 创建 `src/core/history/HistoryManager.js`
    - 实现 undoStack/redoStack 管理
    - 实现 execute/undo/redo 方法
    - 实现 maxSize 限制逻辑
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_
  
  - [ ] 1.2 创建 BaseCommand 基类
    - 创建 `src/core/history/BaseCommand.js`
    - 定义 execute/undo 抽象方法
    - 实现 canMergeWith/mergeWith 方法
    - _Requirements: 1.1_
  
  - [ ] 1.3 创建 history 模块导出
    - 创建 `src/core/history/index.js`
    - 导出所有 history 相关类
    - _Requirements: 1.1_

- [ ] 2. 实现变换命令
  - [ ] 2.1 创建 TransformCommand 类
    - 创建 `src/core/history/TransformCommand.js`
    - 实现位置/旋转/缩放变换的记录和恢复
    - 使用 WeakRef 存储对象引用
    - 实现连续变换合并逻辑（300ms 时间窗口）
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  
  - [ ]* 2.2 编写 TransformCommand 属性测试
    - **Property 3: 变换操作往返一致性**
    - **Property 4: 连续变换合并**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

- [ ] 3. 实现底座命令
  - [ ] 3.1 创建 BaseObjectCommand 类
    - 创建 `src/core/history/BaseObjectCommand.js`
    - 实现底座添加/删除/替换的记录和恢复
    - 处理异步加载逻辑
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_
  
  - [ ]* 3.2 编写 BaseObjectCommand 属性测试
    - **Property 5: 底座操作往返一致性**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

- [ ] 4. 实现文字命令
  - [ ] 4.1 创建 TextCommand 类
    - 创建 `src/core/history/TextCommand.js`
    - 实现文字添加/删除/修改/样式的记录和恢复
    - 处理异步 CSG 操作
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_
  
  - [ ]* 4.2 编写 TextCommand 属性测试
    - **Property 6: 文字操作往返一致性**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7**

- [ ] 5. 实现事务支持
  - [ ] 5.1 创建 CompositeCommand 类
    - 创建 `src/core/history/CompositeCommand.js`
    - 实现事务内命令的顺序执行和逆序撤销
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
  
  - [ ] 5.2 在 HistoryManager 中添加事务方法
    - 实现 beginTransaction/commitTransaction/rollbackTransaction
    - _Requirements: 7.1, 7.2, 7.3_
  
  - [ ]* 5.3 编写事务属性测试
    - **Property 8: 事务操作顺序**
    - **Validates: Requirements 7.4, 7.5**

- [ ] 6. Checkpoint - 核心功能验证
  - 确保所有测试通过，如有问题请询问用户

- [ ] 7. 集成到 Store
  - [ ] 7.1 更新 editorStore 集成 HistoryManager
    - 在 store 中创建 HistoryManager 实例
    - 替换现有的简单 undoStack/redoStack
    - 更新 undo/redo actions 调用 HistoryManager
    - _Requirements: 6.1, 6.2, 6.3_
  
  - [ ] 7.2 添加异步操作状态管理
    - 添加 isAsyncOperationInProgress 状态
    - 在异步操作期间禁用撤销重做
    - _Requirements: 5.1, 5.2_
  
  - [ ]* 7.3 编写状态同步属性测试
    - **Property 7: 状态同步一致性**
    - **Validates: Requirements 6.1, 6.2, 6.3**

- [ ] 8. 集成到 EditorViewer
  - [ ] 8.1 在变换操作中记录命令
    - 监听 objectTransformed 事件
    - 创建 TransformCommand 并执行
    - _Requirements: 2.1, 2.2, 2.3_
  
  - [ ] 8.2 在文字操作中记录命令
    - 监听 textCreated/textDeleted 等事件
    - 创建 TextCommand 并执行
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [ ] 9. 实现快捷键支持
  - [ ] 9.1 创建快捷键监听器
    - 在 EditorLayout 或 WorkspaceViewport 中添加键盘事件监听
    - 实现 Ctrl+Z 撤销、Ctrl+Y/Ctrl+Shift+Z 重做
    - _Requirements: 8.1, 8.2_
  
  - [ ] 9.2 更新 ToolbarPanel 按钮状态
    - 根据 canUndo/canRedo 禁用/启用按钮
    - 显示禁用状态样式
    - _Requirements: 8.3, 8.4_

- [ ] 10. Checkpoint - 完整功能验证
  - 确保所有测试通过，如有问题请询问用户

- [ ]* 11. 编写 HistoryManager 属性测试
  - **Property 1: 撤销/重做栈操作正确性**
  - **Property 2: 历史栈大小限制**
  - **Validates: Requirements 1.2, 1.3, 1.4, 1.5, 1.6**

## Notes

- 任务标记 `*` 为可选测试任务，可跳过以加快 MVP 开发
- 每个任务引用具体需求以便追溯
- Checkpoint 用于阶段性验证
- 属性测试验证系统正确性属性
