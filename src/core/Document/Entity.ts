export type EntityType = 'model' | 'text';

export type EntityColor = string | number;

export type EntityVector3 = [number, number, number];

export type EntityResource = Blob | File | string;

export type BooleanType = 'none' | 'subtract' | 'union';

export interface BaseEntityProps {
  id?: string;
  type: EntityType;
  resource?: EntityResource;
  position?: EntityVector3;
  rotation?: EntityVector3;
  scale?: EntityVector3;
  color?: EntityColor;
  booleanType?: BooleanType;
  meta?: Record<string, any>;
}

export interface ModelEntityProps extends BaseEntityProps {
  type: 'model';
  resource: EntityResource;
}

export interface TextEntityProps extends BaseEntityProps {
  type: 'text';
  resource?: EntityResource;
  fontType?: string;
  text?: string;
  size?: number;
  depth?: number;
}

export type EntityProps = ModelEntityProps | TextEntityProps;
export type EntityPatch = Partial<EntityProps>;

export function generateEntityId() {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export class Entity {
  id: string;
  type: EntityType;
  resource?: EntityResource;
  position: EntityVector3;
  rotation: EntityVector3;
  scale: EntityVector3;
  color: EntityColor;
  booleanType: BooleanType;
  meta?: Record<string, any>;

  constructor(props: BaseEntityProps) {
    this.id = props.id || generateEntityId();
    this.type = props.type;
    this.resource = props.resource;
    this.position = props.position || [0, 0, 0];
    this.rotation = props.rotation || [0, 0, 0];
    this.scale = props.scale || [1, 1, 1];
    this.color = props.color ?? 0x409eff;
    this.booleanType = props.booleanType || 'none';
    this.meta = props.meta;
  }

  update(patch: EntityPatch) {
    Object.assign(this, patch);
  }

  toJSON(): Record<string, any> {
    return {
      id: this.id,
      type: this.type,
      resource: this.resource,
      position: this.position,
      rotation: this.rotation,
      scale: this.scale,
      color: this.color,
      booleanType: this.booleanType,
      meta: this.meta,
    };
  }
}

export class ModelEntity extends Entity {
  type: 'model' = 'model';
  declare resource: EntityResource;

  constructor(props: ModelEntityProps) {
    super(props);
    this.resource = props.resource;
  }

  toJSON(): Record<string, any> {
    return {
      ...super.toJSON(),
    };
  }
}

export class TextEntity extends Entity {
  type: 'text' = 'text';
  fontType: string;
  text: string;
  size: number;
  depth: number;

  constructor(props: TextEntityProps) {
    super(props);
    this.fontType = props.fontType || 'helvetiker';
    this.text = props.text || '';
    this.size = props.size ?? 3;
    this.depth = props.depth ?? 0.5;
  }

  toJSON(): Record<string, any> {
    return {
      ...super.toJSON(),
      fontType: this.fontType,
      text: this.text,
      size: this.size,
      depth: this.depth,
    };
  }
}
