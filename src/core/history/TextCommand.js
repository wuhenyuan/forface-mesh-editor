import { BaseCommand } from './BaseCommand.js'

export class TextCommand extends BaseCommand {
  constructor(action, viewer, payload = {}) {
    const description = payload.description || TextCommand._defaultDescription(action)
    super('TEXT', description)

    this.isAsync = true

    this.action = action
    this.viewer = viewer

    this.textId = payload.textId || payload.snapshot?.id || null
    this.snapshot = payload.snapshot || null

    this.from = payload.from ?? null
    this.to = payload.to ?? null

    this.patch = payload.patch || null
    this.beforeConfig = payload.beforeConfig || null
    this.afterConfig = payload.afterConfig || null

    this.fromMode = payload.fromMode || null
    this.toMode = payload.toMode || null
  }

  static _defaultDescription(action) {
    switch (action) {
      case 'create':
        return '添加文字'
      case 'delete':
        return '删除文字'
      case 'updateContent':
        return '修改文字内容'
      case 'updateColor':
        return '修改文字颜色'
      case 'updateConfig':
        return '修改文字属性'
      case 'setMode':
        return '切换雕刻模式'
      default:
        return '文字操作'
    }
  }

  _getSnapshot() {
    if (!this.viewer || !this.textId) return null
    return this.viewer.getTextSnapshot?.(this.textId) || null
  }

  async execute() {
    if (!this.viewer) return

    switch (this.action) {
      case 'create': {
        if (!this.snapshot) return
        await this.viewer.restoreText?.(this.snapshot)
        return
      }

      case 'delete': {
        if (!this.textId) return
        if (!this.snapshot) this.snapshot = this._getSnapshot()
        await this.viewer.deleteText?.(this.textId)
        return
      }

      case 'updateContent': {
        if (!this.textId) return
        if (this.from == null) this.from = this._getSnapshot()?.content ?? null
        await this.viewer.updateTextContent?.(this.textId, this.to)
        return
      }

      case 'updateColor': {
        if (!this.textId) return
        if (this.from == null) this.from = this._getSnapshot()?.config?.color ?? null
        this.viewer.updateTextColor?.(this.textId, this.to)
        return
      }

      case 'updateConfig': {
        if (!this.textId) return
        if (!this.beforeConfig) this.beforeConfig = this._getSnapshot()?.config || null
        if (!this.afterConfig && this.beforeConfig && this.patch) {
          this.afterConfig = { ...this.beforeConfig, ...this.patch }
        }
        const nextConfig = this.afterConfig || this.patch
        if (!nextConfig) return
        await this.viewer.updateTextConfig?.(this.textId, nextConfig)
        return
      }

      case 'setMode': {
        if (!this.textId) return
        if (!this.fromMode) this.fromMode = this._getSnapshot()?.mode || null
        await this.viewer.switchTextMode?.(this.textId, this.toMode)
        return
      }
    }
  }

  async undo() {
    if (!this.viewer) return

    switch (this.action) {
      case 'create': {
        if (!this.snapshot?.id) return
        await this.viewer.deleteText?.(this.snapshot.id)
        return
      }

      case 'delete': {
        if (!this.snapshot) return
        await this.viewer.restoreText?.(this.snapshot)
        return
      }

      case 'updateContent': {
        if (!this.textId || this.from == null) return
        await this.viewer.updateTextContent?.(this.textId, this.from)
        return
      }

      case 'updateColor': {
        if (!this.textId || this.from == null) return
        this.viewer.updateTextColor?.(this.textId, this.from)
        return
      }

      case 'updateConfig': {
        if (!this.textId || !this.beforeConfig) return
        await this.viewer.updateTextConfig?.(this.textId, this.beforeConfig)
        return
      }

      case 'setMode': {
        if (!this.textId || !this.fromMode) return
        await this.viewer.switchTextMode?.(this.textId, this.fromMode)
        return
      }
    }
  }
}

export default TextCommand
