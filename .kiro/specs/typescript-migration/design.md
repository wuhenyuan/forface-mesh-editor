# Design Document

## Overview

本设计文档描述将 forface-mesh-editor 项目从 JavaScript 迁移到 TypeScript 的技术方案。项目是一个基于 Vue 2 + Vite + Three.js 的 3D 网格编辑器，包含面拾取、文字系统、历史记录等功能模块。

迁移范围：所有 `.js` 文件（约 60+ 个），Vue 组件暂不处理。

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    TypeScript 配置层                         │
│  tsconfig.json / vite.config.ts / 类型声明文件               │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                    src/types/ (新增)                         │
│  共享类型定义：Three.js 扩展、业务类型、事件类型              │
└─────────────────────────────────────────────────────────────┘
                              │
┌──────────────┬──────────────┬──────────────┬────────────────┐
│   src/core   │  src/editor  │   src/lib    │   src/store    │
│  核心模块    │   编辑器层   │    库模块    │   状态管理     │
└──────────────┴──────────────┴──────────────┴────────────────┘
```

## Components and Interfaces

### 1. 共享类型定义 (src/types/)

```typescript
// src/types/three-extensions.d.ts
import * as THREE from 'three'

declare module 'three' {
  interface Object3D {
    userData: {
      isHelper?: boolean
      isText?: boolean
      isSurface?: boolean
      isMesh?: boolean
      surfaceType?: 'plane' | 'cylinder' | 'sphere'
      featureId?: string
      [key: string]: unknown
    }
  }
}

// src/types/events.ts
export interface ViewerClickEvent {
  target: THREE.Object3D | null
  targetType: 'text' | 'surface' | 'object' | 'empty'
  point?: THREE.Vector3
  faceIndex?: number
  face?: THREE.Face
  uv?: THREE.Vector2
  event: MouseEvent
  filtered?: boolean
  reason?: string
}

export interface FaceInfo {
  mesh: THREE.Mesh
  faceIndex: number
  face: THREE.Face
  point: THREE.Vector3
  normal: THREE.Vector3
  featureId?: string
  featureName?: string
}

// src/types/text.ts
export interface TextConfig {
  font: string
  size: number
  thickness: number
  mode: 'raised' | 'engraved' | 'flat'
  color: string | number
}

export interface TextObject {
  id: string
  content: string
  displayName: string
  mesh: THREE.Mesh
  config: TextConfig
  mode: 'raised' | 'engraved' | 'flat'
  featureName?: string
  attachedSurface?: string
}

// src/types/history.ts
export interface CommandSnapshot {
  undoCount: number
  redoCount: number
  canUndo: boolean
  canRedo: boolean
  isBusy: boolean
  isApplying: boolean
  transactionName: string | null
  lastError: Error | null
}

// src/types/features.ts
export interface PlaneFeature {
  type: 'plane'
  id: string
  name: string
  normal: THREE.Vector3
  center: THREE.Vector3
  triangles: number[]
}

export interface CylinderFeature {
  type: 'cylinder'
  id: string
  name: string
  axis: THREE.Vector3
  center: THREE.Vector3
  radius: number
  triangles: number[]
}

export type Feature = PlaneFeature | CylinderFeature

export interface MeshFeatures {
  meshId: string
  meshName: string
  planes: PlaneFeature[]
  cylinders: CylinderFeature[]
  namedFeatures: Map<string, Feature>
}
```

### 2. 事件管理器接口

```typescript
// src/types/event-manager.ts
export type EventCallback<T = unknown> = (data: T) => void

export interface IEventManager {
  on<T>(event: string, callback: EventCallback<T>): void
  off<T>(event: string, callback: EventCallback<T>): void
  emit<T>(event: string, data?: T): void
  once<T>(event: string, callback: EventCallback<T>): void
  clear(): void
}
```

### 3. 命令模式接口

```typescript
// src/types/command.ts
export interface ICommand {
  type: string
  description: string
  timestamp: number
  isAsync: boolean
  
