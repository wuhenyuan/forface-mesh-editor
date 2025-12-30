/**
 * 项目管理器
 * 负责项目的创建、保存、加载、导出配置等
 */
import defaultConfig from '../../config/config.js'

export class ProjectManager {
  constructor() {
    // 当前项目配置（深拷贝默认配置）
    this.config = this._deepClone(defaultConfig)
    
    // 项目元信息
    this.projectInfo = {
      id: null,
      name: '未命名项目',
      createTime: null,
      updateTime: null,
      version: 1
    }
    
    // 是否有未保存的修改
    this._isDirty = false
    
    // 事件回调
    this.onChange = null
    this.onSave = null
    this.onLoad = null
  }

  /**
   * 创建新项目
   * @param {Object} options - 项目选项
   * @returns {Object} 项目配置
   */
  createProject(options = {}) {
    const { name = '未命名项目', originModelPath = '' } = options
    
    // 重置为默认配置
    this.config = this._deepClone(defaultConfig)
    this.config.originModelPath = originModelPath
    this.config.status = 'draft'
    
    // 设置项目信息
    this.projectInfo = {
      id: this._generateId(),
      name,
      createTime: Date.now(),
      updateTime: Date.now(),
      version: 1
    }
    
    this._isDirty = false
    this.onChange?.({ type: 'create', project: this.getProjectData() })
    
    console.log(`[ProjectManager] 创建新项目: ${name}`)
    return this.getProjectData()
  }

  /**
   * 获取完整项目数据（用于保存）
   * @returns {Object} 项目数据
   */
  getProjectData() {
    return {
      projectInfo: { ...this.projectInfo },
      config: this._deepClone(this.config)
    }
  }

  /**
   * 保存项目到本地存储
   * @param {string} key - 存储键名
   * @returns {boolean} 是否成功
   */
  saveToLocal(key = 'editor_project') {
    try {
      const data = this.getProjectData()
      data.projectInfo.updateTime = Date.now()
      
      localStorage.setItem(key, JSON.stringify(data))
      
      this._isDirty = false
      this.config.status = 'synced'
      this.onSave?.({ type: 'local', key, data })
      
      console.log(`[ProjectManager] 项目已保存到本地: ${key}`)
      return true
    } catch (error) {
      console.error('[ProjectManager] 保存失败:', error)
      return false
    }
  }

  /**
   * 从本地存储加载项目
   * @param {string} key - 存储键名
   * @returns {Object|null} 项目数据
   */
  loadFromLocal(key = 'editor_project') {
    try {
      const json = localStorage.getItem(key)
      if (!json) {
        console.warn(`[ProjectManager] 未找到本地项目: ${key}`)
        return null
      }
      
      const data = JSON.parse(json)
      return this.loadProject(data)
    } catch (error) {
      console.error('[ProjectManager] 加载失败:', error)
      return null
    }
  }

  /**
   * 加载项目数据
   * @param {Object} data - 项目数据
   * @returns {Object} 加载后的项目数据
   */
  loadProject(data) {
    if (!data || !data.config) {
      throw new Error('无效的项目数据')
    }
    
    // 合并配置（保留默认值）
    this.config = {
      ...this._deepClone(defaultConfig),
      ...data.config
    }
    
    // 加载项目信息
    this.projectInfo = {
      ...this.projectInfo,
      ...data.projectInfo
    }
    
    this._isDirty = false
    this.onLoad?.({ type: 'load', project: this.getProjectData() })
    
    console.log(`[ProjectManager] 项目已加载: ${this.projectInfo.name}`)
    return this.getProjectData()
  }

