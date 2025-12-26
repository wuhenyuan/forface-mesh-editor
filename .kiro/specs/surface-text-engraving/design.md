# 表面文字雕刻功能设计文档

## 概述

基于现有面拾取系统，实现在3D网格表面添加文字的功能。支持凸起和内嵌两种模式，提供完整的编辑和变换功能。

## 核心架构

### 主要组件

1. **SurfaceTextManager** - 主控制器
   - 管理文字对象生命周期
   - 协调各个子系统
   - 处理用户交互

2. **TextGeometryGenerator** - 文字几何体生成器
   - 基于用户输入生成3D文字
   - 支持字体、大小、厚度等参数
   - 使用Three.js TextGeometry

3. **TextInputOverlay** - 文字输入覆盖层
   - 在点击位置显示输入框
   - 处理用户文字输入
   - 管理输入状态

4. **TextTransformControls** - 文字变换控制器
   - 提供拖拽箭头
   - 处理位置变换
   - 集成Three.js TransformControls

5. **BooleanOperator** - 布尔操作器
   - 执行内嵌模式的布尔减法
   - 使用three-bvh-csg库
   - 处理操作失败情况

6. **TextPropertyPanel** - 文字属性面板
   - 集成到现有属性面板
   - 提供文字属性编辑界面
   - 实时更新文字外观

## 技术实现

### 依赖库
- Three.js (现有)
- three-bvh-csg (布尔操作)
- 现有面拾取系统

### 工作流程

1. **文字添加模式**
   ```
   用户点击文字工具 → 启用面拾取 → 点击表面 → 显示输入框 → 生成文字几何体
   ```

2. **文字编辑**
   ```
   选中文字对象 → 显示属性面板 → 修改属性 → 实时更新几何体
   ```

3. **位置调整**
   ```
   选中文字对象 → 显示变换控制器 → 拖拽箭头 → 更新位置
   ```

4. **内嵌模式**
   ```
   切换到内嵌模式 → 执行布尔减法 → 更新原始网格 → 隐藏文字几何体
   ```

## 数据结构

### TextObject
```javascript
{
  id: string,
  content: string,
  position: Vector3,
  rotation: Vector3,
  scale: Vector3,
  font: string,
  size: number,
  thickness: number,
  color: Color,
  mode: 'raised' | 'engraved',
  targetMesh: Mesh,
  targetFace: number,
  geometry: TextGeometry,
  mesh: Mesh
}
```

## 文件结构

```
src/utils/surfaceText/
├── SurfaceTextManager.js      # 主控制器
├── TextGeometryGenerator.js   # 文字几何体生成
├── TextInputOverlay.js        # 输入覆盖层
├── TextTransformControls.js   # 变换控制器
├── BooleanOperator.js         # 布尔操作
├── TextPropertyPanel.js       # 属性面板
└── index.js                   # 导出接口
```

## 集成点

1. **工具栏** - 添加文字工具按钮
2. **属性面板** - 集成文字属性编辑
3. **面拾取系统** - 复用现有面拾取功能
4. **场景管理** - 集成到现有场景管理系统

## 性能考虑

1. **文字生成** - 缓存字体和几何体
2. **布尔操作** - 异步执行，显示进度
3. **渲染优化** - LOD和实例化渲染
4. **内存管理** - 及时清理不用的几何体

## 错误处理

1. **布尔操作失败** - 回退到凸起模式
2. **字体加载失败** - 使用默认字体
3. **无效输入** - 显示错误提示
4. **性能问题** - 限制文字数量和复杂度