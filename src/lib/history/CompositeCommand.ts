/**
 * 复合命令
 * 将多个命令组合成一个事务
 */
import { BaseCommand } from './BaseCommand'
import type { ICommand } from '../../types/history'

export class CompositeCommand extends BaseCommand {
  commands: ICommand[]

  constructor(name: string, commands: ICommand[] = []) {
    super('COMPOSITE', name)
    this.commands = commands
    this.isAsync = commands.some(cmd => cmd?.isAsync)
  }

  async execute(): Promise<void> {
    for (const command of this.commands) {
      await command.execute()
    }
  }

  async undo(): Promise<void> {
    for (let index = this.commands.length - 1; index >= 0; index--) {
      await this.commands[index].undo()
    }
  }

  addCommand(command: ICommand): void {
    this.commands.push(command)
    if (command?.isAsync) this.isAsync = true
  }
}

export default CompositeCommand
