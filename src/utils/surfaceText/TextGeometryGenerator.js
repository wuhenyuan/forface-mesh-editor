import * as THREE from 'three'
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js'
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js'

/**
 * 文字几何体生成器
 * 负责生成3D文字几何体
 */
export class TextGeometryGenerator {
  constructor() {
    this.fontLoader = new FontLoader()
    this.loadedFonts = new Map() // 字体缓存
    this.defaultFont = null
    
    // 预加载默认字体
    this.loadDefaultFont()
  }
  
  /**
   * 加载默认字体
   */
  async loadDefaultFont() {
    try {
      // 使用Three.js内置的helvetiker字体
      const font = await this.loadFont('/node_modules/three/examples/fonts/helvetiker_regular.typeface.json')
      this.defaultFont = font
      this.loadedFonts.set('helvetiker', font)
      console.log('默认字体加载成功')
    } catch (error) {
      console.warn('默认字体加载失败，将使用备用方案:', error)
      // 创建一个简单的备用字体配置
      this.createFallbackFont()
    }
  }
  
  /**
   * 创建备用字体
   */
  createFallbackFont() {
    // 这里可以创建一个简单的几何体作为备用
    // 暂时使用null，在generate方法中处理
    this.defaultFont = null
  }
  
  /**
   * 加载字体文件
   * @param {string} fontPath - 字体文件路径
   * @returns {Promise<THREE.Font>} 字体对象
   */
  loadFont(fontPath) {
    return new Promise((resolve, reject) => {
      this.fontLoader.load(
        fontPath,
        (font) => resolve(font),
        (progress) => console.log('字体加载进度:', progress),
        (error) => reject(error)
      )
    })
  }
  
  /**
   * 获取字体
   * @param {string} fontName - 字体名称
   * @returns {Promise<THREE.Font>} 字体对象
   */
  async getFont(fontName = 'helvetiker') {
    // 检查缓存
    if (this.loadedFonts.has(fontName)) {
      return this.loadedFonts.get(fontName)
    }
    
    // 如果是默认字体且已加载
    if (fontName === 'helvetiker' && this.defaultFont) {
      return this.defaultFont
    }
    
    // 尝试加载字体
    try {
      const fontPath = this.getFontPath(fontName)
      const font = await this.loadFont(fontPath)
      this.loadedFonts.set(fontName, font)
      return font
    } catch (error) {
      console.warn(`字体 ${fontName} 加载失败，使用默认字体:`, error)
      return this.defaultFont || this.createFallbackGeometry()
    }
  }
  
  /**
   * 获取字体文件路径
   * @param {string} fontName - 字体名称
   * @returns {string} 字体文件路径
   */
  getFontPath(fontName) {
    const fontPaths = {
      'helvetiker': '/node_modules/three/examples/fonts/helvetiker_regular.typeface.json',
      'helvetiker_bold': '/node_modules/three/examples/fonts/helvetiker_bold.typeface.json',
      'optimer': '/node_modules/three/examples/fonts/optimer_regular.typeface.json',
      'optimer_bold': '/node_modules/three/examples/fonts/optimer_bold.typeface.json',
      'gentilis': '/node_modules/three/examples/fonts/gentilis_regular.typeface.json',
      'gentilis_bold': '/node_modules/three/examples/fonts/gentilis_bold.typeface.json'
    }
    
    return fontPaths[fontName] || fontPaths['helvetiker']
  }
  
  /**
   * 生成文字几何体
   * @param {string} text - 文字内容
   * @param {Object} config - 配置参数
   * @returns {Promise<THREE.TextGeometry>} 文字几何体
   */
  async generate(text, config = {}) {
    if (!text || typeof text !== 'string') {
      throw new Error('无效的文字内容')
    }
    
    // 合并默认配置
    const finalConfig = {
      font: 'helvetiker',
      size: 1,
      thickness: 0.1,
      curveSegments: 12,
      bevelEnabled: false,
      bevelThickness: 0.02,
      bevelSize: 0.01,
      bevelOffset: 0,
      bevelSegments: 5,
      ...config
    }
    
    try {
      // 获取字体
      const font = await this.getFont(finalConfig.font)
      
      if (!font) {
        // 如果没有字体，创建备用几何体
        return this.createFallbackGeometry(text, finalConfig)
      }
      
      // 创建文字几何体参数
      const geometryParams = {
        font: font,
        size: finalConfig.size,
        height: finalConfig.thickness, // Three.js中使用height表示厚度
        curveSegments: finalConfig.curveSegments,
        bevelEnabled: finalConfig.bevelEnabled,
        bevelThickness: finalConfig.bevelThickness,
        bevelSize: finalConfig.bevelSize,
        bevelOffset: finalConfig.bevelOffset,
        bevelSegments: finalConfig.bevelSegments
      }
      
      // 生成文字几何体
      const geometry = new TextGeometry(text, geometryParams)
      
      // 计算边界框并居中
      geometry.computeBoundingBox()
      const boundingBox = geometry.boundingBox
      
      const centerOffsetX = -0.5 * (boundingBox.max.x - boundingBox.min.x)
      const centerOffsetY = -0.5 * (boundingBox.max.y - boundingBox.min.y)
      const centerOffsetZ = -0.5 * (boundingBox.max.z - boundingBox.min.z)
      
      geometry.translate(centerOffsetX, centerOffsetY, centerOffsetZ)
      
      console.log(`文字几何体生成成功: "${text}"`, {
        config: finalConfig,
        boundingBox: boundingBox,
        vertices: geometry.attributes.position.count
      })
      
      return geometry
      
    } catch (error) {
      console.error('生成文字几何体失败:', error)
      
      // 尝试创建备用几何体
      try {
        return this.createFallbackGeometry(text, finalConfig)
      } catch (fallbackError) {
        console.error('创建备用几何体也失败:', fallbackError)
        throw new Error(`文字几何体生成完全失败: ${error.message}`)
      }
    }
  }
  
