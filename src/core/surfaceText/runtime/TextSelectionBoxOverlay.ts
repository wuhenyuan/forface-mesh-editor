import * as THREE from 'three';

export class TextSelectionBoxOverlay {
  private _scene: THREE.Scene;
  private _helper: THREE.BoxHelper | null;
  private _color: number;

  constructor(scene: THREE.Scene, color = 0x52c41a) {
    this._scene = scene;
    this._helper = null;
    this._color = color;
  }

  attach(target: THREE.Object3D | null | undefined, color = this._color) {
    if (!target) return null;
    this.clear();

    const helper = new THREE.BoxHelper(target, color);
    helper.name = '__text_selection_box_helper__';
    helper.userData = {
      ...(helper.userData || {}),
      isHelper: true,
      isTextSelectionHelper: true,
    };

    this._scene.add(helper);
    this._helper = helper;
    return helper;
  }

  update() {
    if (!this._helper) return;
    this._helper.update();
    this._helper.updateMatrixWorld(true);
  }

  clear() {
    const helper = this._helper;
    if (!helper) return;

    if (helper.parent) {
      helper.parent.remove(helper);
    }
    helper.geometry?.dispose?.();
    const materials = Array.isArray(helper.material) ? helper.material : [helper.material];
    materials.forEach((material) => material?.dispose?.());
    this._helper = null;
  }

  get helper() {
    return this._helper;
  }

  dispose() {
    this.clear();
  }
}

export default TextSelectionBoxOverlay;

