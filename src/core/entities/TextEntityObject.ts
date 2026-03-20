import EntityObject, { EntityLike } from './EntityObject';

export class TextEntityObject extends EntityObject {
  constructor(entityId: string, entity: EntityLike | null = null) {
    super(entityId, entity);
    this.name = `TextEntityObject:${entityId}`;
    this.userData = {
      ...(this.userData || {}),
      isTextEntityObject: true,
    };
  }

  override setEntity(entity: EntityLike | null) {
    super.setEntity(entity);
    this.userData = {
      ...(this.userData || {}),
      isTextEntityObject: true,
    };
    return this;
  }

  getContent(defaultValue = '') {
    const content = this.entity?.content;
    return typeof content === 'string' ? content : defaultValue;
  }

  buildConfigFromEntity(entity: EntityLike | null = this.entity) {
    const source: EntityLike = entity || this.entity || {};
    const config: Record<string, any> = {};
    if (source.resource !== undefined) config.font = source.resource;
    if (source.size !== undefined) config.size = source.size;
    if (source.depth !== undefined) config.thickness = source.depth;
    if (source.color !== undefined) config.color = source.color;
    if (source.direction !== undefined) config.direction = source.direction;
    if (source.letterSpacing !== undefined) config.letterSpacing = source.letterSpacing;
    if (source.curvingStrength !== undefined) config.curvingStrength = source.curvingStrength;
    if (source.startAngle !== undefined) config.startAngle = source.startAngle;
    return config;
  }

  buildCreateOptions(entity: EntityLike | null = this.entity) {
    const source: EntityLike = entity || this.entity || {};
    const options: Record<string, any> = {};
    const id = source.id || this.entityId;
    if (id) {
      options.id = id;
    }
    const config = this.buildConfigFromEntity(source);
    if (Object.keys(config).length > 0) {
      options.config = config;
    }
    const transform = this.getTransformFromEntity(source);
    if (transform) {
      options.transform = transform;
    }
    return options;
  }

  buildTransformPatch(entity: EntityLike | null = this.entity) {
    const source: EntityLike = entity || this.entity || {};
    const patch: Record<string, any> = {};
    const transform = this.getTransformFromEntity(source);
    if (transform?.position) patch.position = transform.position;
    if (transform?.rotation) patch.rotation = transform.rotation;
    if (transform?.scale) patch.scale = transform.scale;
    if (source.textType !== undefined) patch.textType = source.textType;
    return Object.keys(patch).length > 0 ? patch : null;
  }
}

export default TextEntityObject;
