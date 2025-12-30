export class BaseCommand {
  constructor(type, description = '') {
    this.type = type
    this.description = description
    this.timestamp = Date.now()
    this.isAsync = false
  }

  async execute() {
    throw new Error('BaseCommand.execute() not implemented')
  }

  async undo() {
    throw new Error('BaseCommand.undo() not implemented')
  }

  async redo() {
    return this.execute()
  }

  canMergeWith(_other) {
    return false
  }

  mergeWith(_other) {
    return this
  }
}

export default BaseCommand
