/**
 * 3D Viewer Library
 * 可独立发布的第三方库
 */

// 核心查看器
export { Viewer } from './viewer/index'
export { EventManager } from './viewer/EventManager'

// 加载/导出
export { LoaderManager } from './loaders/LoaderManager'
export { ExportManager } from './loaders/ExportManager'

// 面拾取系统
export * from './facePicking/index'

// 物体选择系统
export * from './objectSelection/index'

// 表面文字系统
export * from './surfaceText/index'

// 历史管理（通用）
export { HistoryManager } from './history/HistoryManager'
export { BaseCommand } from './history/BaseCommand'
export { CompositeCommand } from './history/CompositeCommand'
