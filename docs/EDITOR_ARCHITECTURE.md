# 3D 编辑器架构设计

> v2.2 | 2024-12-30

## 分层架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         EditorLayout (Vue 组件)                          │
│         Props: config / originPath          Events: ready / save / ...  │
├─────────────────────────────────────────────────────────────────────────┤
│                            UI 层 (Vue)                                   │
│  FeatureMenu | PropertyPanel | ToolbarPanel | WorkspaceViewport         │
│                              ↓                                          │
│                    editorStore (响应式容器)                              │
├─────────────────────────────────────────────────────────────────────────┤
│                           业务层 (Editor)                                │
│                           EditorApp                                     │
│    ┌──────────┬──────────┬──────────┬──────────┬──────────────────┐    │
│    │  State   │ ViewMode │   CSG    │ Project  │    Feature       │    │
│    │ Manager  │ Manager  │ Operator │ Manager  │   Detector       │    │
│    │  (SSOT)  │构造/结果 │ 布尔运算 │ 项目管理 │ 特征检测+命名    │    │
│    └──────────┴──────────┴──────────┴──────────┴──────────────────┘    │
│                    HistoryManager + Commands                            │
│         TextCmd | VisibilityCmd | TransformCmd | CSGCmd                 │
├─────────────────────────────────────────────────────────────────────────┤
│                            库层 (Lib)                                    │
│                            Viewer                                       │
│    Loader | Exporter | FacePicker | SurfaceText | ObjectSelect          │
│                                                                         │
│    通用组件 (Controls & Helpers)                                         │
│    ┌────────────────────┬────────────────────────────────────────┐     │
│    │ TransformControls  │ 平移/旋转/缩放交互控制器                │     │
│    │ TransformVisualizer│ 变换可视化（位移线段/旋转弧/比例标注）  │     │
│    │ OrbitControls      │ 相机轨道控制                           │     │
│    │ GridHelper         │ 网格辅助线                             │     │
│    │ AxisHelper         │ 坐标轴辅助                             │     │
│    └────────────────────┴────────────────────────────────────────┘     │
├─────────────────────────────────────────────────────────────────────────┤
│                          底层 (Three.js)                                 │
│           Scene | Mesh | Material | three-bvh-csg | troika-text         │
└─────────────────────────────────────────────────────────────────────────┘
```

## 数据流

```
Props ──► EditorApp ──► StateManager ──┬──► editorStore (UI)
                            ▲          └──► Viewer (3D)
                            │
              HistoryManager + Command
```

## 初始化模式

| 条件 | 模式 | 行为 |
|------|------|------|
| config 存在 | 编辑 | 恢复模型、文字、底座 |
| 仅 originPath | 新建 | 加载原始模型，创建空配置 |
