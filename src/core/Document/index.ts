import JSZip from 'jszip';
import EventManager from '../EventManager';
import ExportManager from '../ExportManager';
import ProjectManager from '../ProjectManager';

export interface DocumentConfig {
  [key: string]: any;
}

export type DocumentAssetSource = Blob | File | string;

export interface DocumentModelSource {
  source: DocumentAssetSource;
  loaderOptions?: Record<string, any>;
  visualOptions?: Record<string, any>;
  transform?: DocumentTransform;
}

export interface DocumentFontSource {
  source: DocumentAssetSource;
}

export interface DocumentTransform {
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
}

export interface DocumentEntityPatch {
  source?: DocumentAssetSource;
  loaderOptions?: Record<string, any>;
  visualOptions?: Record<string, any>;
  transform?: DocumentTransform;
}

export interface DocumentEventBus {
  on: (event: string, callback: (...args: any[]) => void) => () => void;
  once: (event: string, callback: (...args: any[]) => void) => () => void;
  off: (event: string, callback?: (...args: any[]) => void) => void;
  emit: (event: string, data?: any) => void;
  onAny: (callback: (event: string, data?: any) => void) => () => void;
  clear: () => void;
}

export interface DocumentData {
  config: DocumentConfig;
  models: Map<string, DocumentModelSource>;
  previews: Map<string, Blob>;
  fonts: Map<string, DocumentFontSource>;
}

export default class Document {
  events: DocumentEventBus;
  exportManager: ExportManager;
  projectManager: ProjectManager;
  private _config: DocumentConfig | null = null;
  private _models: Map<string, DocumentModelSource> = new Map();
  private _previews: Map<string, Blob> = new Map();
  private _fonts: Map<string, DocumentFontSource> = new Map();
  private _objectUrls: Map<string, string> = new Map();

  constructor(options: { events?: DocumentEventBus } = {}) {
    this.events = options.events || new EventManager();
    this.exportManager = new ExportManager();
    this.projectManager = new ProjectManager();

    this.exportManager.onProgress = (progress) => {
      this.events.emit('exportProgress', progress);
    };
    this.exportManager.onError = (error) => {
      this.events.emit('exportError', { error });
    };

    this.projectManager.onChange = (event) => {
      this.events.emit('projectChanged', event);
    };
    this.projectManager.onSave = (event) => {
      this.events.emit('projectSaved', event);
    };
    this.projectManager.onLoad = (event) => {
      this.events.emit('projectLoaded', event);
    };
  }

  get config(): DocumentConfig | null {
    return this._config;
  }

  get models(): Map<string, DocumentModelSource> {
    return this._models;
  }

  get previews(): Map<string, Blob> {
    return this._previews;
  }

  get fonts(): Map<string, DocumentFontSource> {
    return this._fonts;
  }

  /**
   * åŠ è½½æ–‡æ¡£ zip åŒ?
   * zip åŒ…ç»“æž?
   * - config.json (é…ç½®æ–‡ä»¶)
   * - model/ (æ¨¡åž‹æ–‡ä»¶å¤?
   * - preview/ (é¢„è§ˆæ–‡ä»¶å¤?
   * @param source - zip æ–‡ä»¶çš?URLã€File å¯¹è±¡æˆ?ArrayBuffer
   */
  async loadDocument(source: string | File | ArrayBuffer): Promise<DocumentData> {
    let zipData: ArrayBuffer | Blob;
    if (typeof source === 'string') {
      const response = await fetch(source);
      if (!response.ok) {
        throw new Error(`Failed to fetch document: ${response.statusText}`);
      }
      zipData = await response.arrayBuffer();
    } else {
      zipData = source;
    }

    const zip = await JSZip.loadAsync(zipData);

    this.clear();

    await this._loadConfig(zip);
    await this._loadFolder(zip, 'model', this._models, true);
    await this._loadFolder(zip, 'preview', this._previews, false);
    await this._loadFolder(zip, 'font', this._fonts, true);
    await this._loadFolder(zip, 'fonts', this._fonts, true);

    console.log(
      `[Document] æ–‡æ¡£åŠ è½½å®Œæˆ: config=${!!this._config}, models=${this._models.size}, previews=${this._previews.size}`
    );

    this.events.emit('documentLoaded', {
      config: this._config,
      models: this._models,
      previews: this._previews,
      fonts: this._fonts,
    });

    return {
      config: this._config!,
      models: this._models,
      previews: this._previews,
      fonts: this._fonts,
    };
  }

