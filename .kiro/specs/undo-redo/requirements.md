# Requirements Document

## Introduction

编辑器撤销重做系统，支持对 3D 场景中各种操作的撤销和重做，包括模型变换、底座管理、文字编辑等。需要处理异步操作（模型加载、CSG 运算）和同步 UI 状态与 3D 场景数据。

## Glossary

- **History_Manager**: 历史记录管理器，负责维护撤销/重做栈
- **Action**: 一个可撤销的操作记录，包含类型、数据和执行/撤销方法
- **Command**: 命令对象，封装操作的执行和撤销逻辑
- **Snapshot**: 状态快照，用于复杂操作的完整状态恢复
- **Transaction**: 事务，将多个操作合并为一个可撤销单元

## Requirements

### Requirement 1: 基础撤销重做框架

**User Story:** As a 开发者, I want 一个统一的撤销重做框架, so that 所有可撤销操作都能以一致的方式处理。

#### Acceptance Criteria

1. THE History_Manager SHALL 维护一个撤销栈和一个重做栈
2. WHEN 执行新操作时, THE History_Manager SHALL 将操作压入撤销栈并清空重做栈
3. WHEN 撤销操作时, THE History_Manager SHALL 从撤销栈弹出操作并压入重做栈
4. WHEN 重做操作时, THE History_Manager SHALL 从重做栈弹出操作并压入撤销栈
5. THE History_Manager SHALL 限制历史记录最大数量为 50 条
6. WHEN 历史记录超过限制时, THE History_Manager SHALL 移除最早的记录

### Requirement 2: 物体变换操作

**User Story:** As a 用户, I want 撤销/重做物体的位置、旋转、缩放变换, so that 我可以回退错误的变换操作。

#### Acceptance Criteria

1. WHEN 物体位置变化时, THE System SHALL 记录变换前后的位置值
2. WHEN 物体旋转变化时, THE System SHALL 记录变换前后的旋转值
3. WHEN 物体缩放变化时, THE System SHALL 记录变换前后的缩放值
4. WHEN 撤销变换操作时, THE System SHALL 恢复物体到变换前的状态
5. WHEN 连续拖拽变换时, THE System SHALL 合并为单个可撤销操作（防止每帧都记录）

### Requirement 3: 底座管理操作

**User Story:** As a 用户, I want 撤销/重做底座的添加、删除、替换操作, so that 我可以回退底座相关的修改。

#### Acceptance Criteria

1. WHEN 添加底座时, THE System SHALL 记录底座的完整配置信息
2. WHEN 删除底座时, THE System SHALL 保存底座的完整状态以便恢复
3. WHEN 替换底座时, THE System SHALL 记录替换前后的底座信息
4. WHEN 撤销添加底座时, THE System SHALL 从场景中移除该底座
5. WHEN 撤销删除底座时, THE System SHALL 重新加载并恢复底座到原位置
6. IF 底座加载失败, THEN THE System SHALL 显示错误提示并保持当前状态

### Requirement 4: 文字操作

**User Story:** As a 用户, I want 撤销/重做文字的添加、删除、修改操作, so that 我可以回退文字相关的修改。

#### Acceptance Criteria

1. WHEN 添加文字时, THE System SHALL 记录文字的完整配置（内容、位置、样式、附着面等）
2. WHEN 删除文字时, THE System SHALL 保存文字的完整状态以便恢复
3. WHEN 修改文字内容时, THE System SHALL 记录修改前后的内容
4. WHEN 修改文字样式时, THE System SHALL 记录修改前后的样式配置
5. WHEN 撤销添加文字时, THE System SHALL 从场景中移除该文字
6. WHEN 撤销删除文字时, THE System SHALL 重新创建文字并恢复到原状态
7. WHEN 撤销修改文字时, THE System SHALL 恢复文字到修改前的状态

### Requirement 5: 异步操作处理

**User Story:** As a 开发者, I want 正确处理异步操作的撤销重做, so that 涉及模型加载、CSG 运算的操作也能正确撤销。

#### Acceptance Criteria

1. WHEN 执行异步操作时, THE System SHALL 显示加载状态并禁用撤销重做按钮
2. WHEN 异步操作完成时, THE System SHALL 将操作记录到历史栈
3. WHEN 撤销异步操作时, THE System SHALL 执行对应的异步撤销逻辑
4. IF 异步撤销操作失败, THEN THE System SHALL 回滚到操作前状态并显示错误
5. THE System SHALL 支持取消正在进行的异步操作

### Requirement 6: 状态同步

**User Story:** As a 开发者, I want 撤销重做时自动同步 UI 状态和 3D 场景, so that 界面显示与场景数据保持一致。

#### Acceptance Criteria

1. WHEN 撤销/重做操作时, THE System SHALL 同步更新 store 中的响应式数据
2. WHEN 撤销/重做操作时, THE System SHALL 同步更新 3D 场景中的对象
3. WHEN 撤销/重做选中对象相关操作时, THE System SHALL 更新选中状态
4. THE System SHALL 确保 UI 面板（属性面板、文字列表等）自动响应状态变化

### Requirement 7: 事务支持

**User Story:** As a 开发者, I want 将多个操作合并为一个事务, so that 复杂操作可以作为整体撤销。

#### Acceptance Criteria

1. THE System SHALL 支持开始事务（beginTransaction）
2. THE System SHALL 支持提交事务（commitTransaction），将事务内所有操作合并为一条记录
3. THE System SHALL 支持回滚事务（rollbackTransaction），撤销事务内所有操作
4. WHEN 撤销事务时, THE System SHALL 按逆序撤销事务内的所有操作
5. WHEN 重做事务时, THE System SHALL 按顺序重做事务内的所有操作

### Requirement 8: 快捷键支持

**User Story:** As a 用户, I want 使用快捷键进行撤销重做, so that 操作更加便捷。

#### Acceptance Criteria

1. WHEN 按下 Ctrl+Z 时, THE System SHALL 执行撤销操作
2. WHEN 按下 Ctrl+Y 或 Ctrl+Shift+Z 时, THE System SHALL 执行重做操作
3. WHEN 撤销栈为空时, THE System SHALL 禁用撤销快捷键并显示禁用状态
4. WHEN 重做栈为空时, THE System SHALL 禁用重做快捷键并显示禁用状态
