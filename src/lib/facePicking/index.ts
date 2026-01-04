/**
 * 面拾取工具包
 * 提供3D网格面级拾取和选择功能
 */

// 核心组件 - TypeScript
export { RaycastManager } from './RaycastManager'
export { SelectionManager } from './SelectionManager'
export { DebugLogger, debugLogger } from './DebugLogger'
export { FacePicker } from './FacePicker'
export { HighlightRenderer } from './HighlightRenderer'
export { EventHandler } from './EventHandler'

// 优化组件 - TypeScript
export { OptimizedFacePicker } from './OptimizedFacePicker'
export { FeatureDetector } from './FeatureDetector'
export { FeaturePool } from './FeaturePool'
export { FeatureBasedNaming } from './FeatureBasedNaming'
export { VertexBasedIdentifier } from './VertexBasedIdentifier'

// 类型导出
export type { FaceInfoExtended, IntersectOptions, GeometryCompatibility } from './RaycastManager'
export type { FaceInfoWithId, SelectionSummary, SelectionState, SelectionStats } from './SelectionManager'
export type { LogLevel, LogEntry, PerformanceMonitor } from './DebugLogger'
