import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { FontLoader, Font } from 'three/examples/jsm/loaders/FontLoader.js';
import { Entity, TextEntity, ModelEntity, EntityResource } from '../Document/Entity';

/**
 * 实体渲染器
 * 职责：根据 Entity 数据创建 Three.js 对象
 */
export class EntityRenderer {
  private fontLoader: FontLoader;
  private stlLoader: STLLoader;
  private loadedFonts: Map<string, Font>;
  private defaultFont: Font | null = null;

  constructor() {
    this.fontLoader = new FontLoader();
    this.stlLoader = new STLLoader();
    this.loadedFonts = new Map();

    // 预加载默认字体
    this.loadDefaultFont();
  }

  /**
   * 加载默认字体
   */
  private async loadDefaultFont(): Promise<void> {
    try {
      const font = await this.loadFont(
        '/node_modules/three/examples/fonts/helvetiker_regular.typeface.json'
      );
      this.defaultFont = font;
      this.loadedFonts.set('helvetiker', font);
    } catch (error) {
      console.warn('默认字体加载失败:', error);
    }
  }

  /**
   * 加载字体
   */
  private loadFont(fontPath: string): Promise<Font> {
    return new Promise((resolve, reject) => {
      this.fontLoader.load(
        fontPath,
        (font) => resolve(font),
        undefined,
        (error) => reject(error)
      );
    });
  }

  /**
   * 获取字体
   */
  private async getFont(fontName: string = 'helvetiker'): Promise<Font | null> {
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
      console.warn(`字体 ${fontName} 加载失败，使用默认字体`);
      return this.defaultFont;
    }
  }

  /**
   * 获取字体路径
   */
  private getFontPath(fontName: string): string {
    const fontPaths: Record<string, string> = {
      helvetiker: '/node_modules/three/examples/fonts/helvetiker_regular.typeface.json',
      helvetiker_bold: '/node_modules/three/examples/fonts/helvetiker_bold.typeface.json',
      optimer: '/node_modules/three/examples/fonts/optimer_regular.typeface.json',
    };
    return fontPaths[fontName] || fontPaths['helvetiker'];
  }

  /**
   * 根据 Entity 创建 Three.js 对象
   */
  async createObject(entity: Entity): Promise<THREE.Object3D | null> {
    let object: THREE.Object3D | null = null;

    if (entity.type === 'text') {
      object = await this.createTextMesh(entity as TextEntity);
    } else if (entity.type === 'model') {
      object = await this.createModelMesh(entity as ModelEntity);
    }

    if (object) {
      // 应用变换
      object.position.fromArray(entity.position);
      object.rotation.fromArray(entity.rotation);
      object.scale.fromArray(entity.scale);
      object.userData.entityId = entity.id;
      object.userData.entityType = entity.type;
    }

    return object;
  }

  /**
   * 创建文字网格
   */
  private async createTextMesh(entity: TextEntity): Promise<THREE.Mesh | null> {
    const font = await this.getFont(entity.fontType);
    if (!font) {
      // 创建备用几何体
      return this.createFallbackMesh(entity);
    }

    const geometry = new TextGeometry(entity.text || 'Text', {
      font: font,
      size: entity.size,
      depth: entity.depth,
      curveSegments: 12,
      bevelEnabled: false,
    });

    // 居中
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox!;
    geometry.translate(
      -(bb.max.x - bb.min.x) / 2,
      -(bb.max.y - bb.min.y) / 2,
      -(bb.max.z - bb.min.z) / 2
    );

    const color = typeof entity.color === 'number' ? entity.color : parseInt(entity.color as string, 16);
    const material = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.5,
      metalness: 0.1,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `TextEntity_${entity.id}`;
    return mesh;
  }

  /**
   * 创建模型网格
   */
  private async createModelMesh(entity: ModelEntity): Promise<THREE.Object3D | null> {
    const resource = entity.resource;

    try {
      const geometry = await this.loadModelGeometry(resource);
      geometry.center();

      const color = typeof entity.color === 'number' ? entity.color : parseInt(entity.color as string, 16);
      const material = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.5,
        metalness: 0.1,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `ModelEntity_${entity.id}`;
      return mesh;
    } catch (error) {
      console.error('模型加载失败:', error);
      return this.createFallbackMesh(entity);
    }
  }

  /**
   * 加载模型几何体
   */
  private loadModelGeometry(resource: EntityResource): Promise<THREE.BufferGeometry> {
    return new Promise((resolve, reject) => {
      if (typeof resource === 'string') {
        // URL
        this.stlLoader.load(
          resource,
          (geometry) => resolve(geometry),
          undefined,
          (error) => reject(error)
        );
      } else if ((typeof Blob !== 'undefined' && resource instanceof Blob) || (typeof File !== 'undefined' && resource instanceof File)) {
        // Blob/File
        const reader = new FileReader();
        reader.onload = (e) => {
          const arrayBuffer = e.target?.result as ArrayBuffer;
          const geometry = this.stlLoader.parse(arrayBuffer);
          resolve(geometry);
        };
        reader.onerror = () => reject(new Error('文件读取失败'));
        reader.readAsArrayBuffer(resource);
      } else {
        reject(new Error('不支持的资源类型'));
      }
    });
  }

  /**
   * 创建备用网格（当加载失败时）
   */
  private createFallbackMesh(entity: Entity): THREE.Mesh {
    const geometry = new THREE.BoxGeometry(2, 2, 0.5);
    const color = typeof entity.color === 'number' ? entity.color : 0x999999;
    const material = new THREE.MeshStandardMaterial({ color });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `Fallback_${entity.id}`;
    mesh.userData.isFallback = true;
    return mesh;
  }

  /**
   * 更新文字几何体
   */
  async updateTextGeometry(mesh: THREE.Mesh, entity: TextEntity): Promise<void> {
    const font = await this.getFont(entity.fontType);
    if (!font) return;

    // 销毁旧几何体
    mesh.geometry.dispose();

    // 创建新几何体
    const geometry = new TextGeometry(entity.text || 'Text', {
      font: font,
      size: entity.size,
      depth: entity.depth,
      curveSegments: 12,
      bevelEnabled: false,
    });

    geometry.computeBoundingBox();
    const bb = geometry.boundingBox!;
    geometry.translate(
      -(bb.max.x - bb.min.x) / 2,
      -(bb.max.y - bb.min.y) / 2,
      -(bb.max.z - bb.min.z) / 2
    );

    mesh.geometry = geometry;
  }

  /**
   * 更新颜色
   */
  updateColor(object: THREE.Object3D, color: string | number): void {
    const colorValue = typeof color === 'number' ? color : parseInt(color, 16);

    object.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => {
            if (m instanceof THREE.MeshStandardMaterial) {
              m.color.setHex(colorValue);
            }
          });
        } else if (child.material instanceof THREE.MeshStandardMaterial) {
          child.material.color.setHex(colorValue);
        }
      }
    });
  }

  /**
   * 销毁
   */
  dispose(): void {
    this.loadedFonts.clear();
    this.defaultFont = null;
  }
}

export default EntityRenderer;