  execute(): Promise<void>
  undo(): Promise<void>
  redo(): Promise<void>
  canMergeWith(other: ICommand): boolean
  mergeWith(other: ICommand): ICommand
}
```

### 4. Viewer 配置接口

```typescript
// src/types/viewer.ts
export interface ViewerOptions {
  backgroundColor?: number
  enableShadow?: boolean
  enableGrid?: boolean
}

export interface AddMeshOptions {
  selectable?: boolean
  castShadow?: boolean
  receiveShadow?: boolean
}

export interface LoadSTLOptions {
  color?: number
  roughness?: number
  metalness?: number
  scale?: number | null
  targetSize?: number
  position?: [number, number, number]
  name?: string
}

export interface ScreenshotOptions {
  width?: number
  height?: number
  type?: string
  quality?: number
}
```

## Data Models

### Store 状态类型

```typescript
// src/types/store.ts
export interface EditorState {
  currentFeature: 'base' | 'ornament' | 'text' | 'adjust'
  viewMode: 'result' | 'construct'
  viewModeBusy: boolean
  menuVisible: boolean
  menuItems: MenuItem[]
  menuLoading: boolean
  menuKeyword: string
  selectedTextObject: TextObject | null
  selectedBaseObject: THREE.Object3D | null
  selectedObject: THREE.Object3D | null
  textList: TextListItem[]
  textCounter: number
  history: CommandSnapshot
  workspaceRef: { value: WorkspaceViewport } | null
  contextMenu: ContextMenuState
  colorPicker: ColorPickerState
  editMenu: EditMenuState
  tooltip: TooltipState
}

export interface TextListItem {
  id: string
  content: string
  displayName: string
}

export interface ContextMenuState {
  visible: boolean
  x: number
  y: number
  target: THREE.Object3D | null
  targetType: 'text' | 'object' | 'surface' | 'empty' | null
  items: ContextMenuItem[]
}

export interface ContextMenuItem {
  key: string
  label: string
  icon?: string
  danger?: boolean
  divider?: boolean
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

基于需求分析，本次迁移主要是代码转换，不涉及功能变更，因此正确性属性聚焦于类型系统的完整性和构建的正确性。

**Property 1: TypeScript 编译无错误**
*For any* TypeScript 文件，运行 `tsc --noEmit` 应该不产生任何类型错误
**Validates: Requirements 1.1, 1.2**

**Property 2: 构建产物等价性**
*For any* 迁移后的模块，Vite 构建产物应该与迁移前功能等价（导出相同的 API）
**Validates: Requirements 1.4**

**Property 3: 类型定义完整性**
*For any* 导出的函数或类，应该有完整的类型注解（参数类型、返回类型）
**Validates: Requirements 2.2, 3.2, 4.2, 5.2**

## Error Handling

### 迁移过程中的错误处理

1. **类型推断失败**：对于无法自动推断的类型，使用 `unknown` 并添加 TODO 注释
2. **第三方库类型缺失**：安装 `@types/*` 包或创建本地声明文件
3. **循环依赖**：通过类型导入 (`import type`) 解决
4. **隐式 any**：配置 `noImplicitAny: false` 初期，逐步修复

### 运行时兼容性

- 保持所有导出 API 不变
- 保持事件名称和数据结构不变
- 保持 Vue 组件调用方式不变

## Testing Strategy

### 验证方法

1. **类型检查**：`tsc --noEmit` 确保无类型错误
2. **构建验证**：`npm run build` 确保构建成功
3. **开发服务器**：`npm run dev` 确保开发环境正常
4. **手动测试**：验证核心功能（加载模型、面拾取、文字创建）

### 迁移验证清单

- [ ] TypeScript 编译通过
- [ ] Vite 开发服务器启动正常
- [ ] Vite 生产构建成功
- [ ] 模型加载功能正常
- [ ] 面拾取功能正常
- [ ] 文字系统功能正常
- [ ] 撤销/重做功能正常
