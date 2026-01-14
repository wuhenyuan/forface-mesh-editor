import Document from './Document';
import EditorDocumentVisual from './EditorDocumentVisual';
import AssetsManager from './AssetsManager';
import CoreEmitter from './CoreEmitter';

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
    });
  }

  dispose() {
    this.emitter.clear();
    this.documentVisual?.dispose();
    this.document?.dispose();
    this.assetsManager?.dispose();
  }
}
