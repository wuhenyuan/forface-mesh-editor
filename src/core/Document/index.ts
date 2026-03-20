import JSZip from 'jszip';
import * as THREE from 'three';
import EventManager from '../EventManager';
import ExportManager from '../ExportManager';
import ProjectManager from '../ProjectManager';
import EntityManager from './EntityManager';
import { DocumentEventBus } from './EventBus';
import { EntityPatch, EntityProps, ModelEntity } from './Entity';
import { normalizeConfig } from '../../../config/config';

export type { DocumentEventBus } from './EventBus';

export interface DocumentConfig {
  [key: string]: unknown;
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
  resource?: DocumentAssetSource;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  color?: string | number;
  textType?: string;
  content?: string;
  size?: number;
  depth?: number;
  meta?: Record<string, any>;
  boolean?: string;
}

export interface DocumentData {
  config: DocumentConfig;
  models: Map<string, DocumentModelSource>;
  previews: Map<string, Blob>;
  fonts: Map<string, DocumentFontSource>;
}

type SourceContainer = {
  source: DocumentAssetSource;
};

export default class Document {
  events: DocumentEventBus;
  entityManager: EntityManager;
  exportManager: ExportManager;
  projectManager: ProjectManager;
  private _config: DocumentConfig | null = null;
  private _models: Map<string, DocumentModelSource> = new Map();
  private _previews: Map<string, Blob> = new Map();
  private _fonts: Map<string, DocumentFontSource> = new Map();
  private _objectUrls: Map<string, string> = new Map();
  private _entitySubscriptions: Array<() => void> = [];

