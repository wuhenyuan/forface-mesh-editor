import { BaseCommand } from './BaseCommand.js'

export class CompositeCommand extends BaseCommand {
  constructor(name, commands = []) {
    super('COMPOSITE', name)
    this.commands = commands
    this.isAsync = commands.some(cmd => cmd?.isAsync)
  }

  async execute() {
    for (const command of this.commands) {
      await command.execute()
    }
  }

  async undo() {
    for (let index = this.commands.length - 1; index >= 0; index--) {
      await this.commands[index].undo()
    }
  }

  addCommand(command) {
    this.commands.push(command)
    if (command?.isAsync) this.isAsync = true
  }
}

export default CompositeCommand
