import EventManager from '../EventManager';
import { DocumentEventBus } from './EventBus';
import { Entity, EntityPatch, EntityProps, EntityType, ModelEntity, TextEntity } from './Entity';

export interface EntityEventPayload {
  id: string;
  key: string;
  type: EntityType;
  entity: Entity;
}

export interface EntityUpdatedPayload extends EntityEventPayload {
  patch: EntityPatch;
  reload: boolean;
}

export class EntityManager {
  events: DocumentEventBus;
  private _entities: Map<string, Entity>;

  constructor(options: { events?: DocumentEventBus } = {}) {
    this.events = options.events || new EventManager();
    this._entities = new Map();
  }

  get entities() {
    return this._entities;
  }

  getEntity(id: string) {
    return this._entities.get(id) || null;
  }

  getEntitiesByType(type: EntityType) {
    const result = new Map<string, Entity>();
    for (const [id, entity] of this._entities.entries()) {
      if (entity.type === type) {
        result.set(id, entity);
      }
    }
    return result;
  }

  addEntity(entityOrProps: Entity | EntityProps, options: { silent?: boolean } = {}) {
    const entity = this._normalizeEntity(entityOrProps);
    this._entities.set(entity.id, entity);
    if (!options.silent) {
      this.events.emit('entityAdded', {
        id: entity.id,
        key: entity.id,
        entity,
        type: entity.type,
      });
      this.events.emit('addEntity', {
        id: entity.id,
        key: entity.id,
        entity,
        type: entity.type,
      });
    }
    return entity;
  }

  updateEntity(id: string, patch: EntityPatch = {}, options: { silent?: boolean } = {}) {
    const entity = this._entities.get(id);
    if (!entity) return false;

    const nextPatch = this._normalizePatch(entity, patch);
    entity.update(nextPatch);

    const reload =
      entity.type === 'model' &&
      (nextPatch.resource !== undefined || (nextPatch as ModelEntity).loaderOptions !== undefined);

    if (!options.silent) {
      this.events.emit('entityUpdated', {
        id,
        key: id,
        entity,
        patch: nextPatch,
        reload,
        type: entity.type,
      });
      this.events.emit('updateEntity', {
        id,
        key: id,
        entity,
        patch: nextPatch,
        reload,
        type: entity.type,
      });
    }
    return true;
  }

  removeEntity(id: string, options: { silent?: boolean } = {}) {
    const entity = this._entities.get(id);
    if (!entity) return false;

    this._entities.delete(id);
    if (!options.silent) {
      this.events.emit('entityRemoved', {
        id,
        key: id,
        entity,
        type: entity.type,
      });
      this.events.emit('delEntity', {
        id,
        key: id,
        entity,
        type: entity.type,
      });
    }
    return true;
  }

  delEntity(id: string, options: { silent?: boolean } = {}) {
    return this.removeEntity(id, options);
  }

  clear(options: { silent?: boolean } = {}) {
    if (!options.silent) {
      for (const [id, entity] of this._entities.entries()) {
        this.events.emit('entityRemoved', {
          id,
          key: id,
          entity,
          type: entity.type,
        });
        this.events.emit('delEntity', {
          id,
          key: id,
          entity,
          type: entity.type,
        });
      }
    }
    this._entities.clear();
  }

  replaceAll(entities: Array<Entity | EntityProps>, options: { silent?: boolean } = {}) {
    const silent = !!options.silent;
    this.clear({ silent: true });
    for (const entity of entities) {
      this.addEntity(entity, { silent: true });
    }
    if (!silent) {
      for (const [id, entity] of this._entities.entries()) {
        this.events.emit('entityAdded', {
          id,
          key: id,
          entity,
          type: entity.type,
        });
        this.events.emit('addEntity', {
          id,
          key: id,
          entity,
          type: entity.type,
        });
      }
    }
  }

  on(event: string, callback: (...args: CoreValue[]) => void) {
    return this.events.on(event, callback);
  }

  once(event: string, callback: (...args: CoreValue[]) => void) {
    return this.events.once(event, callback);
  }

  off(event: string, callback?: (...args: CoreValue[]) => void) {
    return this.events.off(event, callback);
  }

  onAny(callback: (event: string, data?: CoreValue) => void) {
    return this.events.onAny(callback);
  }

  private _normalizeEntity(entityOrProps: Entity | EntityProps) {
    if (entityOrProps instanceof Entity) {
      return entityOrProps;
    }

    if (entityOrProps.type === 'text') {
      return new TextEntity(entityOrProps);
    }

    return new ModelEntity(entityOrProps);
  }

  private _normalizePatch(entity: Entity, patch: EntityPatch) {
    if (entity.type !== 'model') {
      return patch;
    }

    const model = entity as ModelEntity;
    const nextPatch: EntityPatch = { ...patch };

    if ((patch as ModelEntity).loaderOptions) {
      nextPatch.loaderOptions = {
        ...(model.loaderOptions || {}),
        ...(patch as ModelEntity).loaderOptions,
      };
    }

    if ((patch as ModelEntity).visualOptions) {
      nextPatch.visualOptions = {
        ...(model.visualOptions || {}),
        ...(patch as ModelEntity).visualOptions,
      };
    }

    return nextPatch;
  }
}

export default EntityManager;