  private async _loadConfig(zip: JSZip): Promise<void> {
    const configFile = zip.file('config.json');
    if (!configFile) {
      throw new Error('ZIP åŒ…ä¸­æœªæ‰¾åˆ?config.json');
    }
    const jsonText = await configFile.async('string');
    this._config = JSON.parse(jsonText);
  }

  private async _loadFolder(
    zip: JSZip,
    folderName: string,
    targetMap: Map<string, any>,
    wrapSource: boolean
  ): Promise<void> {
    const folderPrefix = `${folderName}/`;

    for (const [path, entry] of Object.entries(zip.files)) {
      if (entry.dir || !path.startsWith(folderPrefix)) continue;

      const fileName = path.slice(folderPrefix.length);
      if (!fileName) continue;

      const relativePath = `./${path}`; // ./model/obj.stl æ ¼å¼
      const blob = await entry.async('blob');
      if (wrapSource) {
        targetMap.set(relativePath, { source: blob });
      } else {
        targetMap.set(relativePath, blob);
      }
    }
  }

  addModelSource(key: string, source: DocumentAssetSource, options: Record<string, any> = {}) {
    const entry: DocumentModelSource = {
      source,
      loaderOptions: options.loaderOptions,
      visualOptions: options.visualOptions,
      transform: options.transform,
    };
    this._models.set(key, entry);
    this.events.emit('modelSourceAdded', { key, entry });
    this.events.emit('entityAdded', { key, entry, type: 'model' });
  }

  addEntity(key: string, source: DocumentAssetSource, options: Record<string, any> = {}) {
    return this.addModelSource(key, source, options);
  }

  updateEntity(key: string, patch: DocumentEntityPatch = {}) {
    const entry = this._models.get(key);
    if (!entry) return false;

    if (patch.source !== undefined) entry.source = patch.source;
    if (patch.loaderOptions) {
      entry.loaderOptions = { ...(entry.loaderOptions || {}), ...patch.loaderOptions };
    }
    if (patch.visualOptions) {
      entry.visualOptions = { ...(entry.visualOptions || {}), ...patch.visualOptions };
    }
    if (patch.transform) {
      entry.transform = { ...(entry.transform || {}), ...patch.transform };
    }

    const reload = patch.source !== undefined || !!patch.loaderOptions;

    this.events.emit('modelSourceUpdated', { key, entry, patch, reload });
    this.events.emit('entityUpdated', { key, entry, patch, reload, type: 'model' });

    return true;
  }

  removeModelSource(key: string) {
    const entry = this._models.get(key);
    if (!entry) return false;
    this._models.delete(key);
    this._revokeObjectUrlForKey('model', key);
    this.events.emit('modelSourceRemoved', { key, entry });
    this.events.emit('entityRemoved', { key, entry, type: 'model' });
    return true;
  }

  removeEntity(key: string) {
    return this.removeModelSource(key);
  }

  addFontSource(key: string, source: DocumentAssetSource) {
    const entry: DocumentFontSource = { source };
    this._fonts.set(key, entry);
    this.events.emit('fontSourceAdded', { key, entry });
  }

  removeFontSource(key: string) {
    const entry = this._fonts.get(key);
    if (!entry) return false;
    this._fonts.delete(key);
    this._revokeObjectUrlForKey('font', key);
    this.events.emit('fontSourceRemoved', { key, entry });
    return true;
  }

  getModelUrl(fileName: string): string | null {
    return this._getObjectUrl(this._models, fileName);
  }

  getPreviewUrl(fileName: string): string | null {
    return this._getObjectUrl(this._previews, fileName);
  }

  getFontUrl(fileName: string): string | null {
    return this._getObjectUrl(this._fonts, fileName);
  }

  private _getObjectUrl(source: Map<string, any>, fileName: string): string | null {
    const entry = source.get(fileName);
    if (!entry) return null;

    const asset = entry?.source ?? entry;
    if (!asset) return null;
    if (typeof asset === 'string') return asset;

    const prefix =
      source === this._models
        ? 'model'
        : source === this._previews
          ? 'preview'
          : source === this._fonts
            ? 'font'
            : 'asset';
    const cacheKey = `${prefix}/${fileName}`;
    if (!this._objectUrls.has(cacheKey)) {
      this._objectUrls.set(cacheKey, URL.createObjectURL(asset));
    }
    return this._objectUrls.get(cacheKey)!;
  }

  clear() {
    this._cleanup();
    this.events.emit('documentCleared');
  }

