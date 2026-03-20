import * as THREE from 'three';

/**
 * 选中物体的包围盒辅助显示（包围盒 + 长宽高标注）
 */
export class ObjectBoundsHelper {
  [key: string]: unknown;

  constructor(scene: THREE.Scene, options: Record<string, any> = {}) {
    this.scene = scene;
    this.options = {
      color: 0x00ff00,
      opacity: 0.9,
      depthTest: false,
      renderOrder: 999,
      labelOffset: null, // 默认根据包围盒大小自动计算
      labelMinWorldHeight: 0.08,
      labelMaxWorldHeight: 3,
      labelBackground: true, // 是否绘制文字背景
      ...options,
    };

    this._box = new THREE.Box3();
    this._root = new THREE.Group();
    this._root.name = '__object_bounds_helper__';
    this._root.userData.isHelper = true;

    this._boxHelper = new THREE.Box3Helper(this._box, this.options.color);
    this._boxHelper.userData.isHelper = true;
    this._boxHelper.renderOrder = this.options.renderOrder;

    const material = this._boxHelper.material as THREE.LineBasicMaterial;
    material.depthTest = !!this.options.depthTest;
    material.transparent = true;
    material.opacity = this.options.opacity;

    this._root.add(this._boxHelper);

    this._labels = {
      length: this._createLabelSprite('长(X): 0'),
      height: this._createLabelSprite('高(Y): 0'),
      width: this._createLabelSprite('宽(Z): 0'),
    };
    Object.values(this._labels).forEach((sprite: THREE.Sprite) => {
      sprite.userData.isHelper = true;
      sprite.renderOrder = this.options.renderOrder + 1;
      this._root.add(sprite);
    });

    this._root.visible = false;
    this.scene.add(this._root);

    this._currentObject = null;
    this._tmpSize = new THREE.Vector3();
    this._tmpCenter = new THREE.Vector3();
    this._tmpPos = new THREE.Vector3();
    this._tmpDir = new THREE.Vector3();
  }

  attach(object: THREE.Object3D) {
    this._currentObject = object || null;
    this._root.visible = !!this._currentObject;
    this.update();
  }

  detach() {
    this._currentObject = null;
    this._root.visible = false;
  }

  setLabelBackgroundVisible(visible: boolean) {
    this.options.labelBackground = !!visible;
    Object.values(this._labels || {}).forEach((sprite: THREE.Sprite) => {
      if (sprite?.userData) sprite.userData.__labelText = null;
    });
    this.update();
  }

  update(object?: THREE.Object3D) {
    const target = object || this._currentObject;
    if (!target) return;

    this._box.setFromObject(target);
    if (this._box.isEmpty()) return;

    const size = this._box.getSize(this._tmpSize);
    const center = this._box.getCenter(this._tmpCenter);
    const diag = size.length();

    const labelWorldHeight = THREE.MathUtils.clamp(
      diag * 0.05,
      this.options.labelMinWorldHeight,
      this.options.labelMaxWorldHeight
    );

    const textLength = `长(X): ${size.x.toFixed(2)}`;
    const textHeight = `高(Y): ${size.y.toFixed(2)}`;
    const textWidth = `宽(Z): ${size.z.toFixed(2)}`;

    this._updateLabelSprite(this._labels.length, textLength, labelWorldHeight);
    this._updateLabelSprite(this._labels.height, textHeight, labelWorldHeight);
    this._updateLabelSprite(this._labels.width, textWidth, labelWorldHeight);

    const min = this._box.min;
    const max = this._box.max;
    const midX = (min.x + max.x) / 2;
    const midY = (min.y + max.y) / 2;
    const midZ = (min.z + max.z) / 2;

    const offset =
      typeof this.options.labelOffset === 'number'
        ? this.options.labelOffset
        : THREE.MathUtils.clamp(diag * 0.02, 0.01, 2);

    this._placeLabel(this._labels.length, midX, min.y, max.z, center, offset);
    this._placeLabel(this._labels.height, min.x, midY, max.z, center, offset);
    this._placeLabel(this._labels.width, max.x, min.y, midZ, center, offset);

    this._boxHelper.updateMatrixWorld(true);
  }

  dispose() {
    this.scene.remove(this._root);
    this._boxHelper.geometry?.dispose?.();
    (this._boxHelper.material as THREE.Material)?.dispose?.();
    Object.values(this._labels || {}).forEach((sprite: THREE.Sprite) => {
      const material = sprite.material as THREE.SpriteMaterial;
      material.map?.dispose?.();
      material.dispose?.();
    });
    this._currentObject = null;
  }

  _placeLabel(
    sprite: THREE.Sprite,
    x: number,
    y: number,
    z: number,
    center: THREE.Vector3,
    offset: number
  ) {
    this._tmpPos.set(x, y, z);
    this._tmpDir.copy(this._tmpPos).sub(center);
    if (this._tmpDir.lengthSq() > 1e-8) {
      this._tmpDir.normalize().multiplyScalar(offset);
      this._tmpPos.add(this._tmpDir);
    }
    sprite.position.copy(this._tmpPos);
  }

  _createLabelSprite(text: string) {
    const { texture, aspect } = this._createLabelTexture(text);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: !!this.options.depthTest,
      depthWrite: false,
    });
    material.needsUpdate = true;

    const sprite = new THREE.Sprite(material);
    sprite.userData.__labelText = text;
    sprite.userData.__labelAspect = aspect;
    sprite.userData.isHelper = true;
    return sprite;
  }

  _updateLabelSprite(sprite: THREE.Sprite, text: string, worldHeight: number) {
    if (!sprite) return;

    const currentText = sprite.userData.__labelText;
    if (currentText !== text) {
      const { texture, aspect } = this._createLabelTexture(text);
      const material = sprite.material as THREE.SpriteMaterial;
      material.map?.dispose?.();
      material.map = texture;
      material.needsUpdate = true;
      sprite.userData.__labelText = text;
      sprite.userData.__labelAspect = aspect;
    }

    const aspect = sprite.userData.__labelAspect || 1;
    sprite.scale.set(worldHeight * aspect, worldHeight, 1);
  }

  _createLabelTexture(text: string) {
    if (typeof document === 'undefined') {
      const texture = new THREE.Texture();
      texture.needsUpdate = true;
      return { texture, aspect: 1 };
    }

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const fontSize = 42;
    const paddingX = 18;
    const paddingY = 12;
    const fontFamily = 'Arial, sans-serif';

    const measureCanvas = document.createElement('canvas');
    const measureCtx = measureCanvas.getContext('2d');
    if (!measureCtx) {
      const texture = new THREE.Texture();
      texture.needsUpdate = true;
      return { texture, aspect: 1 };
    }

    measureCtx.font = `600 ${fontSize}px ${fontFamily}`;
    const textWidth = Math.ceil(measureCtx.measureText(text).width);

    const width = textWidth + paddingX * 2;
    const height = fontSize + paddingY * 2;

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(width * dpr);
    canvas.height = Math.ceil(height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      const texture = new THREE.Texture();
      texture.needsUpdate = true;
      return { texture, aspect: 1 };
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const showBackground = this.options.labelBackground !== false;
    if (showBackground) {
      // 背景
      ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.fillRect(0, 0, width, height);

      // 边框
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, width - 2, height - 2);
    }

    // 文字
    ctx.font = `600 ${fontSize}px ${fontFamily}`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (!showBackground) {
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.lineWidth = 6;
      ctx.strokeText(text, width / 2, height / 2);
    }
    ctx.fillText(text, width / 2, height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;

    return { texture, aspect: width / height };
  }
}

export default ObjectBoundsHelper;
