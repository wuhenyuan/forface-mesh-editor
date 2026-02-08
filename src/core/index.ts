/**
 * Core 模块导出
 */
export { Viewer } from './Viewer';
export { EditorViewer } from './EditorViewer';
export { default as EditorCore } from './EditorCore';
export type { EditorCoreEvents } from './EditorCore';
export { default as Document } from './Document';
export { EditorDocumentVisual } from './EditorDocumentVisual';
export { AssetsManager } from './AssetsManager';
export { EventManager } from './EventManager';
export { LoaderManager } from './LoaderManager';
export { ExportManager } from './ExportManager';
export { ProjectManager } from './ProjectManager';
export { default as CoreEmitter } from './CoreEmitter';

// 新架构模块
export { Editor } from './Editor';
export * from './Document/Entity';
export * from './Document/EntityManager';
export * from './visual';
export * from './boolean';
export * from './text';
export * from './interaction';
