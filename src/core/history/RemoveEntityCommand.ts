import type Document from '../Document';
import { BaseCommand } from './BaseCommand';
import type { EntityProps } from '../Document/Entity';

const cloneEntity = (entity: any): EntityProps | null => {
  if (!entity) return null;
  const snapshot = { ...entity } as EntityProps;
  if (entity.meta && typeof entity.meta === 'object') {
    snapshot.meta = { ...entity.meta };
  }
  if (entity.loaderOptions && typeof entity.loaderOptions === 'object') {
    (snapshot as any).loaderOptions = { ...entity.loaderOptions };
  }
  if (entity.visualOptions && typeof entity.visualOptions === 'object') {
    (snapshot as any).visualOptions = { ...entity.visualOptions };
  }
  return snapshot;
};

export class RemoveEntityCommand extends BaseCommand {
  document: Document | null;
  entityId: string | null;
  entitySnapshot: EntityProps | null;

  constructor(document: Document | null, entityId: string, options: Record<string, any> = {}) {
    const description = options.description || 'Remove Entity';
    super('ENTITY_REMOVE', description);

    this.document = document || null;
    this.entityId = entityId || null;
    this.entitySnapshot = null;
  }

  async execute() {
    if (!this.document || !this.entityId) return;
    if (!this.entitySnapshot) {
      const entity = this.document.entityManager.getEntity(this.entityId);
      this.entitySnapshot = cloneEntity(entity);
    }
    this.document.removeEntity(this.entityId);
  }

  async undo() {
    if (!this.document || !this.entitySnapshot) return;
    this.document.addEntity(this.entitySnapshot);
  }
}

export default RemoveEntityCommand;
