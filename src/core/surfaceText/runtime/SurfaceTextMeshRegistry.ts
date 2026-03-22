import * as THREE from 'three';

type SurfaceTextMeshRegistryOptions = {
  registerMesh?: (mesh: THREE.Mesh) => void;
};

export class SurfaceTextMeshRegistry {
  private _registerMesh: ((mesh: THREE.Mesh) => void) | null;
  targetMeshes: THREE.Mesh[];
  meshTextMap: Map<string, Set<string>>;

  constructor(options: SurfaceTextMeshRegistryOptions = {}) {
    this._registerMesh = options.registerMesh || null;
    this.targetMeshes = [];
    this.meshTextMap = new Map();
  }

  setTargetMeshes(meshes: THREE.Mesh[] = []) {
    this.targetMeshes.length = 0;

    meshes
      .filter((mesh) => mesh && mesh.isMesh)
      .forEach((mesh) => {
        this.targetMeshes.push(mesh);
        this._registerMesh?.(mesh);
      });

    return this.targetMeshes;
  }

  addTargetMesh(mesh: THREE.Mesh | null | undefined) {
    if (!mesh || !mesh.isMesh || this.targetMeshes.includes(mesh)) {
      return false;
    }

    this.targetMeshes.push(mesh);
    this._registerMesh?.(mesh);
    return true;
  }

  removeTargetMesh(mesh: THREE.Mesh | null | undefined) {
    if (!mesh) return false;

    const index = this.targetMeshes.indexOf(mesh);
    if (index === -1) {
      return false;
    }

    this.targetMeshes.splice(index, 1);
    return true;
  }

  addTextToMesh(mesh: THREE.Mesh, textId: string) {
    if (!this.meshTextMap.has(mesh.uuid)) {
      this.meshTextMap.set(mesh.uuid, new Set());
    }
    this.meshTextMap.get(mesh.uuid)?.add(textId);
  }

  removeTextFromMesh(mesh: THREE.Mesh, textId: string) {
    const textIds = this.meshTextMap.get(mesh.uuid);
    if (!textIds) return;

    textIds.delete(textId);
    if (textIds.size === 0) {
      this.meshTextMap.delete(mesh.uuid);
    }
  }

  getTextIds(mesh: THREE.Mesh | null | undefined) {
    if (!mesh) return null;
    return this.meshTextMap.get(mesh.uuid) || null;
  }

  clear() {
    this.targetMeshes.length = 0;
    this.meshTextMap.clear();
  }
}

export default SurfaceTextMeshRegistry;
