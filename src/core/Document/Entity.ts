export type EntityType = 'model' | 'text';

export type EntityColor = string | number;

export type EntityVector3 = [number, number, number];

export type EntityResource = Blob | File | string;

export interface BaseEntityProps {
  id?: string;
  type: EntityType;
  resource?: EntityResource;
  position?: EntityVector3;
  rotation?: EntityVector3;
  scale?: EntityVector3;
  color?: EntityColor;
  meta?: Record<string, any>;
  boolean?: string;
}

export interface ModelEntityProps extends BaseEntityProps {
  type: 'model';
  resource: EntityResource;
  loaderOptions?: Record<string, any>;
  visualOptions?: Record<string, any>;
}

export interface TextEntityProps extends BaseEntityProps {
  type: 'text';
  resource?: EntityResource;
  textType?: string;
  content?: string;
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
  position?: EntityVector3;
  rotation?: EntityVector3;
  scale?: EntityVector3;
  color?: EntityColor;
  meta?: Record<string, any>;
  boolean?: string;

  constructor(props: BaseEntityProps) {
    this.id = props.id || generateEntityId();
    this.type = props.type;
    this.resource = props.resource;
    this.position = props.position;
    this.rotation = props.rotation;
    this.scale = props.scale;
    this.color = props.color;
    this.meta = props.meta;
    this.boolean = props.boolean;
  }

  update(patch: EntityPatch) {
    Object.assign(this, patch);
  }
}

export class ModelEntity extends Entity {
  type: 'model';
  resource: EntityResource;
  loaderOptions?: Record<string, any>;
  visualOptions?: Record<string, any>;

  constructor(props: ModelEntityProps) {
    super(props);
    this.type = 'model';
    this.resource = props.resource;
    this.loaderOptions = props.loaderOptions;
    this.visualOptions = props.visualOptions;
  }
}

export class TextEntity extends Entity {
  type: 'text';
  textType?: string;
  content?: string;
  size?: number;
  depth?: number;

  constructor(props: TextEntityProps) {
    super(props);
    this.type = 'text';
    this.textType = props.textType;
    this.content = props.content;
    this.size = props.size;
    this.depth = props.depth;
  }
}
