import { BaseCommand } from './BaseCommand.js'

function snapshotTransform(object) {
  if (!object) return null

  return {
    position: [object.position.x, object.position.y, object.position.z],
    rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
    rotationOrder: object.rotation.order,
    scale: [object.scale.x, object.scale.y, object.scale.z]
  }
}

function applyTransform(object, state) {
  if (!object || !state) return

  const [px, py, pz] = state.position || [0, 0, 0]
  const [rx, ry, rz] = state.rotation || [0, 0, 0]
  const [sx, sy, sz] = state.scale || [1, 1, 1]

  object.position.set(px, py, pz)
  object.rotation.order = state.rotationOrder || object.rotation.order
  object.rotation.set(rx, ry, rz)
  object.scale.set(sx, sy, sz)

  object.updateMatrixWorld?.(true)
}

export class TransformCommand extends BaseCommand {
  constructor(object, beforeState, afterState, options = {}) {
    const description = options.description || 'Transform'
    super('TRANSFORM', description)

    this.object = object || null
    this.objectUuid = object?.uuid || null

    this.beforeState = beforeState || snapshotTransform(object)
    this.afterState = afterState || snapshotTransform(object)
  }

  async execute() {
    applyTransform(this.object, this.afterState)
  }

  async undo() {
    applyTransform(this.object, this.beforeState)
  }
}

export default TransformCommand
