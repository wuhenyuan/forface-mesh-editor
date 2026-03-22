import Document from './Document';
import EditorDocumentVisual from './EditorDocumentVisual';
import AssetsManager from './AssetsManager';
import CoreEmitter from './CoreEmitter';
import EditorSceneManager from './EditorSceneManager';
import { AddEntityCommand } from './history/AddEntityCommand';
import { UpdateEntityCommand } from './history/UpdateEntityCommand';
import { RemoveEntityCommand } from './history/RemoveEntityCommand';
import type { EntityProps } from './Document/Entity';

export type EditorCoreEvents = Record<string, CoreValue>;
type ExecutableCommand = {
  execute?: () => CoreValue;
};
type RemoveMeshTarget = Parameters<EditorDocumentVisual['removeMesh']>[0];
type ExportSceneTarget = Parameters<EditorDocumentVisual['exportScene']>[2];

export default class EditorCore {
  document: Document;
  documentVisual: EditorDocumentVisual;
  assetsManager: AssetsManager;
  emitter: CoreEmitter<EditorCoreEvents>;
  sceneManager: EditorSceneManager;

  constructor(dom: HTMLElement, options: Record<string, CoreValue> = {}) {
    const { history, ...viewerOptions } = options;
    this.emitter = new CoreEmitter<EditorCoreEvents>();
    this.assetsManager = new AssetsManager();
    this.document = new Document({ events: this.emitter });
    this.documentVisual = new EditorDocumentVisual(this.document, this.assetsManager, dom, {
      ...viewerOptions,
      events: this.emitter,
      entityHandler: {
        addEntity: (entity: EntityProps, options: Record<string, CoreValue> = {}) =>
          this.addEntity(entity, options),
        updateEntity: (
          id: string,
          patch: Record<string, CoreValue>,
          options: Record<string, CoreValue> = {}
        ) => this.updateEntity(id, patch, options),
        delEntity: (id: string, options: Record<string, CoreValue> = {}) =>
          this.delEntity(id, options),
      },
    });
    this.sceneManager = new EditorSceneManager({
      viewer: this.documentVisual,
      history,
    });

    const historyManager = this.sceneManager?.history;
    if (historyManager?.setOnChange) {
      historyManager.setOnChange((snapshot: Record<string, CoreValue>) => {
        this.emitter.emit('historyChanged', snapshot);
      });
    }
  }

  async addEntity(entity: EntityProps, options: Record<string, CoreValue> = {}) {
    if (!entity) return null;
    const history = this.sceneManager?.history;
    if (!history) {
      return this.document.addEntity(entity);
    }
    const command = new AddEntityCommand(this.document, entity, options);
    await history.execute(command);
    return command.entityId ? this.document.entityManager.getEntity(command.entityId) : null;
  }

  async updateEntity(
    id: string,
    patch: Record<string, CoreValue> = {},
    options: Record<string, CoreValue> = {}
  ) {
    if (!id) return false;
    const history = this.sceneManager?.history;
    if (!history) {
      return this.document.updateEntity(id, patch);
    }
    const command = new UpdateEntityCommand(this.document, id, patch, options);
    await history.execute(command);
    return true;
  }

  async delEntity(id: string, options: Record<string, CoreValue> = {}) {
    if (!id) return false;
    const history = this.sceneManager?.history;
    if (!history) {
      return this.document.removeEntity(id);
    }
    const command = new RemoveEntityCommand(this.document, id, options);
    await history.execute(command);
    return true;
  }

  async removeEntity(id: string, options: Record<string, CoreValue> = {}) {
    return this.delEntity(id, options);
  }

  load(config: Record<string, CoreValue> = {}) {
    return this.document?.load?.(config);
  }

  async executeCommand(command: CoreValue) {
    const history = this.sceneManager?.history;
    if (history?.execute) {
      return await history.execute(command);
    }
    const executable = command as ExecutableCommand;
    if (typeof executable?.execute === 'function') {
      return await executable.execute();
    }
    return null;
  }

  async undo() {
    return await this.sceneManager?.history?.undo?.();
  }

  async redo() {
    return await this.sceneManager?.history?.redo?.();
  }

  getHistorySnapshot() {
    return this.sceneManager?.history?.getSnapshot?.() || null;
  }

  async setViewMode(mode: 'construct' | 'result') {
    return await this.documentVisual?.setViewMode?.(mode);
  }

  getViewMode() {
    return this.documentVisual?.getViewMode?.();
  }

  resetView() {
    return this.documentVisual?.resetView?.();
  }

  initTextSystem() {
    return this.documentVisual?.initTextSystem?.();
  }

  initObjectSelection() {
    return this.documentVisual?.initObjectSelection?.();
  }

  enableTextMode() {
    return this.documentVisual?.enableTextMode?.();
  }

  disableTextMode() {
    return this.documentVisual?.disableTextMode?.();
  }

  focusOn(target: CoreValue) {
    return this.documentVisual?.focusOn?.(target);
  }

  screenshot(options: Record<string, CoreValue> = {}) {
    return this.documentVisual?.screenshot?.(options);
  }

  selectText(textId: string) {
    return this.documentVisual?.selectText?.(textId);
  }

  selectObject(target: CoreValue) {
    return this.documentVisual?.select?.(target);
  }

  setObjectVisible(target: CoreValue, visible: boolean) {
    return this.documentVisual?.setObjectVisible?.(target, visible);
  }

  setObjectColor(target: CoreValue, color: string | number) {
    return this.documentVisual?.setObjectColor?.(target, color);
  }

  removeMesh(target: CoreValue) {
    return this.documentVisual?.removeMesh?.(target as RemoveMeshTarget);
  }

  getModelById(modelId: string) {
    return this.documentVisual?.getModelById?.(modelId) || null;
  }

  setTransformMode(mode: 'translate' | 'rotate' | 'scale') {
    return this.documentVisual?.setTransformMode?.(mode);
  }

  exportScene(format: string, filename: string = 'scene', options: Record<string, CoreValue> = {}) {
    const visual = this.documentVisual;
    const csgGroup = visual?.csgGroup as { children?: CoreValue[] } | null | undefined;
    const hasCSG = Array.isArray(csgGroup?.children) && csgGroup.children.length > 0;
    const model = hasCSG
      ? csgGroup
      : this.getModelById('originModel') ||
        (visual?.entityGroup as CoreValue) ||
        (visual?.scene as CoreValue);
    return visual?.exportScene?.(format, filename, model as ExportSceneTarget, options);
  }

  exportSelected(
    format: string,
    filename: string = 'selected',
    options: Record<string, CoreValue> = {}
  ) {
    return this.documentVisual?.exportSelected?.(format, filename, options);
  }

  exportMerged(
    format: string,
    filename: string = 'merged',
    options: Record<string, CoreValue> = {}
  ) {
    return this.documentVisual?.exportMerged?.(format, filename, options);
  }

  getConfig() {
    return this.document?.config || null;
  }

  getProjectData() {
    return this.document?.projectManager?.getProjectData?.() || null;
  }

  dispose() {
    this.emitter.clear();
    this.sceneManager?.history?.setOnChange?.(null);
    this.sceneManager?.dispose();
    this.documentVisual?.dispose();
    this.document?.dispose();
    this.assetsManager?.dispose();
  }
}
