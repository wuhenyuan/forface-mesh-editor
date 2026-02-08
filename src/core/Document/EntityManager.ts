import { Entity, EntityPatch, EntityProps, EntityType, ModelEntity, TextEntity } from './Entity';

export interface EntityEventPayload {
  id: string;
  type: EntityType;
  entity: Entity;
}

export interface EntityUpdatedPayload extends EntityEventPayload {
  patch: EntityPatch;
}

type EventCallback = (payload: any) => void;

/**
 * 实体管理器
 * 职责：管理所有实体数据，提供 CRUD 接口，发送变更事件
 */
export class EntityManager {
  private _entities: Map<string, Entity>;
  private _listeners: Map<string, Set<EventCallback>>;

  constructor() {
    this._entities = new Map();
    this._listeners = new Map();
  }

  get entities(): Map<string, Entity> {
    return this._entities;
  }

  /**
   * 获取实体
   */
  getEntity(id: string): Entity | null {
    return this._entities.get(id) || null;
  }

  /**
   * 获取所有实体
   */
  getAllEntities(): Entity[] {
    return Array.from(this._entities.values());
  }

  /**
   * 按类型获取实体
   */
  getEntitiesByType(type: EntityType): Entity[] {
    return this.getAllEntities().filter((e) => e.type === type);
  }

  /**
   * 添加实体
   */
  addEntity(entityOrProps: Entity | EntityProps): Entity {
    const entity = this._normalizeEntity(entityOrProps);
    this._entities.set(entity.id, entity);

    this._emit('entityAdded', {
      id: entity.id,
      type: entity.type,
      entity,
    });

    return entity;
  }

  /**
   * 更新实体
   */
  updateEntity(id: string, patch: EntityPatch = {}): boolean {
    const entity = this._entities.get(id);
    if (!entity) return false;

    entity.update(patch);

    this._emit('entityUpdated', {
      id,
      type: entity.type,
      entity,
      patch,
    });

    return true;
  }

  /**
   * 删除实体
   */
  delEntity(id: string): boolean {
    const entity = this._entities.get(id);
    if (!entity) return false;

    this._entities.delete(id);

    this._emit('entityRemoved', {
      id,
      type: entity.type,
      entity,
    });

    return true;
  }

  /**
   * 清空所有实体
   */
  clear(): void {
    const entities = this.getAllEntities();
    this._entities.clear();

    entities.forEach((entity) => {
      this._emit('entityRemoved', {
        id: entity.id,
        type: entity.type,
        entity,
      });
    });
  }

  /**
   * 监听事件
   */
  on(event: 'entityAdded' | 'entityUpdated' | 'entityRemoved', callback: EventCallback): void {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event)!.add(callback);
  }

  /**
   * 移除监听
   */
  off(event: string, callback: EventCallback): void {
    this._listeners.get(event)?.delete(callback);
  }

  /**
   * 发出事件
   */
  private _emit(event: string, payload: any): void {
    this._listeners.get(event)?.forEach((cb) => {
      try {
        cb(payload);
      } catch (e) {
        console.error(`[EntityManager] Error in ${event} callback:`, e);
      }
    });
  }

  /**
   * 标准化实体
   */
  private _normalizeEntity(entityOrProps: Entity | EntityProps): Entity {
    if (entityOrProps instanceof Entity) {
      return entityOrProps;
    }

    if (entityOrProps.type === 'text') {
      return new TextEntity(entityOrProps);
    }

    return new ModelEntity(entityOrProps);
  }

  /**
   * 导出所有实体数据
   */
  toJSON(): Record<string, any>[] {
    return this.getAllEntities().map((e) => e.toJSON());
  }
}

export default EntityManager;
