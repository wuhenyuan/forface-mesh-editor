import * as THREE from 'three';

type FaceVertexRef = {
  vIndex: number;
  vtIndex: number | null;
};

export type IndexedOBJLoaderParseOptions = {
  material?: THREE.Material | THREE.Material[] | null;
  name?: string;
};

function parseRequiredFloat(value: string, lineNumber: number, keyword: string) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`[IndexedOBJLoader] Invalid ${keyword} value at line ${lineNumber}: "${value}"`);
  }
  return parsed;
}

function resolveOBJIndex(rawIndex: number, count: number, lineNumber: number, token: string, kind: string) {
  if (!Number.isInteger(rawIndex) || rawIndex === 0) {
    throw new Error(
      `[IndexedOBJLoader] Invalid ${kind} index at line ${lineNumber}: "${token}" (OBJ indices cannot be 0)`
    );
  }

  // OBJ uses 1-based positive indices and supports negative relative indices.
  const resolved = rawIndex > 0 ? rawIndex - 1 : count + rawIndex;
  if (resolved < 0 || resolved >= count) {
    throw new Error(
      `[IndexedOBJLoader] ${kind} index out of range at line ${lineNumber}: "${token}" (count=${count})`
    );
  }
  return resolved;
}

export class IndexedOBJLoader {
  manager: THREE.LoadingManager;

  constructor(manager: THREE.LoadingManager = THREE.DefaultLoadingManager) {
    this.manager = manager;
  }

  load(
    url: string,
    onLoad: (group: THREE.Group) => void,
    onProgress?: (event: ProgressEvent<EventTarget>) => void,
    onError?: (error: unknown) => void,
    options: IndexedOBJLoaderParseOptions = {}
  ) {
    const fileLoader = new THREE.FileLoader(this.manager);
    fileLoader.setResponseType('text');
    fileLoader.load(
      url,
      (text) => {
        try {
          onLoad(this.parse(String(text || ''), options));
        } catch (error) {
          onError?.(error);
        }
      },
      onProgress,
      onError
    );
  }

  parse(text: string, options: IndexedOBJLoaderParseOptions = {}) {
    const rawPositions: number[] = [];
    const rawUVs: number[] = [];

    const outPositions: number[] = [];
    const outUVs: number[] = [];
    const outIndices: number[] = [];

    let hasAnyUV = false;

    // Keyed by `positionIndex/uvIndex` so UV seams keep split vertices.
    const vertexMap = new Map<string, number>();

    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const lineNumber = i + 1;
      const line = lines[i].trim();

      if (!line || line.startsWith('#')) continue;

      const whitespaceIndex = line.search(/\s/);
      const keyword = whitespaceIndex === -1 ? line : line.slice(0, whitespaceIndex);
      const body = whitespaceIndex === -1 ? '' : line.slice(whitespaceIndex + 1).trim();

      switch (keyword) {
        case 'v': {
          const parts = body.split(/\s+/);
          if (parts.length < 3) {
            throw new Error(`[IndexedOBJLoader] Invalid vertex at line ${lineNumber}: "${line}"`);
          }

          rawPositions.push(
            parseRequiredFloat(parts[0], lineNumber, 'v'),
            parseRequiredFloat(parts[1], lineNumber, 'v'),
            parseRequiredFloat(parts[2], lineNumber, 'v')
          );
          break;
        }
        case 'vt': {
          const parts = body.split(/\s+/);
          if (parts.length < 2) {
            throw new Error(`[IndexedOBJLoader] Invalid uv at line ${lineNumber}: "${line}"`);
          }

          rawUVs.push(
            parseRequiredFloat(parts[0], lineNumber, 'vt'),
            parseRequiredFloat(parts[1], lineNumber, 'vt')
          );
          break;
        }
        case 'f': {
          const tokens = body.split(/\s+/).filter(Boolean);

          // This loader intentionally supports only triangles.
          if (tokens.length !== 3) {
            throw new Error(
              `[IndexedOBJLoader] Only triangular faces are supported, got ${tokens.length} at line ${lineNumber}`
            );
          }

          for (const token of tokens) {
            const ref = this._parseFaceRef(
              token,
              rawPositions.length / 3,
              rawUVs.length / 2,
              lineNumber
            );
            const key = `${ref.vIndex}/${ref.vtIndex ?? ''}`;

            let outVertexIndex = vertexMap.get(key);
            if (outVertexIndex === undefined) {
              outVertexIndex = outPositions.length / 3;
              vertexMap.set(key, outVertexIndex);

              const posOffset = ref.vIndex * 3;
              outPositions.push(
                rawPositions[posOffset],
                rawPositions[posOffset + 1],
                rawPositions[posOffset + 2]
              );

              // Keep UV array aligned to vertex count; missing UV gets a fallback (0,0).
              if (ref.vtIndex === null) {
                outUVs.push(0, 0);
              } else {
                const uvOffset = ref.vtIndex * 2;
                outUVs.push(rawUVs[uvOffset], rawUVs[uvOffset + 1]);
                hasAnyUV = true;
              }
            }

            outIndices.push(outVertexIndex);
          }
          break;
        }
        default:
          break;
      }
    }

    if (outPositions.length === 0 || outIndices.length === 0) {
      throw new Error('[IndexedOBJLoader] No triangle geometry parsed from OBJ text');
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(outPositions, 3));
    geometry.setIndex(outIndices);

    if (hasAnyUV) {
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(outUVs, 2));
    }

    geometry.computeVertexNormals();

    const meshMaterial =
      options.material ||
      new THREE.MeshStandardMaterial({
        color: 0xcccccc,
        metalness: 0.3,
        roughness: 0.6,
      });

    const mesh = new THREE.Mesh(geometry, meshMaterial);
    mesh.name = options.name || 'indexed_obj_mesh';

    const group = new THREE.Group();
    group.name = options.name || 'indexed_obj_group';
    group.add(mesh);
    return group;
  }

  _parseFaceRef(token: string, positionCount: number, uvCount: number, lineNumber: number): FaceVertexRef {
    const parts = token.split('/');
    if (parts.length === 0 || !parts[0]) {
      throw new Error(`[IndexedOBJLoader] Invalid face token at line ${lineNumber}: "${token}"`);
    }

    const vRaw = Number.parseInt(parts[0], 10);
    const vIndex = resolveOBJIndex(vRaw, positionCount, lineNumber, token, 'vertex');

    let vtIndex: number | null = null;
    const vtToken = parts.length > 1 ? parts[1] : '';
    if (vtToken) {
      const vtRaw = Number.parseInt(vtToken, 10);
      vtIndex = resolveOBJIndex(vtRaw, uvCount, lineNumber, token, 'uv');
    }

    // `vn` part is intentionally ignored.
    return { vIndex, vtIndex };
  }
}

export default IndexedOBJLoader;
