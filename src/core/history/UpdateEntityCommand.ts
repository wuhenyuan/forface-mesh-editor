import type Document from '../Document';
import { BaseCommand } from './BaseCommand';
import type { EntityPatch } from '../Document/Entity';

const cloneValue = (value: any) => {
  if (Array.isArray(value)) return value.slice();
  if (value && typeof value === 'object') return { ...value };
  return value;
};

const normalizeEntityPatch = (patch: Record<string, any> = {}) => {
  const next: Record<string, any> = {};

  if (patch.resource !== undefined) next.resource = patch.resource;
  if (patch.source !== undefined) next.resource = patch.source;
  if (patch.loaderOptions !== undefined) next.loaderOptions = patch.loaderOptions;
  if (patch.visualOptions !== undefined) next.visualOptions = patch.visualOptions;

  const transform = patch.transform;
  if (transform?.position) next.position = transform.position;
  if (transform?.rotation) next.rotation = transform.rotation;
  if (transform?.scale) next.scale = transform.scale;

  if (patch.position) next.position = patch.position;
  if (patch.rotation) next.rotation = patch.rotation;
  if (patch.scale) next.scale = patch.scale;

  if (patch.color !== undefined) next.color = patch.color;
  if (patch.textType !== undefined) next.textType = patch.textType;
  if (patch.content !== undefined) next.content = patch.content;
  if (patch.size !== undefined) next.size = patch.size;
  if (patch.depth !== undefined) next.depth = patch.depth;
  if (patch.meta !== undefined) next.meta = patch.meta;
  if (patch.boolean !== undefined) next.boolean = patch.boolean;

  return next as EntityPatch;
};

export class UpdateEntityCommand extends BaseCommand {
  document: Document | null;
  entityId: string | null;
  patch: EntityPatch;
  beforePatch: EntityPatch | null;

  constructor(
    document: Document | null,
    entityId: string,
    patch: Record<string, any> = {},
    options: Record<string, any> = {}
  ) {
    const description = options.description || 'Update Entity';
    super('ENTITY_UPDATE', description);

    this.document = document || null;
    this.entityId = entityId || null;
    this.patch = normalizeEntityPatch(patch);
    this.beforePatch = null;
  }

  async execute() {
    if (!this.document || !this.entityId) return;
    if (!this.beforePatch) {
      this.beforePatch = this._snapshotBefore();
    }
    this.document.updateEntity(this.entityId, this.patch);
  }

  async undo() {
    if (!this.document || !this.entityId || !this.beforePatch) return;
    this.document.updateEntity(this.entityId, this.beforePatch);
  }

  private _snapshotBefore() {
    if (!this.document || !this.entityId) return null;
    const entity = this.document.entityManager.getEntity(this.entityId);
    if (!entity) return null;

    const before: Record<string, any> = {};
    Object.keys(this.patch || {}).forEach((key) => {
      before[key] = cloneValue((entity as any)[key]);
    });
    return before as EntityPatch;
  }
}

export default UpdateEntityCommand;
