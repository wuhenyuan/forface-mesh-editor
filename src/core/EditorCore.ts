import Document from './Document';
import EditorDocumentVisual from './EditorDocumentVisual';
import AssetsManager from './AssetsManager';
import CoreEmitter from './CoreEmitter';
import type { EntityProps } from './Document/Entity';

export type EditorCoreEvents = Record<string, any>;

export default class EditorCore {
  document: Document;
  documentVisual: EditorDocumentVisual;
  assetsManager: AssetsManager;
  emitter: CoreEmitter<EditorCoreEvents>;

  constructor(dom: HTMLElement, options: Record<string, any> = {}) {
    this.emitter = new CoreEmitter<EditorCoreEvents>();
    this.assetsManager = new AssetsManager();
    this.document = new Document({ events: this.emitter });
    this.documentVisual = new EditorDocumentVisual(this.document, this.assetsManager, dom, {
      ...options,
      events: this.emitter,
      entityHandler: {
        addEntity: (entity: EntityProps, opts: Record<string, any> = {}) =>
          this.addEntity(entity, opts),
        updateEntity: (id: string, patch: Record<string, any>, opts: Record<string, any> = {}) =>
          this.updateEntity(id, patch, opts),
        delEntity: (id: string, opts: Record<string, any> = {}) => this.delEntity(id, opts),
      },
    });
  }

  async addEntity(entity: EntityProps, _options: Record<string, any> = {}) {
    if (!entity) return null;
    return this.document.addEntity(entity);
  }

  async updateEntity(
    id: string,
    patch: Record<string, any> = {},
    _options: Record<string, any> = {}
  ) {
    if (!id) return false;
    return this.document.updateEntity(id, patch);
  }

  async delEntity(id: string, _options: Record<string, any> = {}) {
    if (!id) return false;
    return this.document.removeEntity(id);
  }

  async removeEntity(id: string, options: Record<string, any> = {}) {
    return this.delEntity(id, options);
  }

  load(config: Record<string, any> = {}) {
    return this.document?.load?.(config);
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

  focusOn(target: any) {
    return this.documentVisual?.focusOn?.(target);
  }

  screenshot(options: Record<string, any> = {}) {
    return this.documentVisual?.screenshot?.(options);
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
    this.documentVisual?.dispose();
    this.document?.dispose();
    this.assetsManager?.dispose();
  }
}
