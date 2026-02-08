import * as THREE from 'three';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { FontLoader, Font } from 'three/examples/jsm/loaders/FontLoader.js';

/**
 * 文字几何体生成器
 * 负责生成3D文字几何体
 */
export class TextGeometryGenerator {
  [key: string]: any;
  fontLoader: FontLoader;
  loadedFonts: Map<string, Font>;
  defaultFont: Font | null;

  constructor() {
    this.fontLoader = new FontLoader();
    this.loadedFonts = new Map();
    this.defaultFont = null;

    // 预加载默认字体
    this.loadDefaultFont();
  }

  /**
   * 加载默认字体
   */
  async loadDefaultFont() {
    try {
      const font = await this.loadFont(
        '/node_modules/three/examples/fonts/helvetiker_regular.typeface.json'
      );
      this.defaultFont = font;
      this.loadedFonts.set('helvetiker', font);
      console.log('默认字体加载成功');
    } catch (error) {
      console.warn('默认字体加载失败，将使用备用方案:', error);
    }
  }

  /**
   * 加载字体文件
   */
  loadFont(fontPath: string): Promise<Font> {
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
   */
  async getFont(fontName = 'helvetiker'): Promise<Font | null> {
    if (this.loadedFonts.has(fontName)) {
      return this.loadedFonts.get(fontName)!;
    }

    if (fontName === 'helvetiker' && this.defaultFont) {
      return this.defaultFont;
    }

    try {
      const fontPath = this.getFontPath(fontName);
      const font = await this.loadFont(fontPath);
      this.loadedFonts.set(fontName, font);
      return font;
    } catch (error) {
      console.warn(`字体 ${fontName} 加载失败，使用默认字体:`, error);
      return this.defaultFont;
    }
  }

  /**
   * 获取字体文件路径
   */
  getFontPath(fontName: string): string {
    const fontPaths: Record<string, string> = {
      helvetiker: '/node_modules/three/examples/fonts/helvetiker_regular.typeface.json',
      helvetiker_bold: '/node_modules/three/examples/fonts/helvetiker_bold.typeface.json',
      optimer: '/node_modules/three/examples/fonts/optimer_regular.typeface.json',
      optimer_bold: '/node_modules/three/examples/fonts/optimer_bold.typeface.json',
      gentilis: '/node_modules/three/examples/fonts/gentilis_regular.typeface.json',
      gentilis_bold: '/node_modules/three/examples/fonts/gentilis_bold.typeface.json',
    };

    return fontPaths[fontName] || fontPaths['helvetiker'];
  }

  /**
   * 生成文字几何体
   */
  async generate(text: string, config: Record<string, any> = {}): Promise<THREE.BufferGeometry> {
    if (!text || typeof text !== 'string') {
      throw new Error('无效的文字内容');
    }

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

    try {
      if (!this.defaultFont) {
        console.log('等待默认字体加载...');
        await this.loadDefaultFont();
      }

      const font = await this.getFont(finalConfig.font);

      if (!font) {
        console.warn('字体加载失败，使用备用几何体');
        return this.createFallbackGeometry(text, finalConfig);
      }

      return this.generateFlatText(text, font, finalConfig);
    } catch (error) {
      console.error('生成文字几何体失败:', error);
      return this.createFallbackGeometry(text, finalConfig);
    }
  }

  /**
   * 生成平面文字
   */
  generateFlatText(text: string, font: Font, config: Record<string, any>): THREE.BufferGeometry {
    const geometryParams = {
      font: font,
      size: config.size,
      depth: config.thickness,
      curveSegments: config.curveSegments,
      bevelEnabled: config.bevelEnabled,
      bevelThickness: config.bevelThickness,
      bevelSize: config.bevelSize,
      bevelOffset: config.bevelOffset,
      bevelSegments: config.bevelSegments,
    };

    const geometry = new TextGeometry(text, geometryParams);

    // 计算边界框并居中
    geometry.computeBoundingBox();
    const boundingBox = geometry.boundingBox!;

    const centerOffsetX = -0.5 * (boundingBox.max.x - boundingBox.min.x);
    const centerOffsetY = -0.5 * (boundingBox.max.y - boundingBox.min.y);
    const centerOffsetZ = -0.5 * (boundingBox.max.z - boundingBox.min.z);

    geometry.translate(centerOffsetX, centerOffsetY, centerOffsetZ);

    console.log(`平面文字几何体生成成功: "${text}"`);

    return geometry;
  }

  /**
   * 创建备用几何体（当字体加载失败时使用）
   */
  createFallbackGeometry(text = '', config: Record<string, any> = {}): THREE.BoxGeometry {
    console.warn(`使用备用几何体替代文字: "${text}"`);

    const size = typeof config.size === 'number' && config.size > 0 ? config.size : 1;
    const width = Math.max(text.length * size * 0.6, size);
    const height = size;
    const depth = typeof config.thickness === 'number' ? config.thickness : 0.1;

    const geometry = new THREE.BoxGeometry(width, height, depth);

    geometry.userData = {
      isFallback: true,
      originalText: text,
      config: config,
    };

    return geometry;
  }

  /**
   * 预加载常用字体
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
   */
  getAvailableFonts(): string[] {
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
   */
  isFontLoaded(fontName: string): boolean {
    return this.loadedFonts.has(fontName);
  }

  /**
   * 清理字体缓存
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
   * 销毁生成器，清理资源
   */
  destroy() {
    this.clearFontCache();
    this.defaultFont = null;
    console.log('文字几何体生成器已销毁');
  }
}
