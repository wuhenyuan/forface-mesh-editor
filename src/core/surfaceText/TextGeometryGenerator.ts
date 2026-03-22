import * as THREE from 'three';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { CylinderTextGeometry } from './CylinderTextGeometry';
import { CSGCylinderText } from './CSGCylinderText';

/**
 * 文字几何体生成器
 * 负责生成3D文字几何体
 */
export class TextGeometryGenerator {
  [key: string]: CoreValue;
  constructor() {
    this.fontLoader = new FontLoader();
    this.loadedFonts = new Map(); // 字体缓存
    this.defaultFont = null;

    // 旧的圆柱面文字生成器（坐标映射方法）
    this.cylinderTextGenerator = new CylinderTextGeometry();

    // 新的 CSG 圆柱面文字生成器（布尔操作方法）
    this.csgCylinderText = new CSGCylinderText();

    // 圆柱面文字生成方法：'csg' | 'mapping'
    // 'csg' - 使用 CSG 布尔操作（更精确，但较慢）
    // 'mapping' - 使用坐标映射（较快，但可能有变形）
    this.cylinderTextMethod = 'csg';

    // 预加载默认字体
    this.loadDefaultFont();
  }

  /**
   * 加载默认字体
   */
  async loadDefaultFont() {
    try {
      // 使用Three.js内置的helvetiker字体
      const font = await this.loadFont(
        '/node_modules/three/examples/fonts/helvetiker_regular.typeface.json'
      );
      this.defaultFont = font;
      this.loadedFonts.set('helvetiker', font);
      console.log('默认字体加载成功');
    } catch (error) {
      console.warn('默认字体加载失败，将使用备用方案:', error);
      // 创建一个简单的备用字体配置
      this.createFallbackFont();
    }
  }

