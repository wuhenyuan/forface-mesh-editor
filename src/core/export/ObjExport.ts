import {
  Color,
  ColorManagement,
  Line,
  Material,
  Matrix3,
  Mesh,
  Object3D,
  Points,
  SRGBColorSpace,
  Vector2,
  Vector3,
} from 'three';

type OBJExporterParseOptions = {
  positionPrecision?: number;
  uvPrecision?: number;
  normalPrecision?: number;
};

type GeometryGroup = {
  start: number;
  count: number;
  materialIndex: number;
  name?: string;
};

/**
 * An exporter for OBJ.
 *
 * `OBJExporter` is not able to export material data into MTL files so only geometry data are supported.
 *
 * ```js
 * const exporter = new OBJExporter();
 * const data = exporter.parse( scene );
 * ```
 *
 * @three_import import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
 */
class OBJExporter {
  /**
   * Parses the given 3D object and generates the OBJ output.
   *
   * If the 3D object is composed of multiple children and geometry, they are merged into a single mesh in the file.
   *
   * @param {Object3D} object - The 3D object to export.
   * @param {Object} options - Export options.
   * @return {string} The exported OBJ.
   */
  parse(object: Object3D, options: OBJExporterParseOptions = {}): string {
    let output = '';

    let indexVertex = 0;
    let indexVertexUvs = 0;
    let indexNormals = 0;

    // Precision controls dedupe granularity and exported numeric trimming.
    const { positionPrecision, uvPrecision, normalPrecision } = options as OBJExporterParseOptions;
    const positionPrecisionDigits = normalizePrecision(positionPrecision, 6);
    const uvPrecisionDigits = normalizePrecision(uvPrecision, positionPrecisionDigits);
    const normalPrecisionDigits = normalizePrecision(normalPrecision, positionPrecisionDigits);
    const positionFactor = Math.pow(10, positionPrecisionDigits);
    const uvFactor = Math.pow(10, uvPrecisionDigits);
    const normalFactor = Math.pow(10, normalPrecisionDigits);

    const vertex = new Vector3();
    const color = new Color();
    const normal = new Vector3();
    const uv = new Vector2();
    const face: string[] = [];

    // Global hash maps let different groups/meshes share the same exported indices.
    const vertexHashMap = new Map<string, number>();
    const uvHashMap = new Map<string, number>();
    const normalHashMap = new Map<string, number>();

    function normalizePrecision(value: number | undefined, fallback: number): number {
      const numeric = Number.isFinite(value) ? Math.floor(value) : fallback;
      return Math.min(Math.max(numeric, 0), 12);
    }

    function quantizeToInt(value: number, factor: number): number {
      return Math.round(value * factor);
    }

    // Convert quantized integer back to fixed-width OBJ text.
    function formatQuantizedInt(
      quantizedInt: number,
      factor: number,
      precisionDigits: number
    ): string {
      const normalized = quantizedInt === 0 ? 0 : quantizedInt / factor;
      if (precisionDigits <= 0) {
        return String(Math.round(normalized));
      }
      return normalized.toFixed(precisionDigits);
    }

    function resolveMaterialName(material: Material | null | undefined): string {
      if (!material) return '';
      if (material.name) return material.name;
      if (material.uuid) return `material_${material.uuid.substring(0, 8)}`;
      return '';
    }

    function parseMesh(mesh: Mesh): void {
      const geometry = mesh.geometry;

      if (!geometry) {
        console.warn('[OBJExporter] Mesh has no geometry:', mesh.name);
        return;
      }

      const normalMatrixWorld = new Matrix3().getNormalMatrix(mesh.matrixWorld);
      const vertices = geometry.getAttribute('position');
      const normals = geometry.getAttribute('normal');
      const uvs = geometry.getAttribute('uv');
      const indices = geometry.getIndex();

      if (!vertices) {
        console.warn('[OBJExporter] Geometry has no position attribute:', mesh.name, geometry);
        return;
      }

      const meshMaterials = Array.isArray(mesh.material)
        ? mesh.material
        : mesh.material
          ? [mesh.material]
          : [];

      // Keep original segmentation for face/material slicing.
      const groups: GeometryGroup[] =
        Array.isArray(geometry.groups) && geometry.groups.length > 0
          ? (geometry.groups as GeometryGroup[])
          : [
              {
                start: 0,
                count: indices ? indices.count : vertices.count,
                materialIndex: 0,
              },
            ];

      const vertexLines: string[] = [];
      const uvLines: string[] = [];
      const normalLines: string[] = [];
      const meshLines: string[] = [];

      if (mesh.name) {
        meshLines.push('o ' + mesh.name);
      }

      function ensureVertexIndex(sourceIndex: number): number {
        // Vertex sharing is based on quantized world-space position.
        vertex.fromBufferAttribute(vertices, sourceIndex);
        vertex.applyMatrix4(mesh.matrixWorld);

        const qx = quantizeToInt(vertex.x, positionFactor);
        const qy = quantizeToInt(vertex.y, positionFactor);
        const qz = quantizeToInt(vertex.z, positionFactor);
        const key = `${qx},${qy},${qz}`;

        let targetIndex = vertexHashMap.get(key);
        if (targetIndex !== undefined) {
          return targetIndex;
        }

        targetIndex = ++indexVertex;
        vertexHashMap.set(key, targetIndex);
        vertexLines.push(
          'v ' +
            formatQuantizedInt(qx, positionFactor, positionPrecisionDigits) +
            ' ' +
            formatQuantizedInt(qy, positionFactor, positionPrecisionDigits) +
            ' ' +
            formatQuantizedInt(qz, positionFactor, positionPrecisionDigits)
        );

        return targetIndex;
      }

      function ensureUvIndex(sourceIndex: number): number | null {
        // UV index is deduped independently from position index.
        if (!uvs || sourceIndex < 0 || sourceIndex >= uvs.count) return null;

        uv.set(uvs.getX(sourceIndex), uvs.getY(sourceIndex));

        const qu = quantizeToInt(uv.x, uvFactor);
        const qv = quantizeToInt(uv.y, uvFactor);
        const key = `${qu},${qv}`;

        let targetIndex = uvHashMap.get(key);
        if (targetIndex !== undefined) {
          return targetIndex;
        }

        targetIndex = ++indexVertexUvs;
        uvHashMap.set(key, targetIndex);
        uvLines.push(
          'vt ' +
            formatQuantizedInt(qu, uvFactor, uvPrecisionDigits) +
            ' ' +
            formatQuantizedInt(qv, uvFactor, uvPrecisionDigits)
        );

        return targetIndex;
      }

      function ensureNormalIndex(sourceIndex: number): number | null {
        // Normal index is deduped independently from position index.
        if (!normals || sourceIndex < 0 || sourceIndex >= normals.count) return null;

        normal.fromBufferAttribute(normals, sourceIndex);
        normal.applyMatrix3(normalMatrixWorld).normalize();

        const qx = quantizeToInt(normal.x, normalFactor);
        const qy = quantizeToInt(normal.y, normalFactor);
        const qz = quantizeToInt(normal.z, normalFactor);
        const key = `${qx},${qy},${qz}`;

        let targetIndex = normalHashMap.get(key);
        if (targetIndex !== undefined) {
          return targetIndex;
        }

        targetIndex = ++indexNormals;
        normalHashMap.set(key, targetIndex);
        normalLines.push(
          'vn ' +
            formatQuantizedInt(qx, normalFactor, normalPrecisionDigits) +
            ' ' +
            formatQuantizedInt(qy, normalFactor, normalPrecisionDigits) +
            ' ' +
            formatQuantizedInt(qz, normalFactor, normalPrecisionDigits)
        );

        return targetIndex;
      }

      // OBJ supports separate v/vt/vn indices for each face vertex token.
      function composeFaceVertex(
        vIndex: number,
        vtIndex: number | null,
        vnIndex: number | null
      ): string {
        if (vtIndex === null && vnIndex === null) {
          return String(vIndex);
        }
        if (vnIndex === null) {
          return `${vIndex}/${vtIndex}`;
        }
        if (vtIndex === null) {
          return `${vIndex}//${vnIndex}`;
        }
        return `${vIndex}/${vtIndex}/${vnIndex}`;
      }

      for (let g = 0; g < groups.length; g++) {
        const group = groups[g];
        const material =
          meshMaterials.length > 0 ? meshMaterials[group.materialIndex] || meshMaterials[0] : null;
        const materialName = resolveMaterialName(material);

        // Group tags are intentionally omitted; material boundaries are preserved via usemtl.
        if (materialName) {
          meshLines.push('usemtl ' + materialName);
        }

        const maxCount = indices ? indices.count : vertices.count;
        const start = Math.max(group.start, 0);
        const end = Math.min(group.start + group.count, maxCount);

        // Supports indexed and non-indexed triangle streams with shared global indices.
        for (let i = start; i + 2 < end; i += 3) {
          for (let m = 0; m < 3; m++) {
            const sourceIndex = indices ? indices.getX(i + m) : i + m;
            const vIndex = ensureVertexIndex(sourceIndex);
            const vtIndex = ensureUvIndex(sourceIndex);
            const vnIndex = ensureNormalIndex(sourceIndex);
            face[m] = composeFaceVertex(vIndex, vtIndex, vnIndex);
          }

          meshLines.push('f ' + face.join(' '));
        }
      }

      // OBJ requires referenced declarations (v/vt/vn) to appear before `f`.
      if (vertexLines.length > 0) {
        output += vertexLines.join('\n') + '\n';
      }

      if (uvLines.length > 0) {
        output += uvLines.join('\n') + '\n';
      }

      if (normalLines.length > 0) {
        output += normalLines.join('\n') + '\n';
      }

      if (meshLines.length > 0) {
        output += meshLines.join('\n') + '\n';
      }
    }

    function parseLine(line: Line): void {
      const geometry = line.geometry;
      const type = line.type;

      const vertices = geometry.getAttribute('position');
      const startVertex = indexVertex;

      if (line.name) {
        output += 'o ' + line.name + '\n';
      }

      if (vertices !== undefined) {
        for (let i = 0, l = vertices.count; i < l; i++) {
          vertex.fromBufferAttribute(vertices, i);
          vertex.applyMatrix4(line.matrixWorld);

          const qx = quantizeToInt(vertex.x, positionFactor);
          const qy = quantizeToInt(vertex.y, positionFactor);
          const qz = quantizeToInt(vertex.z, positionFactor);

          output +=
            'v ' +
            formatQuantizedInt(qx, positionFactor, positionPrecisionDigits) +
            ' ' +
            formatQuantizedInt(qy, positionFactor, positionPrecisionDigits) +
            ' ' +
            formatQuantizedInt(qz, positionFactor, positionPrecisionDigits) +
            '\n';

          // Lines keep simple append-only vertex indices for stable l records.
          indexVertex++;
        }
      }

      if (type === 'Line' && vertices !== undefined) {
        output += 'l ';

        for (let j = 1, l = vertices.count; j <= l; j++) {
          output += startVertex + j + ' ';
        }

        output += '\n';
      }

      if (type === 'LineSegments' && vertices !== undefined) {
        for (let j = 1, k = j + 1, l = vertices.count; j < l; j += 2, k = j + 1) {
          output += 'l ' + (startVertex + j) + ' ' + (startVertex + k) + '\n';
        }
      }
    }

    function parsePoints(points: Points): void {
      const geometry = points.geometry;

      const vertices = geometry.getAttribute('position');
      const colors = geometry.getAttribute('color');
      const startVertex = indexVertex;

      if (points.name) {
        output += 'o ' + points.name + '\n';
      }

      if (vertices !== undefined) {
        for (let i = 0, l = vertices.count; i < l; i++) {
          vertex.fromBufferAttribute(vertices, i);
          vertex.applyMatrix4(points.matrixWorld);

          const qx = quantizeToInt(vertex.x, positionFactor);
          const qy = quantizeToInt(vertex.y, positionFactor);
          const qz = quantizeToInt(vertex.z, positionFactor);

          output +=
            'v ' +
            formatQuantizedInt(qx, positionFactor, positionPrecisionDigits) +
            ' ' +
            formatQuantizedInt(qy, positionFactor, positionPrecisionDigits) +
            ' ' +
            formatQuantizedInt(qz, positionFactor, positionPrecisionDigits);

          if (colors !== undefined) {
            color.fromBufferAttribute(colors, i);
            ColorManagement.workingToColorSpace(color, SRGBColorSpace);
            output += ' ' + color.r + ' ' + color.g + ' ' + color.b;
          }

          output += '\n';
          // Points keep simple append-only vertex indices for stable p records.
          indexVertex++;
        }

        output += 'p ';

        for (let j = 1, l = vertices.count; j <= l; j++) {
          output += startVertex + j + ' ';
        }

        output += '\n';
      }
    }

    object.traverse(function (child: Object3D) {
      if ((child as Mesh).isMesh === true) {
        parseMesh(child as Mesh);
      }

      if ((child as Line).isLine === true) {
        parseLine(child as Line);
      }

      if ((child as Points).isPoints === true) {
        parsePoints(child as Points);
      }
    });

    return output;
  }
}

export { OBJExporter };