  constructor(options: { events?: DocumentEventBus } = {}) {
    this.events = options.events || new EventManager();
    this.entityManager = new EntityManager({ events: this.events });
    this.exportManager = new ExportManager();
    this.projectManager = new ProjectManager();

    this._bindEntityManagerEvents();

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

  private _bindEntityManagerEvents() {
    this._entitySubscriptions.push(
      this.entityManager.on('entityAdded', ({ entity, id, key }) => {
        if (!entity || entity.type !== 'model') return;
        const entry = this._modelSourceFromEntity(entity as ModelEntity);
        const modelKey = id || key || entity.id;
        this._models.set(modelKey, entry);
        this.events.emit('modelSourceAdded', { key: modelKey, entry });
      })
    );

    this._entitySubscriptions.push(
      this.entityManager.on('entityUpdated', ({ entity, id, key, patch, reload }) => {
        if (!entity || entity.type !== 'model') return;
        const entry = this._modelSourceFromEntity(entity as ModelEntity);
        const modelKey = id || key || entity.id;
        this._models.set(modelKey, entry);

        const modelPatch = this._modelPatchFromEntityPatch(patch);
        this.events.emit('modelSourceUpdated', {
          key: modelKey,
          entry,
          patch: modelPatch,
          reload,
        });
      })
    );

    this._entitySubscriptions.push(
      this.entityManager.on('entityRemoved', ({ entity, id, key }) => {
        if (!entity || entity.type !== 'model') return;
        const modelKey = id || key || entity.id;
        const entry = this._models.get(modelKey);
        this._models.delete(modelKey);
        this._revokeObjectUrlForKey('model', modelKey);
        this.events.emit('modelSourceRemoved', { key: modelKey, entry });
      })
    );
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
    this._syncEntitiesFromModels();

    console.log(
      `[Document] æ–‡æ¡£åŠ è½½å®Œæˆ: config=${!!this._config}, models=${this._models.size}, previews=${this._previews.size}`
    );

    this.events.emit('documentLoaded', {
      config: this._config,
      models: this._models,
      previews: this._previews,
      fonts: this._fonts,
    });

    this._emitEntityAddedEvents();

    return {
      config: this._config!,
      models: this._models,
      previews: this._previews,
      fonts: this._fonts,
    };
  }

  load(config: Record<string, any> = {}): DocumentData {
    this.clear();

    const normalized = this._normalizeConfigForEntities(config);
    this._config = normalized;

    const entities = this._buildEntitiesFromNormalized(normalized);

    this._models.clear();
    for (const entity of entities) {
      if (entity.type !== 'model') continue;
      const entry = this._modelSourceFromEntity(entity as ModelEntity);
      this._models.set(entity.id, entry);
    }

    this.entityManager.replaceAll(entities, { silent: true });

    this.events.emit('documentLoaded', {
      config: this._config,
      models: this._models,
      previews: this._previews,
      fonts: this._fonts,
    });

    this._emitEntityAddedEvents();

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
    targetMap: Map<string, unknown>,
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

  private _syncEntitiesFromModels() {
    const entities: ModelEntity[] = [];
    for (const [key, entry] of this._models.entries()) {
      entities.push(this._entityFromModelSource(key, entry));
    }
    this.entityManager.replaceAll(entities, { silent: true });
  }

  private _emitEntityAddedEvents() {
    for (const [id, entity] of this.entityManager.entities.entries()) {
      this.entityManager.events.emit('entityAdded', {
        id,
        key: id,
        entity,
        type: entity.type,
      });
      this.entityManager.events.emit('addEntity', {
        id,
        key: id,
        entity,
        type: entity.type,
      });
    }
  }

  private _normalizeConfigForEntities(config: Record<string, any>) {
    const source: Record<string, any> = config && typeof config === 'object' ? { ...config } : {};

    if (!Array.isArray(source.features) && Array.isArray(source.feature)) {
      source.features = source.feature;
    }

    if (Array.isArray(source.features)) {
      source.features = this._normalizeFeatureList(source.features);
    }

    return normalizeConfig(source);
  }

  private _normalizeFeatureList(features: unknown[]) {
    return features.map((feature, index) => {
      if (!feature || typeof feature !== 'object') return feature;
      const featureRecord = feature as Record<string, unknown>;
      if (featureRecord.payload && typeof featureRecord.payload === 'object') return featureRecord;

      const kind = featureRecord.kind || featureRecord.type;
      if (kind === 'model') {
        return this._normalizeModelFeature(featureRecord as Record<string, any>, index);
      }
      if (kind === 'text') {
        return this._normalizeTextFeature(featureRecord as Record<string, any>, index);
      }
      return featureRecord;
    });
  }

  private _decomposeMatrix(matrix: unknown) {
    if (!Array.isArray(matrix) || matrix.length !== 16) return null;
    const mat = new THREE.Matrix4().fromArray(matrix);
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    mat.decompose(position, quaternion, scale);
    const rotation = new THREE.Euler().setFromQuaternion(quaternion, 'XYZ');
    return {
      position: [position.x, position.y, position.z] as [number, number, number],
      rotation: [rotation.x, rotation.y, rotation.z] as [number, number, number],
      scale: [scale.x, scale.y, scale.z] as [number, number, number],
    };
  }

  private _normalizeModelFeature(feature: Record<string, any>, index: number) {
    const key =
      (typeof feature.key === 'string' && feature.key) ||
      (typeof feature.id === 'string' && feature.id) ||
      (typeof feature.meta?.type === 'string' && feature.meta.type) ||
      `model_${index + 1}`;
    const path =
      (typeof feature.url === 'string' && feature.url) ||
      (typeof feature.path === 'string' && feature.path) ||
      '';

    const transform = this._decomposeMatrix(feature.matrix);

    const config: Record<string, any> = {};
    if (transform?.position || Array.isArray(feature.position)) {
      config.position = transform?.position || feature.position;
    }
    if (transform?.scale || Array.isArray(feature.scale)) {
      config.scale = transform?.scale || feature.scale;
    }
    if (transform?.rotation || Array.isArray(feature.rotation)) {
      config.rotation = transform?.rotation || feature.rotation;
    }
    if (feature.meta !== undefined) config.meta = feature.meta;
    if (feature.boolean !== undefined) config.boolean = feature.boolean;

    return {
      kind: 'model',
      id: key,
      payload: {
        key,
        path,
        config,
      },
    };
  }

  private _normalizeTextFeature(feature: Record<string, any>, index: number) {
    const id =
      (typeof feature.id === 'string' && feature.id) ||
      (typeof feature.key === 'string' && feature.key) ||
      `text_${index + 1}`;

    const payload: Record<string, any> = {};
    const transform = this._decomposeMatrix(feature.matrix);
    if (typeof feature.text === 'string') payload.text = feature.text;
    if (typeof feature.content === 'string') payload.text = feature.content;
    if (typeof feature.textType === 'string') payload.type = feature.textType;
    if (typeof feature.effect === 'string') payload.effect = feature.effect;
    if (transform?.position || Array.isArray(feature.position)) {
      payload.position = transform?.position || feature.position;
    }
    if (transform?.rotation || Array.isArray(feature.rotate) || Array.isArray(feature.rotation)) {
      payload.rotate = transform?.rotation || feature.rotate || feature.rotation;
    }
    if (transform?.scale || Array.isArray(feature.scale)) {
      payload.scale = transform?.scale || feature.scale;
    }
    if (feature.size !== undefined) payload.size = feature.size;
    if (feature.depth !== undefined) payload.depth = feature.depth;
    if (feature.color !== undefined) payload.color = feature.color;
    if (feature.wrap !== undefined) payload.wrap = feature.wrap;
    if (feature.boolean !== undefined) payload.boolean = feature.boolean;
    if (feature.attachmentSurface !== undefined)
      payload.attachmentSurface = feature.attachmentSurface;

    return {
      kind: 'text',
      id,
      payload,
    };
  }

  private _buildEntitiesFromNormalized(config: Record<string, any>) {
    const entities: EntityProps[] = [];

    const models = config?.models && typeof config.models === 'object' ? config.models : {};
    for (const [key, model] of Object.entries(models)) {
      const modelRecord = model as Record<string, unknown>;
      const path = typeof modelRecord.path === 'string' ? modelRecord.path : '';
      if (!path) continue;

      const modelConfig =
        modelRecord.config && typeof modelRecord.config === 'object'
          ? (modelRecord.config as Record<string, unknown>)
          : {};

      const position = this._toVector3(modelConfig.position);
      const rotation = this._toVector3(modelConfig.rotation);
      const scale = this._toVector3(modelConfig.scale);
      const meta =
        modelConfig.meta && typeof modelConfig.meta === 'object'
          ? (modelConfig.meta as Record<string, any>)
          : undefined;
      const booleanOp = typeof modelConfig.boolean === 'string' ? modelConfig.boolean : undefined;

      entities.push({
        id: key,
        type: 'model',
        resource: path,
        position,
        rotation,
        scale,
        meta,
        boolean: booleanOp,
      });
    }

    const texts = Array.isArray(config?.texts) ? config.texts : [];
    for (const entry of texts) {
      if (!entry || typeof entry !== 'object') continue;
      const textEntry = entry as Record<string, unknown>;

      const id =
        (typeof textEntry.id === 'string' && textEntry.id) ||
        (typeof textEntry.index === 'string' && textEntry.index);
      if (!id) continue;

      const textMode = this._resolveTextMode(textEntry as Record<string, any>);
      const font = this._resolveTextFont(textEntry as Record<string, any>, textMode);
      const content =
        typeof textEntry.text === 'string'
          ? textEntry.text
          : typeof textEntry.content === 'string'
            ? textEntry.content
            : '';

      const position = this._toVector3(textEntry.position);
      const rotation = this._resolveTextRotation(textEntry as Record<string, any>);
      const scale = this._toVector3(textEntry.scale);
      const meta: Record<string, any> = {};
      if (textEntry.wrap !== undefined) meta.wrap = textEntry.wrap;
      if (textEntry.attachmentSurface !== undefined) {
        meta.attachmentSurface = textEntry.attachmentSurface;
      }
      if (textEntry.effect !== undefined) meta.effect = textEntry.effect;

      const size = typeof textEntry.size === 'number' ? textEntry.size : undefined;
      const depth = typeof textEntry.depth === 'number' ? textEntry.depth : undefined;
      const color =
        typeof textEntry.color === 'string' || typeof textEntry.color === 'number'
          ? textEntry.color
          : undefined;
      const booleanOp = typeof textEntry.boolean === 'string' ? textEntry.boolean : undefined;

      entities.push({
        id,
        type: 'text',
        resource: font,
        textType: textMode,
        content,
        size,
        depth,
        color,
        position,
        rotation,
        scale,
        boolean: booleanOp,
        meta: Object.keys(meta).length > 0 ? meta : undefined,
      });
    }

    return entities;
  }

  private _resolveTextMode(entry: Record<string, any>) {
    const raw =
      (typeof entry.effect === 'string' && entry.effect) ||
      (typeof entry.mode === 'string' && entry.mode) ||
      (typeof entry.textMode === 'string' && entry.textMode) ||
      (typeof entry.textType === 'string' && entry.textType) ||
      '';

    if (!raw) return undefined;
    const normalized = raw.toLowerCase();
    if (normalized === 'engraved' || normalized === 'engrave' || normalized === 'engravedtext') {
      return 'engraved';
    }
    if (normalized === 'embossed' || normalized === 'raised' || normalized === 'emboss') {
      return 'raised';
    }
    return undefined;
  }

  private _resolveTextFont(entry: Record<string, any>, textMode?: string) {
    if (typeof entry.type === 'string' && entry.type) return entry.type;
    if (typeof entry.font === 'string' && entry.font) return entry.font;

    if (typeof entry.textType === 'string' && entry.textType) {
      const candidate = entry.textType;
      if (!textMode || candidate.toLowerCase() !== textMode) {
        return candidate;
      }
    }

    return undefined;
  }

  private _resolveTextRotation(entry: Record<string, any>) {
    const fromRotate = this._toVector3(entry.rotate);
    if (fromRotate) return fromRotate;
    const fromRotation = this._toVector3(entry.rotation);
    if (fromRotation) return fromRotation;
    return undefined;
  }

  private _toVector3(value: unknown): [number, number, number] | undefined {
    if (!Array.isArray(value) || value.length < 3) return undefined;
    const [x, y, z] = value;
    if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') return undefined;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return undefined;
    return [x, y, z];
  }

  private _extractAssetSource(entry: DocumentAssetSource | SourceContainer): DocumentAssetSource {
    if (this._isSourceContainer(entry)) {
      return entry.source;
    }
    return entry as DocumentAssetSource;
  }

  private _isBlobLike(value: DocumentAssetSource): value is Blob {
    return value instanceof Blob;
  }

  private _isSourceContainer(value: unknown): value is SourceContainer {
    if (!value || typeof value !== 'object') return false;
    return 'source' in value;
  }

  private _entityFromModelSource(key: string, entry: DocumentModelSource) {
    return new ModelEntity({
      id: key,
      type: 'model',
      resource: entry.source,
      loaderOptions: entry.loaderOptions,
      visualOptions: entry.visualOptions,
      position: entry.transform?.position,
      rotation: entry.transform?.rotation,
      scale: entry.transform?.scale,
    });
  }

  private _modelSourceFromEntity(entity: ModelEntity): DocumentModelSource {
    return {
      source: entity.resource,
      loaderOptions: entity.loaderOptions,
      visualOptions: entity.visualOptions,
      transform: {
        position: entity.position,
        rotation: entity.rotation,
        scale: entity.scale,
      },
    };
  }

  private _entityPatchFromDocumentPatch(patch: DocumentEntityPatch | EntityPatch) {
    const nextPatch: EntityPatch = {};
    if (!patch) return nextPatch;

    if ((patch as EntityPatch).resource !== undefined) {
      nextPatch.resource = (patch as EntityPatch).resource;
    }
    if ((patch as DocumentEntityPatch).source !== undefined) {
      nextPatch.resource = (patch as DocumentEntityPatch).source;
    }
    if ((patch as DocumentEntityPatch).loaderOptions) {
      nextPatch.loaderOptions = (patch as DocumentEntityPatch).loaderOptions;
    }
    if ((patch as DocumentEntityPatch).visualOptions) {
      nextPatch.visualOptions = (patch as DocumentEntityPatch).visualOptions;
    }

    const transform = (patch as DocumentEntityPatch).transform;
    if (transform?.position) nextPatch.position = transform.position;
    if (transform?.rotation) nextPatch.rotation = transform.rotation;
    if (transform?.scale) nextPatch.scale = transform.scale;

    if ((patch as DocumentEntityPatch).position) {
      nextPatch.position = (patch as DocumentEntityPatch).position;
    }
    if ((patch as DocumentEntityPatch).rotation) {
      nextPatch.rotation = (patch as DocumentEntityPatch).rotation;
    }
    if ((patch as DocumentEntityPatch).scale) {
      nextPatch.scale = (patch as DocumentEntityPatch).scale;
    }

    if ((patch as DocumentEntityPatch).color !== undefined) {
      nextPatch.color = (patch as DocumentEntityPatch).color;
    }
    if ((patch as DocumentEntityPatch).textType !== undefined) {
      nextPatch.textType = (patch as DocumentEntityPatch).textType;
    }
    if ((patch as DocumentEntityPatch).content !== undefined) {
      nextPatch.content = (patch as DocumentEntityPatch).content;
    }
    if ((patch as DocumentEntityPatch).size !== undefined) {
      nextPatch.size = (patch as DocumentEntityPatch).size;
    }
    if ((patch as DocumentEntityPatch).depth !== undefined) {
      nextPatch.depth = (patch as DocumentEntityPatch).depth;
    }
    if ((patch as DocumentEntityPatch).meta !== undefined) {
      nextPatch.meta = (patch as DocumentEntityPatch).meta;
    }
    if ((patch as DocumentEntityPatch).boolean !== undefined) {
      nextPatch.boolean = (patch as DocumentEntityPatch).boolean;
    }

    return nextPatch;
  }

  private _modelPatchFromEntityPatch(patch: EntityPatch = {}): DocumentEntityPatch {
    const modelPatch: DocumentEntityPatch = {};
    if (patch.resource !== undefined) {
      modelPatch.source = patch.resource;
    }
    if ((patch as ModelEntity).loaderOptions) {
      modelPatch.loaderOptions = (patch as ModelEntity).loaderOptions;
    }
    if ((patch as ModelEntity).visualOptions) {
      modelPatch.visualOptions = (patch as ModelEntity).visualOptions;
    }

    if (patch.position || patch.rotation || patch.scale) {
      modelPatch.transform = {};
      if (patch.position) modelPatch.transform.position = patch.position;
      if (patch.rotation) modelPatch.transform.rotation = patch.rotation;
      if (patch.scale) modelPatch.transform.scale = patch.scale;
    }

    return modelPatch;
  }

  addModelSource(key: string, source: DocumentAssetSource, options: Record<string, any> = {}) {
    const entity = new ModelEntity({
      id: key,
      type: 'model',
      resource: source,
      loaderOptions: options.loaderOptions,
      visualOptions: options.visualOptions,
      position: options.transform?.position,
      rotation: options.transform?.rotation,
      scale: options.transform?.scale,
    });
    this.entityManager.addEntity(entity);
  }

  addEntity(
    keyOrEntity: string | EntityProps,
    source?: DocumentAssetSource,
    options: Record<string, any> = {}
  ) {
    if (typeof keyOrEntity === 'string') {
      return this.addModelSource(keyOrEntity, source as DocumentAssetSource, options);
    }
    return this.entityManager.addEntity(keyOrEntity);
  }

  updateEntity(key: string, patch: DocumentEntityPatch | EntityPatch = {}) {
    const entityPatch = this._entityPatchFromDocumentPatch(patch);
    return this.entityManager.updateEntity(key, entityPatch);
  }

  removeModelSource(key: string) {
    return this.entityManager.removeEntity(key);
  }

  removeEntity(key: string) {
    return this.entityManager.removeEntity(key);
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

  private _getObjectUrl<T extends DocumentAssetSource | SourceContainer>(
    source: Map<string, T>,
    fileName: string
  ): string | null {
    const entry = source.get(fileName);
    if (!entry) return null;

    const asset = this._extractAssetSource(entry);
    if (!asset) return null;
    if (typeof asset === 'string') return asset;
    if (!this._isBlobLike(asset)) return null;

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
    this.entityManager.clear({ silent: true });
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

  async exportModel(
    objects: THREE.Object3D | THREE.Object3D[],
    format: string,
    options: Record<string, any> = {}
  ) {
    return this.exportManager.export(objects, format, options);
  }

  async exportAndDownload(
    objects: THREE.Object3D | THREE.Object3D[],
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

  private async _appendAssetsToZip<T extends SourceContainer>(
    zip: JSZip,
    folderName: string,
    sourceMap: Map<string, T>
  ) {
    for (const [path, entry] of sourceMap.entries()) {
      const asset = entry.source;
      if (!asset || typeof asset === 'string') continue;
      if (!this._isBlobLike(asset)) continue;

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
    this._entitySubscriptions.forEach((off) => off());
    this._entitySubscriptions = [];
    this.events.clear();
    this.exportManager.dispose();
    this.projectManager.dispose();
  }
}
