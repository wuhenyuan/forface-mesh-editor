import { ModelBooleanOp, normalizeModelBooleanOp } from '../csg/ModelCSG';
import EntityObject, { EntityLike, EntityTransform } from './EntityObject';

type ModelEntityPatchOptions = {
  baseTransform?: EntityTransform | null;
  entity?: EntityLike | null;
};

export class ModelEntityObject extends EntityObject {
  booleanOp: ModelBooleanOp;

  constructor(entityId: string, entity: EntityLike | null = null) {
    super(entityId, entity);
    this.name = `ModelEntityObject:${entityId}`;
    this.booleanOp = 'union';
    this.userData = {
      ...(this.userData || {}),
      isModelEntityObject: true,
      booleanOp: this.booleanOp,
    };

    if (entity) {
      this.setEntity(entity);
    }
  }

  override setEntity(entity: EntityLike | null) {
    super.setEntity(entity);
    this.userData = {
      ...(this.userData || {}),
      isModelEntityObject: true,
    };
    if (entity && entity.boolean !== undefined) {
      this.setBooleanOp(entity.boolean);
    }
    return this;
  }

  setBooleanOp(value: unknown) {
    const next = normalizeModelBooleanOp(value) || 'union';
    this.booleanOp = next;
    this.userData = {
      ...(this.userData || {}),
      booleanOp: next,
    };
    return next;
  }

  getBooleanOp(): ModelBooleanOp {
    return this.booleanOp;
  }

  async loadFromEntitySource(
    loadModel: (source: unknown, options?: Record<string, any>) => Promise<Record<string, any>>,
    source: unknown,
    options: Record<string, any> = {}
  ) {
    return this.loadNode(loadModel, source, options);
  }

  applyEntityPatch(patch: Record<string, any> = {}, options: ModelEntityPatchOptions = {}) {
    const { baseTransform = null, entity } = options;
    if (entity) {
      this.setEntity(entity);
    }

    const nextTransform = this.applyTransformPatch({
      baseTransform,
      patch,
      entity: entity || this.entity,
    });

    if (patch.color !== undefined) {
      this.applyColor(patch.color);
    }
    if (patch.boolean !== undefined) {
      this.setBooleanOp(patch.boolean);
    }

    return {
      nextTransform,
      booleanOp: this.booleanOp,
    };
  }
}

export default ModelEntityObject;
