/**
 * 命令基类
 * 所有可撤销/重做的操作都应继承此类
 */
import type { ICommand, CommandOptions } from '../../types/history'

export class BaseCommand implements ICommand {
  type: string
  description: string
  timestamp: number
  isAsync: boolean

  constructor(type: string, description: string = '') {
    this.type = type
    this.description = description
    this.timestamp = Date.now()
    this.isAsync = false
  }

  async execute(): Promise<void> {
    throw new Error('BaseCommand.execute() not implemented')
  }

  async undo(): Promise<void> {
    throw new Error('BaseCommand.undo() not implemented')
  }

  async redo(): Promise<void> {
    return this.execute()
  }

  canMergeWith(_other: ICommand): boolean {
    return false
  }

  mergeWith(_other: ICommand): ICommand {
    return this
  }
}

export default BaseCommand
