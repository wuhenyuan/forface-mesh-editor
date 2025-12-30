import { CompositeCommand } from './CompositeCommand.js'

export class HistoryManager {
  constructor(options = {}) {
    const { maxSize = 50, onChange = null } = options

    this.undoStack = []
    this.redoStack = []
    this.maxSize = maxSize

    this.isBusy = false
    this.isApplying = false

    this._transaction = null
    this._onChange = typeof onChange === 'function' ? onChange : null

    this._notify()
  }

  _notify() {
    if (!this._onChange) return
    this._onChange(this.getSnapshot())
  }

  getSnapshot() {
    return {
      undoCount: this.undoStack.length,
      redoCount: this.redoStack.length,
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      isBusy: this.isBusy,
      isApplying: this.isApplying,
      transactionName: this._transaction?.description || null
    }
  }

  canUndo() {
    return this.undoStack.length > 0
  }

  canRedo() {
    return this.redoStack.length > 0
  }

  clear() {
    this.undoStack = []
    this.redoStack = []
    this._transaction = null
    this._notify()
  }

  _pushUndo(command) {
    this.undoStack.push(command)
    this.redoStack = []

    if (this.undoStack.length > this.maxSize) {
      this.undoStack.shift()
    }

    this._notify()
  }

  capture(command) {
    if (!command) return

    if (this._transaction) {
      this._transaction.addCommand(command)
      this._notify()
      return
    }

    this._pushUndo(command)
  }

  async execute(command) {
    if (!command) return
    if (this.isBusy) throw new Error('HistoryManager is busy')

    this.isBusy = true
    this.isApplying = true
    this._notify()

    try {
      await command.execute()

      if (this._transaction) {
        this._transaction.addCommand(command)
      } else {
        this._pushUndo(command)
      }
    } finally {
      this.isApplying = false
      this.isBusy = false
      this._notify()
    }
  }

  async undo() {
    if (this.isBusy) throw new Error('HistoryManager is busy')
    if (!this.canUndo()) return null

    const command = this.undoStack.pop()
    this.isBusy = true
    this.isApplying = true
    this._notify()

    try {
      await command.undo()
      this.redoStack.push(command)
      return command
    } finally {
      this.isApplying = false
      this.isBusy = false
      this._notify()
    }
  }

  async redo() {
    if (this.isBusy) throw new Error('HistoryManager is busy')
    if (!this.canRedo()) return null

    const command = this.redoStack.pop()
    this.isBusy = true
    this.isApplying = true
    this._notify()

    try {
      await command.redo()
      this.undoStack.push(command)
      if (this.undoStack.length > this.maxSize) {
        this.undoStack.shift()
      }
      this._notify()
      return command
    } finally {
      this.isApplying = false
      this.isBusy = false
      this._notify()
    }
  }

  beginTransaction(name = 'Transaction') {
    if (this._transaction) throw new Error('Transaction already in progress')
    this._transaction = new CompositeCommand(name)
    this._notify()
  }

  commitTransaction() {
    if (!this._transaction) return
    const tx = this._transaction
    this._transaction = null
    if (tx.commands.length > 0) {
      this._pushUndo(tx)
    } else {
      this._notify()
    }
  }

  async rollbackTransaction() {
    if (!this._transaction) return
    const tx = this._transaction
    this._transaction = null

    this.isBusy = true
    this.isApplying = true
    this._notify()

    try {
      await tx.undo()
    } finally {
      this.isApplying = false
      this.isBusy = false
      this._notify()
    }
  }
}

export default HistoryManager
