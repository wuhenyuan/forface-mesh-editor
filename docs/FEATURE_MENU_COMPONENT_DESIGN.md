# 功能菜单业务组件设计文档

## 1. 背景

当前的 3D 编辑器需要作为一个可复用的业务组件库导出，供上层应用调用。其中功能菜单（FeatureMenu）的数据和搜索逻辑需要由上层应用控制，而不是在组件内部硬编码。

## 2. 设计目标

- 将 3D 编辑器封装为独立的 npm 包
- 功能菜单数据由上层传入
- 搜索逻辑由上层决定（支持本地搜索、远程搜索等）
- 保持组件内部逻辑的独立性和可测试性

## 3. 架构设计

### 3.1 组件层级

```
上层应用 (Host App)
    │
    ├── 提供功能菜单数据
    ├── 提供搜索逻辑
    └── 监听编辑器事件
          │
          ▼
┌─────────────────────────────────────┐
│     3D Editor Component Library     │
│  ┌─────────────────────────────────┐│
│  │        EditorLayout             ││
│  │  ┌──────┐ ┌──────┐ ┌─────────┐ ││
│  │  │Feature│ │Feature│ │Property ││
│  │  │Panel  │ │Menu   │ │Panel    ││
│  │  └──────┘ └──────┘ └─────────┘ ││
│  │           ┌──────────────┐      ││
│  │           │WorkspaceView │      ││
│  │           └──────────────┘      ││
│  └─────────────────────────────────┘│
└─────────────────────────────────────┘
```

### 3.2 数据流设计

```
┌─────────────┐     Props      ┌─────────────┐
│  Host App   │ ─────────────► │  FeatureMenu │
│             │                │             │
│  - menuData │                │  - 渲染列表  │
│  - onSearch │ ◄───────────── │  - 触发搜索  │
└─────────────┘     Events     └─────────────┘
```

## 4. 接口设计

### 4.1 FeatureMenu Props

```typescript
interface FeatureMenuItem {
  id: string
  name: string
  thumbnail?: string  // 缩略图 URL
  category?: string   // 分类
  tags?: string[]     // 标签，用于搜索
  metadata?: Record<string, any>  // 扩展数据
}

interface FeatureMenuProps {
  // 当前功能类型
  feature: 'base' | 'ornament' | 'text' | 'adjust'
  
  // 菜单数据（由上层提供）
  items: FeatureMenuItem[]
  
  // 是否正在加载
  loading?: boolean
  
  // 是否显示搜索框
  searchable?: boolean
  
  // 搜索占位符
  searchPlaceholder?: string
  
  // 空状态文案
  emptyText?: string
  
  // 是否使用远程搜索（true 时不在本地过滤）
  remoteSearch?: boolean
}
```

### 4.2 FeatureMenu Events

```typescript
interface FeatureMenuEvents {
  // 搜索事件（上层处理搜索逻辑）
  'search': (keyword: string) => void
  
  // 选择菜单项
  'select': (item: FeatureMenuItem) => void
  
  // 加载更多（分页场景）
  'load-more': () => void
}
```

### 4.3 EditorLayout Props

```typescript
interface EditorLayoutProps {
  // 功能菜单配置
  featureMenuConfig?: {
    // 各功能类型的菜单数据
    base?: FeatureMenuItem[]
    ornament?: FeatureMenuItem[]
    text?: FeatureMenuItem[]
    adjust?: FeatureMenuItem[]
  }
  
  // 是否显示功能菜单
  showFeatureMenu?: boolean
  
  // 功能菜单显示条件（哪些 feature 显示菜单）
  featureMenuVisibleFor?: string[]
  
  // 搜索处理器
  onFeatureMenuSearch?: (feature: string, keyword: string) => Promise<FeatureMenuItem[]>
}
```

## 5. 使用示例

### 5.1 基础用法