  /**
   * 创建备用字体
   */
  createFallbackFont() {
    // 这里可以创建一个简单的几何体作为备用
    // 暂时使用null，在generate方法中处理
    this.defaultFont = null;
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
      );
    });
  }

  /**
   * 获取字体
   * @param {string} fontName - 字体名称
   * @returns {Promise<THREE.Font>} 字体对象
   */
  async getFont(fontName = 'helvetiker') {
    // 检查缓存
    if (this.loadedFonts.has(fontName)) {
      return this.loadedFonts.get(fontName);
    }

    // 如果是默认字体且已加载
    if (fontName === 'helvetiker' && this.defaultFont) {
      return this.defaultFont;
    }

    // 尝试加载字体
    try {
      const fontPath = this.getFontPath(fontName);
      const font = await this.loadFont(fontPath);
      this.loadedFonts.set(fontName, font);
      return font;
    } catch (error) {
      console.warn(`字体 ${fontName} 加载失败，使用默认字体:`, error);
      return this.defaultFont || this.createFallbackGeometry();
    }
  }

  /**
   * 获取字体文件路径
   * @param {string} fontName - 字体名称
   * @returns {string} 字体文件路径
   */
  getFontPath(fontName) {
    const fontPaths = {
      helvetiker: '/node_modules/three/examples/fonts/helvetiker_regular.typeface.json',
      helvetiker_bold: '/node_modules/three/examples/fonts/helvetiker_bold.typeface.json',
      optimer: '/node_modules/three/examples/fonts/optimer_regular.typeface.json',
      optimer_bold: '/node_modules/three/examples/fonts/optimer_bold.typeface.json',
      gentilis: '/node_modules/three/examples/fonts/gentilis_regular.typeface.json',
      gentilis_bold: '/node_modules/three/examples/fonts/gentilis_bold.typeface.json',
      // 中文字体 - 使用本地字体文件
      chinese: '/fonts/chinese_regular.typeface.json',
      noto_sans_sc: '/fonts/NotoSansSC_Regular.typeface.json',
    };

    return fontPaths[fontName] || fontPaths['helvetiker'];
  }

  /**
   * 检测文本是否包含中文字符
   * @param {string} text - 文本内容
   * @returns {boolean} 是否包含中文
   */
  containsChinese(text) {
    return /[\u4e00-\u9fa5]/.test(text);
  }

  /**
   * 生成文字几何体（支持平面和圆柱面）
   * @param {string} text - 文字内容
   * @param {Object} config - 配置参数
   * @param {Object} surfaceInfo - 表面信息（可选，用于圆柱面拟合）
   * @returns {Promise<THREE.BufferGeometry>} 文字几何体
   */
  async generate(text, config = {}, surfaceInfo = null) {
    if (!text || typeof text !== 'string') {
      throw new Error('无效的文字内容');
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
      ...config,
    };

    // 检查表面信息
    if (surfaceInfo) {
      console.log('🎯 检测到表面信息:', {
        surfaceType: surfaceInfo.surfaceType,
        hasCylinderInfo: !!surfaceInfo.cylinderInfo,
      });
    }

    // 自动检测中文，切换到中文字体
    // 暂时禁用自动切换，因为中文字体文件还未准备好
    // if (this.containsChinese(text) && finalConfig.font === 'helvetiker') {
    //   finalConfig.font = 'chinese'
    //   console.log('检测到中文内容，自动切换到中文字体')
    // }

    try {
      // 检查字体加载状态
      if (!this.defaultFont) {
        console.log('⏳ 等待默认字体加载...');
        await this.loadDefaultFont();
      }

      // 获取字体
      const font = await this.getFont(finalConfig.font);

      if (!font) {
        console.warn('⚠️ 字体加载失败，使用备用几何体');
        // 如果没有字体，创建备用几何体
        return this.createFallbackGeometry(text, finalConfig);
      }

      // 检查是否需要圆柱面拟合
      if (surfaceInfo && surfaceInfo.surfaceType === 'cylinder') {
        console.log('🔄 生成圆柱面拟合文字');
        return this.generateCylinderText(text, font, surfaceInfo, finalConfig);
      } else {
        console.log('📝 生成平面文字');
        return this.generateFlatText(text, font, finalConfig);
      }
    } catch (error) {
      console.error('生成文字几何体失败:', error);

      // 尝试创建备用几何体
      try {
        return this.createFallbackGeometry(text, finalConfig);
      } catch (fallbackError) {
        console.error('创建备用几何体也失败:', fallbackError);
        throw new Error(`文字几何体生成完全失败: ${error.message}`);
      }
    }
  }

  /**
   * 生成圆柱面拟合文字
   * 支持两种方法：CSG 布尔操作 和 坐标映射
   * @param {string} text - 文字内容
   * @param {THREE.Font} font - 字体
   * @param {Object} surfaceInfo - 表面信息
   * @param {Object} config - 配置
   * @returns {THREE.BufferGeometry} 圆柱面文字几何体
   */
  generateCylinderText(text, font, surfaceInfo, config) {
    const { cylinderInfo, attachPoint } = surfaceInfo;

    console.log(`🔧 生成圆柱面文字: "${text}" (方法: ${this.cylinderTextMethod})`, {
      cylinderInfo: {
        center: cylinderInfo.center,
        axis: cylinderInfo.axis,
        radius: cylinderInfo.radius,
      },
      attachPoint,
      config,
    });

    let geometry;

    if (this.cylinderTextMethod === 'csg') {
      // 使用 CSG 布尔操作方法（更精确）
      console.log('🔄 使用 CSG 布尔操作生成圆柱面文字');

      try {
        geometry = this.csgCylinderText.generateSimple(text, font, cylinderInfo, attachPoint, {
          size: config.size || 1,
          thickness: config.thickness || 0.5,
          textHeight: 30, // 切割用的文字厚度
          cylinderSegments: 64,
          curveSegments: config.curveSegments || 12,
          bevelEnabled: config.bevelEnabled || false,
        });

        console.log(`✅ CSG 圆柱面文字生成成功: "${text}"`, {
          vertices: geometry.attributes.position?.count || 0,
          generatorType: 'CSGCylinderText',
        });
      } catch (error) {
        console.warn('⚠️ CSG 方法失败，回退到坐标映射方法:', error.message);
        // 回退到坐标映射方法
        geometry = this.generateCylinderTextByMapping(
          text,
          font,
          cylinderInfo,
          attachPoint,
          config
        );
      }
    } else {
      // 使用坐标映射方法（较快）
      geometry = this.generateCylinderTextByMapping(text, font, cylinderInfo, attachPoint, config);
    }

    return geometry;
  }

  /**
   * 使用坐标映射方法生成圆柱面文字
   * @param {string} text - 文字内容
   * @param {THREE.Font} font - 字体
   * @param {Object} cylinderInfo - 圆柱信息
   * @param {THREE.Vector3} attachPoint - 附着点
   * @param {Object} config - 配置
   * @returns {THREE.BufferGeometry} 圆柱面文字几何体
   */
  generateCylinderTextByMapping(text, font, cylinderInfo, attachPoint, config) {
    console.log('🔄 使用坐标映射生成圆柱面文字');

    const geometry = this.cylinderTextGenerator.generate(
      text,
      font,
      cylinderInfo,
      attachPoint,
      config
    );

    console.log(`✅ 坐标映射圆柱面文字生成成功: "${text}"`, {
      vertices: geometry.attributes.position?.count || 0,
      isManifold: geometry.userData?.isManifold || false,
      generatorType: geometry.userData?.generatorType || 'CylinderTextGeometry',
    });

    return geometry;
  }

  /**
   * 设置圆柱面文字生成方法
   * @param {string} method - 'csg' | 'mapping'
   */
  setCylinderTextMethod(method) {
    if (method === 'csg' || method === 'mapping') {
      this.cylinderTextMethod = method;
      console.log(`圆柱面文字生成方法已设置为: ${method}`);
    } else {
      console.warn(`无效的方法: ${method}，保持当前方法: ${this.cylinderTextMethod}`);
    }
  }

  /**
   * 获取当前圆柱面文字生成方法
   * @returns {string} 'csg' | 'mapping'
   */
  getCylinderTextMethod() {
    return this.cylinderTextMethod;
  }

  /**
   * 生成平面文字
   * @param {string} text - 文字内容
   * @param {THREE.Font} font - 字体
   * @param {Object} config - 配置
   * @returns {THREE.BufferGeometry} 平面文字几何体
   */
  generateFlatText(text, font, config) {
    // 创建文字几何体参数
    const geometryParams = {
      font: font,
      size: config.size,
      height: config.thickness, // Three.js中使用height表示厚度
      curveSegments: config.curveSegments,
      bevelEnabled: config.bevelEnabled,
      bevelThickness: config.bevelThickness,
      bevelSize: config.bevelSize,
      bevelOffset: config.bevelOffset,
      bevelSegments: config.bevelSegments,
    };

    // 生成文字几何体
    const geometry = new TextGeometry(text, geometryParams);

    // 计算边界框并居中
    geometry.computeBoundingBox();
    const boundingBox = geometry.boundingBox;

    const centerOffsetX = -0.5 * (boundingBox.max.x - boundingBox.min.x);
    const centerOffsetY = -0.5 * (boundingBox.max.y - boundingBox.min.y);
    const centerOffsetZ = -0.5 * (boundingBox.max.z - boundingBox.min.z);

    geometry.translate(centerOffsetX, centerOffsetY, centerOffsetZ);

    console.log(`平面文字几何体生成成功: "${text}"`, {
      config: config,
      boundingBox: boundingBox,
      vertices: geometry.attributes.position.count,
    });

    return geometry;
  }

  /**
   * 创建备用几何体（当字体加载失败时使用）
   * @param {string} text - 文字内容
   * @param {Object} config - 配置参数
   * @returns {THREE.BoxGeometry} 备用几何体
   */
  createFallbackGeometry(text = '', config: Record<string, CoreValue> = {}) {
    console.warn(`使用备用几何体替代文字: "${text}"`);

    // 创建一个简单的盒子几何体作为占位符
    const size = typeof config.size === 'number' && config.size > 0 ? config.size : 1;
    const width = Math.max(text.length * size * 0.6, size);
    const height = size;
    const depth = typeof config.thickness === 'number' ? config.thickness : 0.1;

    const geometry = new THREE.BoxGeometry(width, height, depth);

    // 添加标记，表示这是备用几何体
    geometry.userData = {
      isFallback: true,
      originalText: text,
      config: config,
    };

    return geometry;
  }

  /**
   * 预加载常用字体
   * @param {string[]} fontNames - 字体名称数组
   * @returns {Promise<void>}
   */
  async preloadFonts(fontNames = ['helvetiker', 'helvetiker_bold', 'optimer']) {
    const loadPromises = fontNames.map(async (fontName) => {
      try {
        await this.getFont(fontName);
        console.log(`字体预加载成功: ${fontName}`);
      } catch (error) {
        console.warn(`字体预加载失败: ${fontName}`, error);
      }
    });

    await Promise.all(loadPromises);
    console.log('字体预加载完成');
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
      'gentilis_bold',
    ];
  }

  /**
   * 检查字体是否已加载
   * @param {string} fontName - 字体名称
   * @returns {boolean} 是否已加载
   */
  isFontLoaded(fontName) {
    return this.loadedFonts.has(fontName);
  }

  /**
   * 清理字体缓存
   * @param {string} fontName - 字体名称（可选，不提供则清理所有）
   */
  clearFontCache(fontName?: string) {
    if (fontName) {
      this.loadedFonts.delete(fontName);
      console.log(`字体缓存已清理: ${fontName}`);
    } else {
      this.loadedFonts.clear();
      console.log('所有字体缓存已清理');
    }
  }

  /**
   * 获取文字几何体信息
   * @param {THREE.TextGeometry} geometry - 文字几何体
   * @returns {Object} 几何体信息
   */
  getGeometryInfo(geometry) {
    if (!geometry) return null;

    geometry.computeBoundingBox();
    const boundingBox = geometry.boundingBox;

    return {
      vertices: geometry.attributes.position.count,
      faces: geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3,
      boundingBox: {
        width: boundingBox.max.x - boundingBox.min.x,
        height: boundingBox.max.y - boundingBox.min.y,
        depth: boundingBox.max.z - boundingBox.min.z,
      },
      isFallback: geometry.userData?.isFallback || false,
      originalText: geometry.userData?.originalText,
    };
  }

  /**
   * 验证配置参数
   * @param {Object} config - 配置参数
   * @returns {Object} 验证结果
   */
  validateConfig(config) {
    const errors = [];
    const warnings = [];

    if (config.size !== undefined) {
      if (typeof config.size !== 'number' || config.size <= 0) {
        errors.push('size必须是正数');
      } else if (config.size > 10) {
        warnings.push('size过大可能影响性能');
      }
    }

    if (config.thickness !== undefined) {
      if (typeof config.thickness !== 'number' || config.thickness < 0) {
        errors.push('thickness必须是非负数');
      }
    }

    if (config.curveSegments !== undefined) {
      if (!Number.isInteger(config.curveSegments) || config.curveSegments < 1) {
        errors.push('curveSegments必须是正整数');
      } else if (config.curveSegments > 32) {
        warnings.push('curveSegments过大可能影响性能');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 销毁生成器，清理资源
   */
  destroy() {
    this.clearFontCache();
    this.defaultFont = null;
    console.log('文字几何体生成器已销毁');
  }
}
