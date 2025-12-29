/**
 * 配置管理器
 * 处理编辑器状态的保存和恢复
 */
import { surfaceIdentifier } from './SurfaceIdentifier.js'

export class ConfigManager {
  constructor(surfaceTextManager) {
    this.surfaceTextManager = surfaceTextManager
  }

  /**
   * 导出完整的编辑器配置
   * @returns {Object} 符合config.js格式的配置对象
   */
  exportConfig() {
    const config = {
      // 根据图片生成或导入的未经过编辑的模型地址
      originModelPath: '',
      // 底座模型地址
      baseModelPath: '',
      // 经过编辑后导出并上传到后端的地址
      finalModelPath: '',
      // 当前项目的状态
      status: 'editable',
      // 版本标识
      propIdentifier: this.generatePropIdentifier(),
      
      // 导出的模型的属性
      finalModelConfig: this.exportModelConfig(),
      
      // 底座模型配置
      baseModelConfig: {
        position: [0, 0, 0],
        scale: [1, 1, 1],
        rotation: [0, 0, 0],
        surface: 100,
        volume: 1000,
        boundingBox: [10, 10, 10],
        obb: [10, 10, 10]
      },
      
      // 装饰配置
      decorations: [{}],
      
      // 文字配置
      texts: this.surfaceTextManager.exportTextConfig(),
      
      // 表面标识查找表
      lookupTable: surfaceIdentifier.exportConfig(),
      
      // 破面修补
      faceRepare: '0',
      // 模型优化操作
      modelOptimization: '0',
      
      // 元数据
      metadata: {
        version: '1.0',
        created: new Date().toISOString(),
        editor: 'forface-mesh-editor'
      }
    }
    
    return config
  }

  /**
   * 导入配置并恢复编辑器状态
   * @param {Object} config - 配置对象
   */
  async importConfig(config) {
    if (!config || !config.metadata || config.metadata.version !== '1.0') {
      console.warn('不支持的配置版本')
      return false
    }
    
    try {
      // 1. 导入表面标识配置
      if (config.lookupTable) {
        surfaceIdentifier.importConfig(config.lookupTable)
      }
      
      // 2. 清除现有文字
      await this.clearAllTexts()
      
      // 3. 导入文字配置
      if (config.texts && Array.isArray(config.texts)) {
        await this.surfaceTextManager.importTextConfig(config.texts)
      }
      
      console.log('配置导入成功')
      return true
      
    } catch (error) {
      console.error('配置导入失败:', error)
      return false
    }
  }

  /**
   * 生成属性标识符
   * @returns {string} 属性标识符
   */
  generatePropIdentifier() {
    const texts = this.surfaceTextManager.exportTextConfig()
    const textInfo = texts.map(t => `${t.text}_${t.size}_${t.position.join(',')}`).join('|')
    
    // 简单哈希
    let hash = 0
    for (let i = 0; i < textInfo.length; i++) {
      const char = textInfo.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }
    
    return `prop_${Math.abs(hash).toString(16)}_${Date.now()}`
  }

  /**
   * 导出模型配置
   * @returns {Object} 模型配置
   */
  exportModelConfig() {
    // 获取场景中的主要模型
    const targetMeshes = this.surfaceTextManager.targetMeshes || []
    if (targetMeshes.length === 0) {
      return {
        position: [0, 0, 0],
        scale: [1, 1, 1],
        rotation: [0, 0, 0],
        surface: 100,
        volume: 1000,
        boundingBox: [10, 10, 10]
      }
    }
    
    const mainMesh = targetMeshes[0] // 假设第一个是主模型
    
    // 计算包围盒
    mainMesh.geometry.computeBoundingBox()
    const boundingBox = mainMesh.geometry.boundingBox
    const size = boundingBox.getSize(new THREE.Vector3())
    
    return {
      position: mainMesh.position.toArray(),
      scale: mainMesh.scale.toArray(),
      rotation: mainMesh.rotation.toArray(),
      surface: this.calculateSurfaceArea(mainMesh.geometry),
      volume: this.calculateVolume(mainMesh.geometry),
      boundingBox: [size.x, size.y, size.z]
    }
  }

  /**
   * 计算表面积（简化计算）
   * @param {THREE.BufferGeometry} geometry - 几何体
   * @returns {number} 表面积
   */
  calculateSurfaceArea(geometry) {
    // 简化计算，实际应该计算所有三角形面积之和
    const boundingBox = geometry.boundingBox
    const size = boundingBox.getSize(new THREE.Vector3())
    return 2 * (size.x * size.y + size.y * size.z + size.z * size.x)
  }

  /**
   * 计算体积（简化计算）
   * @param {THREE.BufferGeometry} geometry - 几何体
   * @returns {number} 体积
   */
  calculateVolume(geometry) {
    // 简化计算，使用包围盒体积
    const boundingBox = geometry.boundingBox
    const size = boundingBox.getSize(new THREE.Vector3())
    return size.x * size.y * size.z
  }

  /**
   * 清除所有文字
   */
  async clearAllTexts() {
    const textIds = Array.from(this.surfaceTextManager.textObjects.keys())
    for (const textId of textIds) {
      this.surfaceTextManager.deleteText(textId)
    }
  }

  /**
   * 保存配置到本地存储
   * @param {string} key - 存储键名
   */
  saveToLocalStorage(key = 'mesh-editor-config') {
    const config = this.exportConfig()
    try {
      localStorage.setItem(key, JSON.stringify(config))
      console.log('配置已保存到本地存储')
      return true
    } catch (error) {
      console.error('保存配置失败:', error)
      return false
    }
  }

  /**
   * 从本地存储加载配置
   * @param {string} key - 存储键名
   */
  async loadFromLocalStorage(key = 'mesh-editor-config') {
    try {
      const configStr = localStorage.getItem(key)
      if (!configStr) {
        console.log('本地存储中没有找到配置')
        return false
      }
      
      const config = JSON.parse(configStr)
      return await this.importConfig(config)
    } catch (error) {
      console.error('加载配置失败:', error)
      return false
    }
  }

  /**
   * 导出配置为JSON文件
   * @param {string} filename - 文件名
   */
  downloadConfig(filename = 'mesh-editor-config.json') {
    const config = this.exportConfig()
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    
    console.log('配置文件已下载:', filename)
  }

  /**
   * 从文件导入配置
   * @param {File} file - 配置文件
   */
  async uploadConfig(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      
      reader.onload = async (e) => {
        try {
          const config = JSON.parse(e.target.result)
          const success = await this.importConfig(config)
          resolve(success)
        } catch (error) {
          reject(error)
        }
      }
      
      reader.onerror = () => reject(new Error('文件读取失败'))
      reader.readAsText(file)
    })
  }
}

// 创建全局配置管理器实例的工厂函数
export function createConfigManager(surfaceTextManager) {
  return new ConfigManager(surfaceTextManager)
}