import * as THREE from 'three';

type HighlightColors = {
  selection: number;
  hover: number;
  multiSelection: number;
};

type HighlightStats = {
  selectionHighlights: number;
  hoverHighlights: number;
  totalHighlights: number;
  cachedMaterials: number;
};

function getColorMaterial(material: THREE.Material): { isLit: boolean } {
  const lit =
    (material as THREE.MeshStandardMaterial).isMeshStandardMaterial ||
    (material as THREE.MeshPhongMaterial).isMeshPhongMaterial;
  return { isLit: !!lit };
}

export class HighlightRenderer {
  scene: THREE.Scene;
  highlightMeshes: Map<string, THREE.Mesh>;
  hoverMeshes: Map<string, THREE.Mesh>;
  colors: HighlightColors;
  materialCache: Map<string, THREE.Material>;
  highlightGroup: THREE.Group;
  hoverGroup: THREE.Group;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.highlightMeshes = new Map();
    this.hoverMeshes = new Map();
    this.colors = {
      selection: 0xff6b35,
      hover: 0x4fc3f7,
      multiSelection: 0xe91e63,
    };
    this.materialCache = new Map();

    this.highlightGroup = new THREE.Group();
    this.highlightGroup.name = 'FaceHighlightGroup';
    this.scene.add(this.highlightGroup);

