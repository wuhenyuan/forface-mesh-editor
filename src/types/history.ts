export interface CommandSnapshot {
  undoCount: number
  redoCount: number
  canUndo: boolean
  canRedo: boolean
  isBusy: boolean
  isApplying: boolean
  transactionName: string | null
  lastError: Error | null
}

export interface HistoryState {
  undoStack: ICommand[]
  redoStack: ICommand[]
  maxSize: number
  isBusy: boolean
  isApplying: boolean
  transactionName: string | null
  lastError: Error | null
}

export interface ICommand {
  type: string
  description: string
  timestamp: number
  isAsync: boolean
  
  execute(): Promise<void>
  undo(): Promise<void>
  redo(): Promise<void>
  canMergeWith(other: ICommand): boolean
  mergeWith(other: ICommand): ICommand
}

export interface CommandOptions {
  type: string
  description?: string
  isAsync?: boolean
}

export interface TransactionOptions {
  name: string
  commands: ICommand[]
}