```vue
<template>
  <Editor3D
    :feature-menu-config="menuConfig"
    :feature-menu-visible-for="['base']"
    @feature-menu-search="handleSearch"
    @feature-menu-select="handleSelect"
  />
</template>

<script setup>
import { Editor3D } from '@your-org/3d-editor'

const menuConfig = {
  base: [
    { id: 'b1', name: '圆形底座', thumbnail: '/images/base1.png' },
    { id: 'b2', name: '方形底座', thumbnail: '/images/base2.png' },
  ]
}

const handleSearch = async (feature, keyword) => {
  // 调用后端 API 搜索
  const response = await fetch(`/api/menu/${feature}?q=${keyword}`)
  return response.json()
}

const handleSelect = (item) => {
  console.log('选中菜单项:', item)
}
</script>
```

### 5.2 远程搜索

```vue
<template>
  <Editor3D
    :feature-menu-config="menuConfig"
    :remote-search="true"
    @feature-menu-search="handleRemoteSearch"
  />
</template>

<script setup>
import { ref } from 'vue'
import { debounce } from 'lodash-es'

const menuConfig = ref({ base: [] })

const handleRemoteSearch = debounce(async (feature, keyword) => {
  const response = await fetch(`/api/search?feature=${feature}&q=${keyword}`)
  const data = await response.json()
  menuConfig.value[feature] = data.items
}, 300)
</script>
```

## 6. 组件库导出结构

```
@your-org/3d-editor/
├── dist/
│   ├── index.js          # 主入口
│   ├── index.css         # 样式
│   └── types.d.ts        # TypeScript 类型定义
├── src/
│   ├── components/
│   │   ├── Editor3D.vue      # 主组件（封装 EditorLayout）
│   │   ├── FeatureMenu.vue   # 功能菜单
│   │   ├── PropertyPanel.vue # 属性面板
│   │   └── ...
│   ├── composables/          # 可复用逻辑
│   ├── utils/                # 工具函数
│   └── index.ts              # 导出入口
└── package.json
```

### 6.1 导出入口 (index.ts)

```typescript
// 主组件
export { default as Editor3D } from './components/Editor3D.vue'

// 子组件（可选导出，供高级定制）
export { default as FeatureMenu } from './components/FeatureMenu.vue'
export { default as PropertyPanel } from './components/PropertyPanel.vue'
export { default as WorkspaceViewport } from './components/WorkspaceViewport.vue'

// 类型定义
export type {
  FeatureMenuItem,
  FeatureMenuProps,
  EditorLayoutProps,
  TextObject,
  // ...
} from './types'

// 工具函数
export { SurfaceTextManager } from './utils/surfaceText'
export { BooleanOperator } from './utils/surfaceText/BooleanOperator'
```

## 7. 实现步骤

### Phase 1: 重构 FeatureMenu 组件
1. 将硬编码的 `dataMap` 改为 props 传入
2. 添加 `search` 事件，支持上层处理搜索
3. 添加 `remoteSearch` 模式支持
4. 添加 loading 状态和空状态

### Phase 2: 重构 EditorLayout
1. 添加 `featureMenuConfig` prop
2. 添加 `featureMenuVisibleFor` prop 控制显示条件
3. 转发 FeatureMenu 事件到上层

### Phase 3: 创建 Editor3D 封装组件
1. 封装 EditorLayout 为对外暴露的主组件
2. 统一 props 和 events 接口
3. 提供默认配置和插槽

### Phase 4: 构建和发布
1. 配置 Vite 库模式构建
2. 生成 TypeScript 类型定义
3. 编写 README 和 API 文档
4. 发布到 npm

## 8. 注意事项

1. **样式隔离**: 使用 CSS Modules 或 scoped 样式，避免污染上层应用
2. **依赖管理**: Three.js 等大型依赖设为 peerDependencies
3. **Tree Shaking**: 确保支持按需引入
4. **版本兼容**: 明确 Vue 版本要求（Vue 3.x）
5. **国际化**: 预留 i18n 接口，文案可配置

## 9. 后续扩展

- 支持自定义功能面板（FeaturePanel）项
- 支持自定义属性面板（PropertyPanel）内容
- 支持插件机制扩展编辑器功能
- 支持主题定制
