import Document from './Document';
import EditorDocumentVisual from './EditorDocumentVisual';
import AssetsManager from './AssetsManager';
import CoreEmitter from './CoreEmitter';
import EditorSceneManager from './EditorSceneManager';
import { AddEntityCommand } from './history/AddEntityCommand';
import { UpdateEntityCommand } from './history/UpdateEntityCommand';
import { RemoveEntityCommand } from './history/RemoveEntityCommand';
import type { EntityProps } from './Document/Entity';

export type EditorCoreEvents = Record<string, any>;

export default class EditorCore {
  document: Document;
  documentVisual: EditorDocumentVisual;
  assetsManager: AssetsManager;
  emitter: CoreEmitter<EditorCoreEvents>;
  sceneManager: EditorSceneManager;

  constructor(dom: HTMLElement, options: Record<string, any> = {}) {
    const { history, ...viewerOptions } = options;
    this.emitter = new CoreEmitter<EditorCoreEvents>();
    this.assetsManager = new AssetsManager();
    this.document = new Document({ events: this.emitter });
    this.documentVisual = new EditorDocumentVisual(this.document, this.assetsManager, dom, {
      ...viewerOptions,
      events: this.emitter,
      entityHandler: {
        addEntity: (entity: EntityProps, options: Record<string, any> = {}) =>
          this.addEntity(entity, options),
        updateEntity: (id: string, patch: Record<string, any>, options: Record<string, any> = {}) =>
          this.updateEntity(id, patch, options),
        delEntity: (id: string, options: Record<string, any> = {}) => this.delEntity(id, options),
      },
    });
    this.sceneManager = new EditorSceneManager({
      viewer: this.documentVisual,
      history,
    });

    const historyManager = this.sceneManager?.history;
    if (historyManager?.setOnChange) {
      historyManager.setOnChange((snapshot: Record<string, any>) => {
        this.emitter.emit('historyChanged', snapshot);
      });
    }
  }

  async addEntity(entity: EntityProps, options: Record<string, any> = {}) {
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
    patch: Record<string, any> = {},
    options: Record<string, any> = {}
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

  async delEntity(id: string, options: Record<string, any> = {}) {
    if (!id) return false;
    const history = this.sceneManager?.history;
    if (!history) {
      return this.document.removeEntity(id);
    }
    const command = new RemoveEntityCommand(this.document, id, options);
    await history.execute(command);
    return true;
  }

  async removeEntity(id: string, options: Record<string, any> = {}) {
    return this.delEntity(id, options);
  }

  load(config: Record<string, any> = {}) {
    return this.document?.load?.(config);
  }

  async executeCommand(command: any) {
    const history = this.sceneManager?.history;
    if (history?.execute) {
      return await history.execute(command);
    }
    return await command?.execute?.();
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

  focusOn(target: any) {
    return this.documentVisual?.focusOn?.(target);
  }

  screenshot(options: Record<string, any> = {}) {
    return this.documentVisual?.screenshot?.(options);
  }

  selectText(textId: string) {
    return this.documentVisual?.selectText?.(textId);
  }

  selectObject(target: any) {
    return this.documentVisual?.select?.(target);
  }

  setObjectVisible(target: any, visible: boolean) {
    return this.documentVisual?.setObjectVisible?.(target, visible);
  }

  setObjectColor(target: any, color: string | number) {
    return this.documentVisual?.setObjectColor?.(target, color);
  }

  removeMesh(target: any) {
    return this.documentVisual?.removeMesh?.(target);
  }

  getModelById(modelId: string) {
    return this.documentVisual?.getModelById?.(modelId) || null;
  }

  setTransformMode(mode: 'translate' | 'rotate' | 'scale') {
    return this.documentVisual?.setTransformMode?.(mode);
  }

  exportScene(format: string, filename: string = 'scene', options: Record<string, any> = {}) {
    const visual: any = this.documentVisual;
    const csgGroup = visual?.csgGroup;
    const hasCSG = !!(csgGroup && csgGroup.children && csgGroup.children.length > 0);
    const model = hasCSG
      ? csgGroup
      : this.getModelById('originModel') || visual?.entityGroup || visual?.scene;
    return visual?.exportScene?.(format, filename, model, options);
  }

  exportSelected(format: string, filename: string = 'selected', options: Record<string, any> = {}) {
    return this.documentVisual?.exportSelected?.(format, filename, options);
  }

  exportMerged(format: string, filename: string = 'merged', options: Record<string, any> = {}) {
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