    this.hoverGroup = new THREE.Group();
    this.hoverGroup.name = 'FaceHoverGroup';
    this.scene.add(this.hoverGroup);
  }

  highlightFace(mesh: THREE.Mesh, faceIndex: number, color: number | null = null, isHover = false) {
    if (!mesh || !mesh.geometry || faceIndex < 0) return false;

    const id = this.generateHighlightId(mesh, faceIndex);
    const targetMap = isHover ? this.hoverMeshes : this.highlightMeshes;
    const targetGroup = isHover ? this.hoverGroup : this.highlightGroup;

    if (targetMap.has(id)) {
      this.removeHighlightById(id, isHover);
    }

    const highlightMesh = this.createFaceHighlightMesh(mesh, faceIndex, color, isHover);
    if (!highlightMesh) return false;

    targetMap.set(id, highlightMesh);
    targetGroup.add(highlightMesh);
    return true;
  }

  removeHighlight(mesh: THREE.Mesh, faceIndex: number, isHover = false) {
    return this.removeHighlightById(this.generateHighlightId(mesh, faceIndex), isHover);
  }

  removeHighlightById(highlightId: string, isHover = false) {
    const targetMap = isHover ? this.hoverMeshes : this.highlightMeshes;
    const targetGroup = isHover ? this.hoverGroup : this.highlightGroup;
    const highlightMesh = targetMap.get(highlightId);
    if (!highlightMesh) return false;

    targetGroup.remove(highlightMesh);
    highlightMesh.geometry.dispose();
    const material = highlightMesh.material;
    if (Array.isArray(material)) {
      material.forEach((item) => item.dispose());
    } else {
      material.dispose();
    }
    targetMap.delete(highlightId);
    return true;
  }

  clearAllHighlights(includeHover = false) {
    Array.from(this.highlightMeshes.keys()).forEach((id) => this.removeHighlightById(id, false));
    if (includeHover) {
      Array.from(this.hoverMeshes.keys()).forEach((id) => this.removeHighlightById(id, true));
    }
  }

  showHoverEffect(mesh: THREE.Mesh, faceIndex: number) {
    return this.highlightFace(mesh, faceIndex, this.colors.hover, true);
  }

  hideHoverEffect(mesh: THREE.Mesh | null = null, faceIndex: number | null = null) {
    if (mesh !== null && faceIndex !== null) {
      this.removeHighlight(mesh, faceIndex, true);
      return;
    }
    Array.from(this.hoverMeshes.keys()).forEach((id) => this.removeHighlightById(id, true));
  }

  createFaceHighlightMesh(
    originalMesh: THREE.Mesh,
    faceIndex: number,
    color: number | null,
    isHover: boolean
  ) {
    const geometry = originalMesh.geometry;
    if (!geometry || !geometry.isBufferGeometry) return null;
    return this.createBufferGeometryHighlight(originalMesh, geometry, faceIndex, color, isHover);
  }

  private createBufferGeometryHighlight(
    originalMesh: THREE.Mesh,
    geometry: THREE.BufferGeometry,
    faceIndex: number,
    color: number | null,
    isHover: boolean
  ) {
    const position = geometry.getAttribute('position');
    if (!position) return null;

    const index = geometry.getIndex();
    const start = faceIndex * 3;

    const vertexIndices = index
      ? [index.getX(start), index.getX(start + 1), index.getX(start + 2)]
      : [start, start + 1, start + 2];

    if (vertexIndices.some((vertexIndex) => vertexIndex < 0 || vertexIndex >= position.count)) {
      return null;
    }

    const positions: number[] = [];
    const normals: number[] = [];
    const normal = geometry.getAttribute('normal');
    const uv = geometry.getAttribute('uv');
    const uvs: number[] = [];

    vertexIndices.forEach((vertexIndex) => {
      positions.push(
        position.getX(vertexIndex),
        position.getY(vertexIndex),
        position.getZ(vertexIndex)
      );
      if (normal) {
        normals.push(normal.getX(vertexIndex), normal.getY(vertexIndex), normal.getZ(vertexIndex));
      }
      if (uv) {
        uvs.push(uv.getX(vertexIndex), uv.getY(vertexIndex));
      }
    });

    const highlightGeometry = new THREE.BufferGeometry();
    highlightGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    if (normals.length > 0) {
      highlightGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    } else {
      highlightGeometry.computeVertexNormals();
    }
    if (uvs.length > 0) {
      highlightGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    }

    const sourceMaterial = Array.isArray(originalMesh.material)
      ? originalMesh.material[0]
      : originalMesh.material;
    const highlightMaterial = this.createHighlightMaterial(sourceMaterial, color, isHover);

    const highlightMesh = new THREE.Mesh(highlightGeometry, highlightMaterial);
    highlightMesh.matrix.copy(originalMesh.matrix);
    highlightMesh.matrixAutoUpdate = false;
    highlightMesh.renderOrder = originalMesh.renderOrder + (isHover ? 2 : 1);
    return highlightMesh;
  }

  createHighlightMaterial(
    originalMaterial: THREE.Material | undefined,
    color: number | null,
    isHover: boolean
  ) {
    const highlightColor = color ?? (isHover ? this.colors.hover : this.colors.selection);
    const cacheKey = `${highlightColor}_${isHover ? 'hover' : 'selection'}`;
    const cached = this.materialCache.get(cacheKey);
    if (cached) return cached;

    const isLit = originalMaterial ? getColorMaterial(originalMaterial).isLit : false;
    const material: THREE.Material = isLit
      ? new THREE.MeshStandardMaterial({
          color: highlightColor,
          emissive: highlightColor,
          emissiveIntensity: isHover ? 0.3 : 0.5,
          transparent: true,
          opacity: isHover ? 0.6 : 0.8,
          side: THREE.DoubleSide,
          depthTest: true,
          depthWrite: false,
        })
      : new THREE.MeshBasicMaterial({
          color: highlightColor,
          transparent: true,
          opacity: isHover ? 0.4 : 0.7,
          side: THREE.DoubleSide,
          depthTest: true,
          depthWrite: false,
        });

    this.materialCache.set(cacheKey, material);
    return material;
  }

  generateHighlightId(mesh: THREE.Mesh, faceIndex: number) {
    return `${mesh.uuid}_face_${faceIndex}`;
  }

  updateColors(colors: Partial<HighlightColors>) {
    Object.assign(this.colors, colors);
    this.materialCache.forEach((material) => material.dispose());
    this.materialCache.clear();
  }

  getHighlightStats(): HighlightStats {
    return {
      selectionHighlights: this.highlightMeshes.size,
      hoverHighlights: this.hoverMeshes.size,
      totalHighlights: this.highlightMeshes.size + this.hoverMeshes.size,
      cachedMaterials: this.materialCache.size,
    };
  }

  destroy() {
    this.clearAllHighlights(true);
    this.scene.remove(this.highlightGroup);
    this.scene.remove(this.hoverGroup);
    this.materialCache.forEach((material) => material.dispose());
    this.materialCache.clear();
    this.highlightMeshes.clear();
    this.hoverMeshes.clear();
  }
}
