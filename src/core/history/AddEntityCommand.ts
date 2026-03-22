import type Document from '../Document';
import { BaseCommand } from './BaseCommand';
import { EntityProps, generateEntityId } from '../Document/Entity';

export class AddEntityCommand extends BaseCommand {
  document: Document | null;
  entity: EntityProps | null;
  entityId: string | null;

  constructor(document: Document | null, entity: EntityProps, options: Record<string, CoreValue> = {}) {
    const description = options.description || 'Add Entity';
    super('ENTITY_ADD', description);

    this.document = document || null;
    this.entity = entity ? { ...entity } : null;
    if (this.entity && !this.entity.id) {
      this.entity.id = generateEntityId();
    }
    this.entityId = this.entity?.id || null;
  }

  async execute() {
    if (!this.document || !this.entity) return;
    const created = this.document.addEntity(this.entity);
    if (
      created &&
      typeof created === 'object' &&
      'id' in created &&
      typeof created.id === 'string'
    ) {
      this.entityId = created.id;
    }
  }

  async undo() {
    if (!this.document || !this.entityId) return;
    this.document.removeEntity(this.entityId);
  }
}

export default AddEntityCommand;
