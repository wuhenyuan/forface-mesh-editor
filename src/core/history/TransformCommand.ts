import { BaseCommand } from './BaseCommand';

function snapshotTransform(object) {
  if (!object) return null;

  return {
    position: [object.position.x, object.position.y, object.position.z],
    rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
    rotationOrder: object.rotation.order,
    scale: [object.scale.x, object.scale.y, object.scale.z],
  };
}

function applyTransform(object, state) {
  if (!object || !state) return;

  const [px, py, pz] = state.position || [0, 0, 0];
  const [rx, ry, rz] = state.rotation || [0, 0, 0];
  const [sx, sy, sz] = state.scale || [1, 1, 1];

  object.position.set(px, py, pz);
  object.rotation.order = state.rotationOrder || object.rotation.order;
  object.rotation.set(rx, ry, rz);
  object.scale.set(sx, sy, sz);

  object.updateMatrixWorld?.(true);
}

export class TransformCommand extends BaseCommand {
  constructor(object, beforeState, afterState, options: Record<string, CoreValue> = {}) {
    const description = options.description || 'Transform';
    super('TRANSFORM', description);

    this.object = object || null;
    this.objectUuid = object?.uuid || null;
    this.document = options.document || null;
    this.entityId = options.entityId || options.entityKey || object?.userData?.entityKey || null;

    this.beforeState = beforeState || snapshotTransform(object);
    this.afterState = afterState || snapshotTransform(object);
  }

  async execute() {
    this._applyState(this.afterState);
  }

  async undo() {
    this._applyState(this.beforeState);
  }

  _applyState(state) {
    if (!state) return;

    if (this.document?.entityManager && this.entityId) {
      const updated = this.document.entityManager.updateEntity(this.entityId, {
        position: state.position,
        rotation: state.rotation,
        scale: state.scale,
      });
      if (updated) return;
    }

    applyTransform(this.object, state);
  }
}

export default TransformCommand;
