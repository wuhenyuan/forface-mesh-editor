/**
 * 项目管理器
 * 负责项目的创建、保存、加载、导出配置等
 */
import defaultConfig, { normalizeConfig, serializeConfig } from '../../config/config'

export interface ProjectInfo {
  id: string | null
  name: string
  createTime: number | null
  updateTime: number | null
  version: number
}

type ProjectManagerCallback = ((event: any) => void) | null

type PackageObjectUrlEntry =
  | string
  | {
      url: string
      file?: File | Blob
    }

export class ProjectManager {
  config: any
  projectInfo: ProjectInfo
  private _isDirty: boolean
  onChange: ProjectManagerCallback
  onSave: ProjectManagerCallback
  onLoad: ProjectManagerCallback
  private _packageObjectUrls: Map<string, PackageObjectUrlEntry>

  constructor() {
    // 当前项目配置（深拷贝默认配置）
    this.config = normalizeConfig(this._deepClone(defaultConfig))
    
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

    // ZIP 项目包导入时的资源映射：zip 内路径 -> blob:URL
    this._packageObjectUrls = new Map()
  }

  /**
   * 创建新项目
   * @param {Object} options - 项目选项
   * @returns {Object} 项目配置
   */
  createProject(options: Record<string, any> = {}) {
    const { name = '未命名项目', originModelPath = '' } = options
    
    // 重置为默认配置
    this._revokePackageObjectUrls()
    this.config = normalizeConfig(this._deepClone(defaultConfig))
    this.config.models.origin.path = originModelPath || ''
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

  _getPersistedProjectData(configOverride?: any) {
    return {
      projectInfo: { ...this.projectInfo },
      config: serializeConfig(configOverride || this.config)
    }
  }

  /**
   * 保存项目到本地存储
   * @param {string} key - 存储键名
   * @returns {boolean} 是否成功
   */
  saveToLocal(key = 'editor_project') {
    try {
      const nextUpdateTime = Date.now()
      const projectInfoForSave = { ...this.projectInfo, updateTime: nextUpdateTime }
      const configForSave = this._deepClone(this.config)
      configForSave.status = 'synced'

      const data = {
        projectInfo: projectInfoForSave,
        config: serializeConfig(configForSave)
      }
      
      localStorage.setItem(key, JSON.stringify(data))

      this.projectInfo.updateTime = nextUpdateTime
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
  loadProject(data, options: Record<string, any> = {}) {
    const source = data && typeof data === 'object' ? data : null
    if (!source) throw new Error('无效的项目数据')

    const isProjectWrapper = !!(source.config && typeof source.config === 'object')
    const configSource = isProjectWrapper ? source.config : source

    // 合并配置（保留默认值 + 兼容旧字段升级）
    this._revokePackageObjectUrls()
    this.config = normalizeConfig(this._deepClone(configSource))

    // 加载项目信息
    if (isProjectWrapper) {
      this.projectInfo = {
        ...this.projectInfo,
        ...source.projectInfo
      }
    } else {
      const now = Date.now()
      const inferredName =
        typeof options?.name === 'string' && options.name.trim()
          ? options.name.trim()
          : '导入项目'
      this.projectInfo = {
        id: this._generateId(),
        name: inferredName,
        createTime: now,
        updateTime: now,
        version: 1
      }
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
    const data = this._getPersistedProjectData()
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
    if (file?.name && /\.zip$/i.test(file.name)) {
      return await this.importProjectPackage(file)
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      
      reader.onload = (e) => {
        try {
          const result = e.target?.result
          if (typeof result !== 'string') {
            throw new Error('无效的项目文件')
          }
          const data = JSON.parse(result)
          const inferredName = file?.name ? this._stripExt(file.name) : undefined
          const project = this.loadProject(data, { name: inferredName })
          resolve(project)
        } catch (error) {
          reject(new Error('无效的项目文件'))
        }
      }
      
      reader.onerror = () => reject(new Error('文件读取失败'))
      reader.readAsText(file)
    })
  }

  /**
   * 导出“全量项目包”(ZIP)：project.json + models/*
   * - 生产模式：只保存 project.json（models.path 指向网络地址）
   * - 离线模式：把 models 里引用的模型文件一起打包，path 改为包内相对路径
   *
   * @param {Object} options
   * @param {string} [options.filename]
   * @param {boolean|string[]} [options.includeModels=true]
   *   - true: 打包 config.models 中所有有 path 的模型（全量导出，导出后全部变相对路径）
   *   - false: 只导出 project.json（轻量包）
   *   - string[]: 只打包指定 key（例如 ['final']：json + 最终模型，其它保持网络 URL）
   * @param {'v3'|'config2'} [options.format='v3']
   *   - v3: 当前项目结构（projectInfo + config/features[]）
   *   - config2: 你定义的新结构（version/createTime/models[]/texts[]），并把模型文件写到 `model/*`
   * @param {string} [options.projectFileName='project.json'] ZIP 内配置文件名
   * @param {RequestInit} [options.fetchOptions] fetch 选项（如 credentials/headers）
   */
  async exportProjectPackage(options: Record<string, any> = {}) {
    const {
      filename = this.getProjectName() || 'project',
      includeModels = true,
      format = 'v3',
      projectFileName = 'project.json',
      fetchOptions = undefined
    } = options

    const { default: JSZip } = await import('jszip')
    const zip = new JSZip()

    const packageConfig = this._deepClone(this.config)
    const modelKeysToInclude = this._resolvePackageModelKeys(packageConfig?.models, includeModels)

    if (modelKeysToInclude.length > 0 && packageConfig?.models) {
      const usedNames = new Set()
      const modelDir = format === 'config2' ? 'model' : 'models'
      const packagedPathByKey = new Map()

      for (const key of modelKeysToInclude) {
        const model = packageConfig.models[key]
        const configuredPath = model?.path
        if (!configuredPath) continue

        const runtimePath = this.resolveModelPath(key)
        const blob = await this._fetchAsBlob(runtimePath, { modelKey: key, fetchOptions })

        const fileName = format === 'config2'
          ? this._inferConfig2PackageFileName({ key, configuredPath, blob, usedNames })
          : this._inferPackageFileName({ key, configuredPath, blob, usedNames })

        const zipPath = `${modelDir}/${fileName}`
        zip.file(zipPath, blob)

        packagedPathByKey.set(key, zipPath)

        if (format === 'v3') {
          // 写回包内相对路径（持久化路径）
          model.path = zipPath
        }
      }

      if (format === 'config2') {
        zip.file(
          projectFileName,
          JSON.stringify(this._buildConfig2ForPackage({ packageConfig, packagedPathByKey }), null, 2)
        )
      }
    }

    if (format === 'v3') {
      const packageData = this._getPersistedProjectData(packageConfig)
      zip.file(projectFileName, JSON.stringify(packageData, null, 2))
    } else if (!zip.file(projectFileName)) {
      zip.file(projectFileName, JSON.stringify(this._buildConfig2ForPackage({ packageConfig }), null, 2))
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' })
    this._downloadBlob(zipBlob, `${filename}.zip`)

    console.log(`[ProjectManager] 项目包已导出: ${filename}.zip`)
    return true
  }

  /**
   * 导出“本地全量包”(ZIP)：project.json + model/*
   * - 会把所有引用到的模型（含 *.zip 模型）打包进 zip
   * - project.json 使用 config2 的 models[]/texts[] 结构，并把 url 统一改成相对路径（从 zip 加载）
   */
  async exportLocalFullPackage(options: Record<string, any> = {}) {
    return await this.exportProjectPackage({
      ...options,
      includeModels: true,
      format: 'config2'
    })
  }

  /**
   * 导入“全量项目包”(ZIP)：读取 project.json，并建立 models/* -> blob:URL 映射
   * @param {File|Blob} file zip 文件
   * @returns {Promise<Object>} 项目数据
   */
  async importProjectPackage(file) {
    const { default: JSZip } = await import('jszip')
    const zip = await JSZip.loadAsync(file)

    const projectEntry =
      zip.file('project.json') ||
      zip.file('project.forface.json') ||
      zip.file('mesh-editor-config.json')

    const projectFileName = projectEntry?.name ||
      Object.keys(zip.files).find((name) => name.toLowerCase().endsWith('.json'))

    if (!projectFileName) throw new Error('ZIP 内未找到 project.json')

    const jsonText = projectEntry
      ? await projectEntry.async('string')
      : await zip.file(projectFileName).async('string')

    const data = JSON.parse(jsonText)
    const inferredName = file?.name ? this._stripExt(file.name) : undefined
    const projectData = this.loadProject(data, { name: inferredName })

    // 建立 zip 资源映射
    this._revokePackageObjectUrls()
    for (const [name, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue
      if (name === projectFileName) continue

      const blob = await zip.file(name).async('blob')
      const normalized = this._normalizeZipPath(name)
      const baseName = normalized.split('/').filter(Boolean).pop() || normalized || 'file'
      const fileObject = typeof File !== 'undefined'
        ? new File([blob], baseName, { type: blob.type || undefined })
        : blob
      const url = URL.createObjectURL(blob)
      this._packageObjectUrls.set(normalized, { url, file: fileObject })
    }

    console.log(`[ProjectManager] 项目包已导入: ${file?.name || 'zip'}`)
    return projectData
  }

  /**
   * 获取某个模型的“运行时可加载路径”
   * - 普通场景：直接返回 config.models[key].path
   * - ZIP 导入：把包内相对路径映射为 blob:URL
   */
  resolveModelPath(modelKey) {
    const configuredPath = this.config?.models?.[modelKey]?.path || ''
    if (!configuredPath) return ''

    // 带 scheme 的 URI（http/https/blob/data/...）直接返回，不走包内映射
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(configuredPath)) return configuredPath

    const normalized = this._normalizeZipPath(configuredPath)

    const _resolveMapped = (key) => {
      const value = this._packageObjectUrls.get(key)
      if (!value) return null
      if (typeof value === 'string') return value
      return value.file || value.url || null
    }

    const direct = _resolveMapped(normalized)
    if (direct) return direct

    // 兼容：path 可能写成 "origin.stl"，但包里是 "models/origin.stl"
    const withModels = normalized.startsWith('models/') ? normalized : `models/${normalized}`
    const alt1 = _resolveMapped(withModels)
    if (alt1) return alt1

    // 兼容：path 可能写成 "models/origin.stl"，但包里是 "origin.stl"
    if (normalized.startsWith('models/')) {
      const withoutModels = normalized.replace(/^models\//, '')
      const alt2 = _resolveMapped(withoutModels)
      if (alt2) return alt2
    }

    // 兜底：按文件名匹配（要求唯一）
    const baseName = normalized.split('/').filter(Boolean).pop()
    if (baseName) {
      const matches = []
      for (const [path, value] of this._packageObjectUrls.entries()) {
        if (path === baseName || path.endsWith(`/${baseName}`)) {
          const resolved = typeof value === 'string' ? value : (value.file || value.url)
          if (resolved) matches.push(resolved)
        }
      }
      if (matches.length === 1) return matches[0]
    }

    return configuredPath
  }

  // ==================== 配置更新方法 ====================

  /**
   * 更新原始模型路径
   * @param {string} path - 模型路径
   */
  setOriginModelPath(path) {
    if (!this.config.models?.origin) this.config = normalizeConfig(this.config)
    this.config.models.origin.path = path || ''
    this._markDirty()
  }

  /**
   * 更新底座模型路径
   * @param {string} path - 模型路径
   */
  setBaseModelPath(path) {
    if (!this.config.models?.base) this.config = normalizeConfig(this.config)
    this.config.models.base.path = path || ''
    this._markDirty()
  }

  /**
   * 更新最终模型配置
   * @param {Object} config - 模型配置
   */
  updateFinalModelConfig(config) {
    if (!this.config.models?.final) this.config = normalizeConfig(this.config)
    Object.assign(this.config.models.final.config, config)
    this._markDirty()
  }

  /**
   * 更新底座模型配置
   * @param {Object} config - 底座配置
   */
  updateBaseModelConfig(config) {
    if (!this.config.models?.base) this.config = normalizeConfig(this.config)
    Object.assign(this.config.models.base.config, config)
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
    const fm = this.config.models?.final?.config || {}
    const fmScale = Array.isArray(fm.scale) ? fm.scale : [1, 1, 1]
    const fmBBox = Array.isArray(fm.boundingBox) ? fm.boundingBox : [0, 0, 0]
    parts.push(`fm_scale:${fmScale.join(',')}`)
    parts.push(`fm_bbox:${fmBBox.join(',')}`)
    
    // 2. 底座配置
    const bm = this.config.models?.base?.config || {}
    const basePath = this.config.models?.base?.path
    if (basePath) {
      parts.push(`base:${basePath}`)
      const bmPos = Array.isArray(bm.position) ? bm.position : [0, 0, 0]
      const bmScale = Array.isArray(bm.scale) ? bm.scale : [1, 1, 1]
      const bmRot = Array.isArray(bm.rotation) ? bm.rotation : [0, 0, 0]
      parts.push(`bm_pos:${bmPos.join(',')}`)
      parts.push(`bm_scale:${bmScale.join(',')}`)
      parts.push(`bm_rot:${bmRot.join(',')}`)
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
      if (this.config.models?.base?.path) {
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
    if (this.config.models?.base?.path) {
      items.push('底座设置')
    }
    
    // 检查模型缩放
    const scale = this.config.models?.final?.config?.scale || [1, 1, 1]
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
    this._revokePackageObjectUrls()
    this.config = null
    this.projectInfo = null
    this.onChange = null
    this.onSave = null
    this.onLoad = null
  }

  _revokePackageObjectUrls() {
    if (!this._packageObjectUrls) return
    for (const value of this._packageObjectUrls.values()) {
      const url = typeof value === 'string' ? value : value?.url
      if (!url) continue
      try {
        URL.revokeObjectURL(url)
      } catch (_) {
        // ignore
      }
    }
    this._packageObjectUrls.clear()
  }

  _normalizeZipPath(path) {
    if (typeof path !== 'string') return ''
    const cleaned = path.split('#')[0].split('?')[0]
    return cleaned.replace(/\\/g, '/').replace(/^\.\//, '')
  }

  async _fetchAsBlob(source: unknown, context: { fetchOptions?: RequestInit; modelKey?: string } = {}) {
    if (!source) throw new Error('模型路径为空，无法打包')
    if (source instanceof Blob) return source
    if (typeof source !== 'string') throw new Error('不支持的模型源类型，无法打包')

    try {
      const res = await fetch(source, context.fetchOptions)
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`)
      }
      return await res.blob()
    } catch (error) {
      const keyHint = context.modelKey ? ` (${context.modelKey})` : ''
      throw new Error(`无法下载模型文件${keyHint}: ${source}\n${error?.message || error}`)
    }
  }

  _inferPackageFileName({ key, configuredPath, blob, usedNames }) {
    const keyBase = this._stripExt(this._sanitizeFileName(String(key || 'model'))) || 'model'
    const configuredExt = this._extractExt(this._extractFileName(configuredPath))
    const ext = configuredExt || this._guessExtFromBlob(blob) || 'bin'
    const base = keyBase

    let name = `${base}.${ext}`
    let i = 2
    while (usedNames.has(name)) {
      name = `${base}_${i++}.${ext}`
    }
    usedNames.add(name)
    return name
  }

  _inferConfig2PackageFileName({ key, configuredPath, blob, usedNames }) {
    const configuredName = this._extractFileName(configuredPath)
    const configuredBase = this._stripExt(this._sanitizeFileName(configuredName))
    const keyBase = this._stripExt(this._sanitizeFileName(String(key || 'model'))) || 'model'
    const configuredExt = this._extractExt(configuredName)
    const ext = configuredExt || this._guessExtFromBlob(blob) || 'bin'
    const base = configuredBase || keyBase || 'model'

    let name = `${base}.${ext}`
    let i = 2
    while (usedNames.has(name)) {
      name = `${base}_${i++}.${ext}`
    }
    usedNames.add(name)
    return name
  }

  _buildConfig2ForPackage(
    { packageConfig, packagedPathByKey }: { packageConfig?: any; packagedPathByKey?: Map<string, string> } = {}
  ) {
    const cfg = packageConfig && typeof packageConfig === 'object' ? packageConfig : {}
    const metadata = cfg.metadata && typeof cfg.metadata === 'object' ? cfg.metadata : {}

    const version = typeof metadata.version === 'string' ? metadata.version : ''
    const createTime = typeof metadata.created === 'string' ? metadata.created : ''

    const models = []
    const modelsObj = cfg.models && typeof cfg.models === 'object' ? cfg.models : {}

    const orderedKeys = []
    for (const key of ['origin', 'base', 'final']) {
      if (modelsObj[key]) orderedKeys.push(key)
    }
    for (const key of Object.keys(modelsObj)) {
      if (!orderedKeys.includes(key)) orderedKeys.push(key)
    }

    for (const key of orderedKeys) {
      const model = modelsObj[key]
      const configuredPath = model?.path
      if (!configuredPath) continue

      const zipPath = packagedPathByKey?.get?.(key)
      const url = zipPath ? `./${zipPath}` : configuredPath

      const modelConfig = model?.config && typeof model.config === 'object' ? model.config : {}
      const position = Array.isArray(modelConfig.position) ? modelConfig.position : [0, 0, 0]
      const scale = Array.isArray(modelConfig.scale) ? modelConfig.scale : [1, 1, 1]
      const rotation = Array.isArray(modelConfig.rotation) ? modelConfig.rotation : [0, 0, 0]

      models.push({
        type: 'model',
        key,
        url,
        position,
        scale,
        rotation
      })
    }

    const texts = Array.isArray(cfg.texts) ? cfg.texts : []
    const exportedTexts = texts
      .filter((t) => t && typeof t === 'object')
      .map((t) => {
        const { index: _ignored, ...rest } = t
        return rest
      })

    const config2 = {
      version,
      createTime,
      status: cfg.status || 'draft',
      propIdentifier: cfg.propIdentifier || '',
      models,
      texts: exportedTexts,
      decorations: cfg.decorations || [],
      lookupTable: cfg.lookupTable || {},
      faceRepare: cfg.faceRepare ?? '0',
      modelOptimization: cfg.modelOptimization ?? '0',
      ...(cfg.metadata ? { metadata: cfg.metadata } : {})
    }

    return config2
  }

  _resolvePackageModelKeys(models, includeModels) {
    if (!models || typeof models !== 'object') return []

    const modelsObj = models as Record<string, any>

    if (includeModels === false) return []

    if (Array.isArray(includeModels)) {
      return includeModels
        .filter((k) => typeof k === 'string' && k.length > 0)
        .filter((k) => !!modelsObj[k]?.path)
    }

    // 默认：全量打包当前 config 里引用到的模型
    return Object.entries(modelsObj)
      .filter(([, model]) => !!(model as any)?.path)
      .map(([key]) => key)
  }

  _extractFileName(path) {
    if (typeof path !== 'string') return ''
    const cleaned = path.split('#')[0].split('?')[0].replace(/\\/g, '/')
    const parts = cleaned.split('/').filter(Boolean)
    return parts.length ? parts[parts.length - 1] : ''
  }

  _extractExt(name) {
    if (typeof name !== 'string') return ''
    const m = name.toLowerCase().match(/\.([a-z0-9]+)$/)
    return m ? m[1] : ''
  }

  _stripExt(name) {
    if (typeof name !== 'string') return ''
    return name.replace(/\.[a-z0-9]+$/i, '')
  }

  _sanitizeFileName(name) {
    if (typeof name !== 'string') return ''
    return name.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').trim()
  }

  _guessExtFromBlob(blob) {
    const type = blob?.type || ''
    if (type.includes('stl')) return 'stl'
    if (type.includes('obj')) return 'obj'
    if (type.includes('zip')) return 'zip'
    return ''
  }
}

export default ProjectManager