  private _cleanup(): void {
    for (const url of this._objectUrls.values()) {
      URL.revokeObjectURL(url);
    }
    this._objectUrls.clear();
    this._models.clear();
    this._previews.clear();
    this._fonts.clear();
    this._config = null;
  }

  private _revokeObjectUrlForKey(prefix: string, fileName: string) {
    const cacheKey = `${prefix}/${fileName}`;
    const url = this._objectUrls.get(cacheKey);
    if (!url) return;
    try {
      URL.revokeObjectURL(url);
    } catch (_) {
      // ignore
    }
    this._objectUrls.delete(cacheKey);
  }

  async exportDocument(options: Record<string, any> = {}) {
    const {
      filename = 'document',
      includeModels = true,
      includePreviews = true,
      includeFonts = true,
      download = false,
    } = options;

    const zip = new JSZip();

    if (this._config) {
      zip.file('config.json', JSON.stringify(this._config, null, 2));
    }

    if (includeModels) {
      await this._appendAssetsToZip(zip, 'model', this._models);
    }

    if (includePreviews) {
      await this._appendBlobsToZip(zip, 'preview', this._previews);
    }

    if (includeFonts) {
      await this._appendAssetsToZip(zip, 'font', this._fonts);
    }

    const blob = await zip.generateAsync({ type: 'blob' });

    if (download) {
      this._downloadBlob(blob, `${filename}.zip`);
      return null;
    }

    return blob;
  }

  async exportModel(objects: any, format: string, options: Record<string, any> = {}) {
    return this.exportManager.export(objects, format, options);
  }

  async exportAndDownload(
    objects: any,
    format: string,
    filename: string = 'model',
    options: Record<string, any> = {}
  ) {
    await this.exportManager.exportAndDownload(objects, format, filename, options);
    this.events.emit('modelExported', { format, filename });
  }

  getExportManager() {
    return this.exportManager;
  }

  getProjectManager() {
    return this.projectManager;
  }

  createProject(options: Record<string, any> = {}) {
    return this.projectManager.createProject(options);
  }

  saveProject(key?: string) {
    return this.projectManager.saveToLocal(key);
  }

  loadProject(key = 'editor_project') {
    return this.projectManager.loadFromLocal(key);
  }

  exportProjectFile(filename?: string) {
    return this.projectManager.exportProjectFile(filename);
  }

  async exportProjectPackage(filename: string, options: Record<string, any> = {}) {
    return await this.projectManager.exportProjectPackage({
      filename,
      ...options,
    });
  }

  async exportLocalFullPackage(filename: string, options: Record<string, any> = {}) {
    return await this.projectManager.exportLocalFullPackage({
      filename,
      ...options,
    });
  }

  async importProjectFile(file: File) {
    return await this.projectManager.importProjectFile(file);
  }

  getLocalProjectList() {
    return this.projectManager.getLocalProjectList();
  }

  deleteLocalProject(key: string) {
    return this.projectManager.deleteLocalProject(key);
  }

  getProjectName() {
    return this.projectManager.getProjectName();
  }

  setProjectName(name: string) {
    return this.projectManager.setProjectName(name);
  }

  isProjectDirty() {
    return this.projectManager.isDirty();
  }

  private async _appendAssetsToZip(zip: JSZip, folderName: string, sourceMap: Map<string, any>) {
    for (const [path, entry] of sourceMap.entries()) {
      const asset = entry?.source ?? entry;
      if (!asset || typeof asset === 'string') continue;

      const normalized = this._normalizeAssetPath(path);
      const basePath = normalized.startsWith(`${folderName}/`)
        ? normalized.slice(folderName.length + 1)
        : normalized;
      const zipPath = `${folderName}/${basePath}`;
      zip.file(zipPath, asset);
    }
  }

  private async _appendBlobsToZip(zip: JSZip, folderName: string, sourceMap: Map<string, Blob>) {
    for (const [path, blob] of sourceMap.entries()) {
      if (!blob) continue;
      const normalized = this._normalizeAssetPath(path);
      const basePath = normalized.startsWith(`${folderName}/`)
        ? normalized.slice(folderName.length + 1)
        : normalized;
      const zipPath = `${folderName}/${basePath}`;
      zip.file(zipPath, blob);
    }
  }

  private _normalizeAssetPath(path: string) {
    if (!path) return '';
    return path.replace(/^[.\\/]+/, '').replace(/\\/g, '/');
  }

  private _downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  dispose(): void {
    this.clear();
    this.events.clear();
    this.exportManager.dispose();
    this.projectManager.dispose();
  }
}