  /**
   * 导出项目为 JSON 文件
   * @param {string} filename - 文件名
   */
  exportProjectFile(filename = 'project') {
    const data = this.getProjectData()
    const json = JSON.stringify(data, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    
    this._downloadBlob(blob, `${filename}.json`)
    console.log(`[ProjectManager] 项目已导出: ${filename}.json`)
  }

  /**
   * 从文件导入项目
   * @param {File} file - JSON 文件
   * @returns {Promise<Object>} 项目数据
   */
  async importProjectFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result)
          const project = this.loadProject(data)
          resolve(project)
        } catch (error) {
          reject(new Error('无效的项目文件'))
        }
      }
      
      reader.onerror = () => reject(new Error('文件读取失败'))
      reader.readAsText(file)
    })
  }

  // ==================== 配置更新方法 ====================

  /**
   * 更新原始模型路径
   * @param {string} path - 模型路径
   */
  setOriginModelPath(path) {
    this.config.originModelPath = path
    this._markDirty()
  }

  /**
   * 更新底座模型路径
   * @param {string} path - 模型路径
   */
  setBaseModelPath(path) {
    this.config.baseModelPath = path
    this._markDirty()
  }

  /**
   * 更新最终模型配置
   * @param {Object} config - 模型配置
   */
  updateFinalModelConfig(config) {
    Object.assign(this.config.finalModelConfig, config)
    this._markDirty()
  }

  /**
   * 更新底座模型配置
   * @param {Object} config - 底座配置
   */
  updateBaseModelConfig(config) {
    Object.assign(this.config.baseModelConfig, config)
    this._markDirty()
  }

  /**
   * 添加文字配置
   * @param {Object} textConfig - 文字配置
   */
  addTextConfig(textConfig) {
    const text = {
      id: textConfig.displayName || `文字${this.config.texts.length + 1}`,
      index: textConfig.id || this._generateId(),
      type: textConfig.font || 'helvetiker',
      text: textConfig.content || '',
      size: textConfig.size || 1,
      depth: textConfig.thickness || 0.1,
      effect: textConfig.mode === 'engraved' ? 'Engraved' : 'Embossed',
      color: textConfig.color || '#333333',
      position: textConfig.position || [0, 0, 0],
      rotate: textConfig.rotation || [0, 0, 0],
      wrap: 'surface Project',
      attachmentSurface: textConfig.featureName || ''
    }
    
    this.config.texts.push(text)
    this._markDirty()
    return text
  }

  /**
   * 更新文字配置
   * @param {string} textId - 文字ID（index）
   * @param {Object} updates - 更新内容
   */
  updateTextConfig(textId, updates) {
    const text = this.config.texts.find(t => t.index === textId)
    if (!text) return false
    
    if (updates.content !== undefined) text.text = updates.content
    if (updates.size !== undefined) text.size = updates.size
    if (updates.thickness !== undefined) text.depth = updates.thickness
    if (updates.color !== undefined) text.color = updates.color
    if (updates.mode !== undefined) {
      text.effect = updates.mode === 'engraved' ? 'Engraved' : 'Embossed'
    }
    if (updates.position !== undefined) text.position = updates.position
    if (updates.rotation !== undefined) text.rotate = updates.rotation
    
    this._markDirty()
    return true
  }

  /**
   * 删除文字配置
   * @param {string} textId - 文字ID（index）
   */
  removeTextConfig(textId) {
    const index = this.config.texts.findIndex(t => t.index === textId)
    if (index !== -1) {
      this.config.texts.splice(index, 1)
      this._markDirty()
      return true
    }
    return false
  }

  /**
   * 获取所有文字配置
   * @returns {Array} 文字配置数组
   */
  getTextConfigs() {
    return [...this.config.texts]
  }

  /**
   * 更新属性标识符（用于版本比对）
   * 生成一个唯一标识符，用于判断当前编辑状态与已保存状态是否一致
   */
  updatePropIdentifier() {
    this.config.propIdentifier = this._generatePropIdentifier()
  }

  /**
   * 生成属性标识符
   * @private
   * @returns {string} 属性标识符
   */
  _generatePropIdentifier() {
    const parts = []
    
    // 1. 最终模型配置
    const fm = this.config.finalModelConfig
    parts.push(`fm_scale:${fm.scale.join(',')}`)
    parts.push(`fm_bbox:${fm.boundingBox.join(',')}`)
    
    // 2. 底座配置
    const bm = this.config.baseModelConfig
    if (this.config.baseModelPath) {
      parts.push(`base:${this.config.baseModelPath}`)
      parts.push(`bm_pos:${bm.position.join(',')}`)
      parts.push(`bm_scale:${bm.scale.join(',')}`)
      parts.push(`bm_rot:${bm.rotation.join(',')}`)
    } else {
      parts.push('base:none')
    }
    
    // 3. 文字配置（按 index 排序保证一致性）
    const sortedTexts = [...this.config.texts].sort((a, b) => 
      (a.index || '').localeCompare(b.index || '')
    )
    
    sortedTexts.forEach((t, i) => {
      parts.push(`t${i}_id:${t.index}`)
      parts.push(`t${i}_txt:${t.text}`)
      parts.push(`t${i}_size:${t.size}`)
      parts.push(`t${i}_depth:${t.depth}`)
      parts.push(`t${i}_effect:${t.effect}`)
      parts.push(`t${i}_color:${t.color}`)
      parts.push(`t${i}_pos:${t.position.join(',')}`)
      parts.push(`t${i}_rot:${t.rotate.join(',')}`)
      parts.push(`t${i}_surface:${t.attachmentSurface}`)
    })
    
    // 4. 其他配置
    parts.push(`faceRepare:${this.config.faceRepare}`)
    parts.push(`modelOpt:${this.config.modelOptimization}`)
    
    // 生成 hash
    const str = parts.join('|')
    return this._simpleHash(str)
  }

  /**
   * 简单哈希函数
   * @private
   */
  _simpleHash(str) {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36)
  }

  /**
   * 比较当前配置与已保存配置是否有变化
   * @param {string} savedIdentifier - 已保存的标识符
   * @returns {Object} { hasChanges: boolean, changes: string[] }
   */
  compareWithSaved(savedIdentifier) {
    const currentIdentifier = this._generatePropIdentifier()
    
    if (currentIdentifier === savedIdentifier) {
      return { hasChanges: false, changes: [] }
    }
    
    // 检测具体变化
    const changes = this._detectChanges(savedIdentifier)
    return { hasChanges: true, changes }
  }

  /**
   * 检测具体变化（用于提示用户）
   * @private
   */
  _detectChanges(savedIdentifier) {
    const changes = []
    
    // 这里简化处理，实际可以存储上次保存的完整配置进行详细对比
    // 目前只返回通用提示
    if (this._isDirty) {
      if (this.config.texts.length > 0) {
        changes.push('文字配置')
      }
      if (this.config.baseModelPath) {
        changes.push('底座配置')
      }
      changes.push('模型属性')
    }
    
    return changes
  }

  /**
   * 获取变更摘要（用于提示用户）
   * @returns {string} 变更摘要文本
   */
  getChangesSummary() {
    if (!this._isDirty) {
      return '没有未保存的修改'
    }
    
    const items = []
    
    // 检查文字变化
    if (this.config.texts.length > 0) {
      items.push(`${this.config.texts.length}个文字`)
    }
    
    // 检查底座
    if (this.config.baseModelPath) {
      items.push('底座设置')
    }
    
    // 检查模型缩放
    const scale = this.config.finalModelConfig.scale
    if (scale[0] !== 1 || scale[1] !== 1 || scale[2] !== 1) {
      items.push('模型缩放')
    }
    
    if (items.length === 0) {
      return '有未保存的修改'
    }
    
    return `您有以下修改尚未保存：${items.join('、')}`
  }

  // ==================== 状态查询 ====================

  /**
   * 是否有未保存的修改
   * @returns {boolean}
   */
  isDirty() {
    return this._isDirty
  }

  /**
   * 获取项目状态
   * @returns {string} 'draft' | 'synced'
   */
  getStatus() {
    return this.config.status
  }

  /**
   * 获取项目名称
   * @returns {string}
   */
  getProjectName() {
    return this.projectInfo.name
  }

  /**
   * 设置项目名称
   * @param {string} name
   */
  setProjectName(name) {
    this.projectInfo.name = name
    this._markDirty()
  }

  /**
   * 获取本地存储的项目列表
   * @returns {Array} 项目列表
   */
  getLocalProjectList() {
    const list = []
    const prefix = 'editor_project_'
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key.startsWith(prefix) || key === 'editor_project') {
        try {
          const data = JSON.parse(localStorage.getItem(key))
          list.push({
            key,
            name: data.projectInfo?.name || '未命名',
            updateTime: data.projectInfo?.updateTime || 0
          })
        } catch (e) {
          // 忽略无效数据
        }
      }
    }
    
    // 按更新时间排序
    return list.sort((a, b) => b.updateTime - a.updateTime)
  }

  /**
   * 删除本地项目
   * @param {string} key - 存储键名
   */
  deleteLocalProject(key) {
    localStorage.removeItem(key)
    console.log(`[ProjectManager] 已删除本地项目: ${key}`)
  }

  // ==================== 私有方法 ====================

  _markDirty() {
    this._isDirty = true
    this.config.status = 'draft'
    this.onChange?.({ type: 'change', isDirty: true })
  }

  _generateId() {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  _deepClone(obj) {
    return JSON.parse(JSON.stringify(obj))
  }

  _downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setTimeout(() => URL.revokeObjectURL(url), 100)
  }

  /**
   * 销毁
   */
  dispose() {
    this.config = null
    this.projectInfo = null
    this.onChange = null
    this.onSave = null
    this.onLoad = null
  }
}

export default ProjectManager