  /**
   * 创建备用几何体（当字体加载失败时使用）
   * @param {string} text - 文字内容
   * @param {Object} config - 配置参数
   * @returns {THREE.BoxGeometry} 备用几何体
   */
  createFallbackGeometry(text, config = {}) {
    console.warn(`使用备用几何体替代文字: "${text}"`)
    
    // 创建一个简单的盒子几何体作为占位符
    const width = Math.max(text.length * config.size * 0.6, config.size)
    const height = config.size
    const depth = config.thickness || 0.1
    
    const geometry = new THREE.BoxGeometry(width, height, depth)
    
    // 添加标记，表示这是备用几何体
    geometry.userData = {
      isFallback: true,
      originalText: text,
      config: config
    }
    
    return geometry
  }
  
  /**
   * 预加载常用字体
   * @param {string[]} fontNames - 字体名称数组
   * @returns {Promise<void>}
   */
  async preloadFonts(fontNames = ['helvetiker', 'helvetiker_bold', 'optimer']) {
    const loadPromises = fontNames.map(async (fontName) => {
      try {
        await this.getFont(fontName)
        console.log(`字体预加载成功: ${fontName}`)
      } catch (error) {
        console.warn(`字体预加载失败: ${fontName}`, error)
      }
    })
    
    await Promise.all(loadPromises)
    console.log('字体预加载完成')
  }
  
  /**
   * 获取可用字体列表
   * @returns {string[]} 字体名称数组
   */
  getAvailableFonts() {
    return [
      'helvetiker',
      'helvetiker_bold',
      'optimer',
      'optimer_bold',
      'gentilis',
      'gentilis_bold'
    ]
  }
  
  /**
   * 检查字体是否已加载
   * @param {string} fontName - 字体名称
   * @returns {boolean} 是否已加载
   */
  isFontLoaded(fontName) {
    return this.loadedFonts.has(fontName)
  }
  
  /**
   * 清理字体缓存
   * @param {string} fontName - 字体名称（可选，不提供则清理所有）
   */
  clearFontCache(fontName) {
    if (fontName) {
      this.loadedFonts.delete(fontName)
      console.log(`字体缓存已清理: ${fontName}`)
    } else {
      this.loadedFonts.clear()
      console.log('所有字体缓存已清理')
    }
  }
  
  /**
   * 获取文字几何体信息
   * @param {THREE.TextGeometry} geometry - 文字几何体
   * @returns {Object} 几何体信息
   */
  getGeometryInfo(geometry) {
    if (!geometry) return null
    
    geometry.computeBoundingBox()
    const boundingBox = geometry.boundingBox
    
    return {
      vertices: geometry.attributes.position.count,
      faces: geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3,
      boundingBox: {
        width: boundingBox.max.x - boundingBox.min.x,
        height: boundingBox.max.y - boundingBox.min.y,
        depth: boundingBox.max.z - boundingBox.min.z
      },
      isFallback: geometry.userData?.isFallback || false,
      originalText: geometry.userData?.originalText
    }
  }
  
  /**
   * 验证配置参数
   * @param {Object} config - 配置参数
   * @returns {Object} 验证结果
   */
  validateConfig(config) {
    const errors = []
    const warnings = []
    
    if (config.size !== undefined) {
      if (typeof config.size !== 'number' || config.size <= 0) {
        errors.push('size必须是正数')
      } else if (config.size > 10) {
        warnings.push('size过大可能影响性能')
      }
    }
    
    if (config.thickness !== undefined) {
      if (typeof config.thickness !== 'number' || config.thickness < 0) {
        errors.push('thickness必须是非负数')
      }
    }
    
    if (config.curveSegments !== undefined) {
      if (!Number.isInteger(config.curveSegments) || config.curveSegments < 1) {
        errors.push('curveSegments必须是正整数')
      } else if (config.curveSegments > 32) {
        warnings.push('curveSegments过大可能影响性能')
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings
    }
  }
  
  /**
   * 销毁生成器，清理资源
   */
  destroy() {
    this.clearFontCache()
    this.defaultFont = null
    console.log('文字几何体生成器已销毁')
  }
}