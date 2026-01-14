import Document from './Document';
import EditorDocumentVisual from './EditorDocumentVisual';
import AssetsManager from './AssetsManager';

export default class EditorCore {
  document: Document;
  documentVisual: EditorDocumentVisual;
  assetsManager: AssetsManager;

  constructor(dom: HTMLElement, options: Record<string, any> = {}) {
    this.assetsManager = new AssetsManager();
    this.document = new Document();
    this.documentVisual = new EditorDocumentVisual(
      this.document,
      this.assetsManager,
      dom,
      options
    );
  }

  dispose() {
    this.documentVisual?.dispose();
    this.document?.dispose();
    this.assetsManager?.dispose();
  }
}
