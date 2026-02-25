import * as THREE from 'three';

export type ExportMaterial = THREE.Material & {
  color?: THREE.Color;
  roughness?: number;
  opacity?: number;
  map?: THREE.Texture;
  normalMap?: THREE.Texture;
  roughnessMap?: THREE.Texture;
  metalnessMap?: THREE.Texture;
  aoMap?: THREE.Texture;
  emissiveMap?: THREE.Texture;
};

export function collectMaterialsAndTextures(scene: THREE.Object3D) {
  const materials = new Map<string, ExportMaterial>();
  const textures = new Map<string, Blob>();

  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const normalizedMaterials = meshMaterials as ExportMaterial[];

    for (const material of normalizedMaterials) {
      if (!material) continue;

      const matName = material.name || `material_${material.uuid.substring(0, 8)}`;
      materials.set(matName, material);

      const textureProps: Array<
        'map' | 'normalMap' | 'roughnessMap' | 'metalnessMap' | 'aoMap' | 'emissiveMap'
      > = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'];
      for (const prop of textureProps) {
        const texture = material[prop];
        if (texture?.image) {
          const textureName = getTextureName(texture, prop);
          const textureBlob = textureToBlob(texture);
          if (textureBlob) {
            textures.set(textureName, textureBlob);
          }
        }
      }
    }
  });

  return { materials, textures };
}

export function generateMTL(materials: Map<string, ExportMaterial>) {
  const lines = ['# MTL file exported by ExportManager'];

  for (const [name, material] of materials) {
    lines.push('');
    lines.push(`newmtl ${name}`);

    const mat = material;

    // 获取颜色，如果没有 color 属性则使用默认白色
    const c = mat.color ?? new THREE.Color(1, 1, 1);
    lines.push(`Kd ${c.r.toFixed(6)} ${c.g.toFixed(6)} ${c.b.toFixed(6)}`);
    lines.push(`Ka ${(c.r * 0.2).toFixed(6)} ${(c.g * 0.2).toFixed(6)} ${(c.b * 0.2).toFixed(6)}`);

    lines.push('Ks 0.500000 0.500000 0.500000');
    const shininess = mat.roughness !== undefined ? (1 - mat.roughness) * 100 : 30;
    lines.push(`Ns ${shininess.toFixed(6)}`);

    const opacity = mat.opacity !== undefined ? mat.opacity : 1;
    lines.push(`d ${opacity.toFixed(6)}`);
    lines.push('illum 2');

    if (mat.map?.image) {
      const texName = getTextureName(mat.map, 'map');
      lines.push(`map_Kd ${texName}`);
    }

    if (mat.normalMap?.image) {
      const texName = getTextureName(mat.normalMap, 'normalMap');
      lines.push(`map_Bump ${texName}`);
    }
  }

  return lines.join('\n');
}

function getTextureName(texture: THREE.Texture, propName: string) {
  if (texture.name) {
    const dot = texture.name.lastIndexOf('.');
    return dot > 0 ? `${texture.name.slice(0, dot)}.jpg` : `${texture.name}.jpg`;
  }
  return `${propName}_${texture.uuid.substring(0, 8)}.jpg`;
}

function textureToBlob(texture: THREE.Texture): Blob | null {
  const image = texture.image;
  if (!image) return null;

  try {
    const canvas = document.createElement('canvas');
    const width =
      typeof image === 'object' && image && 'width' in image && typeof image.width === 'number'
        ? image.width
        : 256;
    const height =
      typeof image === 'object' && image && 'height' in image && typeof image.height === 'number'
        ? image.height
        : 256;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(image as CanvasImageSource, 0, 0);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    const base64 = dataUrl.split(',')[1];
    const binary = atob(base64);
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      array[i] = binary.charCodeAt(i);
    }

    return new Blob([array], { type: 'image/jpeg' });
  } catch (error) {
    console.warn('Texture export failed:', error);
    return null;
  }
}
