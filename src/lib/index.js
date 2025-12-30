/**
 * 3D Viewer Library
 * 可独立发布的第三方库
 */

// 核心查看器
export { Viewer } from './viewer/index.js'
export { EventManager } from './viewer/EventManager.js'

// 加载/导出
export { LoaderManager } from './loaders/LoaderManager.js'
export { ExportManager } from './loaders/ExportManager.js'

// 面拾取系统
export * from './facePicking/index.js'

// 物体选择系统
export * from './objectSelection/index.js'

// 表面文字系统
export * from './surfaceText/index.js'

// 历史管理（通用）
export { HistoryManager } from './history/HistoryManager.js'
export { BaseCommand } from './history/BaseCommand.js'
export { CompositeCommand } from './history/CompositeCommand.js'
