import * as THREE from 'three';
import { cylinderSurfaceHelper } from '../CylinderSurfaceHelper';
import { simpleCylinderDetector } from '../SimpleCylinderDetector';

export type SurfaceFaceInfo = {
  mesh: THREE.Mesh;
  faceIndex?: number;
  face?: { normal?: THREE.Vector3 } | null;
  point: THREE.Vector3;
  distance?: number;
  uv?: THREE.Vector2 | null;
};

export type CylinderInfo = {
  center: THREE.Vector3;
  axis: THREE.Vector3;
  radius: number;
  height?: number;
  confidence?: number;
  [key: string]: unknown;
};

export type SurfaceInfo = {
  surfaceType: 'plane' | 'cylinder';
  attachPoint: THREE.Vector3;
  cylinderInfo?: CylinderInfo;
};

export class SurfaceTextPlacement {
  analyzeSurface(faceInfo: SurfaceFaceInfo): SurfaceInfo {
    const { mesh } = faceInfo;

    console.log('开始表面分析', {
      meshName: mesh.name || 'Unnamed',
      geometryType: mesh.geometry.type,
      vertexCount: mesh.geometry.attributes.position?.count || 0,
    });

    if (mesh.geometry.type === 'BoxGeometry' || mesh.geometry.type === 'BoxBufferGeometry') {
      console.log('检测到 BoxGeometry，直接使用平面模式');
      return {
        surfaceType: 'plane',
        attachPoint: faceInfo.point.clone(),
      };
    }

    const vertexCount = mesh.geometry.attributes.position?.count || 0;
    if (
      mesh.geometry.type === 'CylinderGeometry' ||
      mesh.geometry.type === 'CylinderBufferGeometry'
    ) {
      console.log('检测到 CylinderGeometry，进行圆柱面检测');
    } else if (vertexCount < 100) {
      console.log('顶点数较少，使用平面模式');
      return {
        surfaceType: 'plane',
        attachPoint: faceInfo.point.clone(),
      };
    }

    console.log('尝试圆柱检测器...');
    const simpleCylinderInfo = simpleCylinderDetector.detectCylinder(mesh.geometry, mesh);

    if (simpleCylinderInfo && simpleCylinderDetector.quickValidate(simpleCylinderInfo)) {
      if (simpleCylinderInfo.confidence > 0.7) {
        console.log('检测器成功识别圆柱面', {
          confidence: `${(simpleCylinderInfo.confidence * 100).toFixed(1)}%`,
          radius: simpleCylinderInfo.radius.toFixed(2),
          height: simpleCylinderInfo.height.toFixed(2),
        });

        return {
          surfaceType: 'cylinder',
          cylinderInfo: simpleCylinderInfo,
          attachPoint: faceInfo.point.clone(),
        };
      }

      console.log(
        `圆柱面置信度不足 (${(simpleCylinderInfo.confidence * 100).toFixed(1)}%)，使用平面模式`
      );
    }

    const cylinderInfo = cylinderSurfaceHelper.detectCylinder(mesh.geometry);
    if (cylinderInfo && cylinderInfo.confidence > 0.7) {
      console.log('复杂检测器识别圆柱面', {
        confidence: `${(cylinderInfo.confidence * 100).toFixed(1)}%`,
      });

      return {
        surfaceType: 'cylinder',
        cylinderInfo,
        attachPoint: faceInfo.point.clone(),
      };
    }

    console.log('使用平面模式');
    return {
      surfaceType: 'plane',
      attachPoint: faceInfo.point.clone(),
    };
  }

  positionTextOnCylinder(
    textMesh: THREE.Mesh,
    _faceInfo: SurfaceFaceInfo,
    _surfaceInfo: SurfaceInfo
  ) {
    console.log('圆柱面文字定位');
    textMesh.position.set(0, 0, 0);
    textMesh.rotation.set(0, 0, 0);
    textMesh.scale.set(1, 1, 1);
    console.log('圆柱面文字定位完成，网格位置归零');
  }

  moveVerticesInward(geometry: THREE.BufferGeometry, cylinderInfo: CylinderInfo, distance: number) {
    const { center, axis } = cylinderInfo;
    const positions = geometry.attributes.position;
    const positionArray = positions.array;

    console.log('[DEBUG] moveVerticesInward 开始', {
      center: `(${center.x}, ${center.y}, ${center.z})`,
      axis: `(${axis.x}, ${axis.y}, ${axis.z})`,
      distance,
      vertexCount: positionArray.length / 3,
    });

    let movedCount = 0;

    for (let index = 0; index < positionArray.length; index += 3) {
      const vertex = new THREE.Vector3(
        positionArray[index],
        positionArray[index + 1],
        positionArray[index + 2]
      );
      const toVertex = vertex.clone().sub(center);
      const axialComponent = toVertex.dot(axis);
      const radialVector = toVertex.clone().sub(axis.clone().multiplyScalar(axialComponent));
      const radialLength = radialVector.length();

      if (radialLength <= 0.001) continue;

      const radialDir = radialVector.clone().normalize();
      const offset = radialDir.clone().multiplyScalar(distance);

      positionArray[index] -= offset.x;
      positionArray[index + 1] -= offset.y;
      positionArray[index + 2] -= offset.z;
      movedCount += 1;
    }

    positions.needsUpdate = true;
    console.log('[DEBUG] moveVerticesInward 完成, 移动了', movedCount, '个顶点');
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }

  moveTextOutwardXZ(geometry: THREE.BufferGeometry, distance: number) {
    const positions = geometry.attributes.position;
    const positionArray = positions.array;

    for (let index = 0; index < positionArray.length; index += 3) {
      const x = positionArray[index];
      const z = positionArray[index + 2];
      const radialDist = Math.sqrt(x * x + z * z);

      if (radialDist <= 0.001) continue;

      const scale = (radialDist + distance) / radialDist;
      positionArray[index] = x * scale;
      positionArray[index + 2] = z * scale;
    }

    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
  }

  moveTextRadially(geometry: THREE.BufferGeometry, cylinderInfo: CylinderInfo, distance: number) {
    const { center, axis } = cylinderInfo;
    const positions = geometry.attributes.position;
    const positionArray = positions.array;

    for (let index = 0; index < positionArray.length; index += 3) {
      const vertex = new THREE.Vector3(
        positionArray[index],
        positionArray[index + 1],
        positionArray[index + 2]
      );
      const toVertex = vertex.clone().sub(center);
      const axialComponent = toVertex.dot(axis);
      const radialVector = toVertex.clone().sub(axis.clone().multiplyScalar(axialComponent));
      const radialLength = radialVector.length();

      if (radialLength <= 0.001) continue;

      const radialDir = radialVector.clone().normalize();
      positionArray[index] += radialDir.x * distance;
      positionArray[index + 1] += radialDir.y * distance;
      positionArray[index + 2] += radialDir.z * distance;
    }

    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }

  offsetCylinderTextInward(
    geometry: THREE.BufferGeometry,
    cylinderInfo: CylinderInfo,
    depth: number
  ) {
    const { center, axis, radius } = cylinderInfo;
    const positions = geometry.attributes.position;
    const positionArray = positions.array;

    let minRadius = Infinity;
    let maxRadius = -Infinity;

    for (let index = 0; index < positionArray.length; index += 3) {
      const vertex = new THREE.Vector3(
        positionArray[index],
        positionArray[index + 1],
        positionArray[index + 2]
      );
      const toVertex = vertex.clone().sub(center);
      const axialComponent = toVertex.dot(axis);
      const radialVector = toVertex.clone().sub(axis.clone().multiplyScalar(axialComponent));
      const currentRadius = radialVector.length();

      minRadius = Math.min(minRadius, currentRadius);
      maxRadius = Math.max(maxRadius, currentRadius);
    }

    const textThickness = maxRadius - minRadius;
    const protrusion = 0.5;
    const targetOuterRadius = radius + protrusion;
    const targetInnerRadius = radius - depth - 1.0;

    for (let index = 0; index < positionArray.length; index += 3) {
      const vertex = new THREE.Vector3(
        positionArray[index],
        positionArray[index + 1],
        positionArray[index + 2]
      );
      const toVertex = vertex.clone().sub(center);
      const axialComponent = toVertex.dot(axis);
      const radialVector = toVertex.clone().sub(axis.clone().multiplyScalar(axialComponent));
      const currentRadius = radialVector.length();

      if (currentRadius <= 0.001) continue;

      const radialDir = radialVector.clone().normalize();
      const t =
        textThickness > 0.001 ? (currentRadius - minRadius) / textThickness : 0.5;
      const targetRadius = targetInnerRadius + t * (targetOuterRadius - targetInnerRadius);
      const axialPosition = center.clone().add(axis.clone().multiplyScalar(axialComponent));
      const newPosition = axialPosition.add(radialDir.multiplyScalar(targetRadius));

      positionArray[index] = newPosition.x;
      positionArray[index + 1] = newPosition.y;
      positionArray[index + 2] = newPosition.z;
    }

    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }

  calculateCylinderTangent(theta: number, cylinderInfo: CylinderInfo) {
    const { axis } = cylinderInfo;
    const refDirection = cylinderSurfaceHelper.getPerpendicularVector(axis);
    const radialDirection = refDirection
      .clone()
      .multiplyScalar(Math.cos(theta))
      .add(refDirection.clone().cross(axis).multiplyScalar(Math.sin(theta)));

    return radialDirection.cross(axis).normalize();
  }

  positionTextOnSurface(textMesh: THREE.Mesh, faceInfo: SurfaceFaceInfo) {
    textMesh.position.copy(faceInfo.point);

    const normal = faceInfo.face?.normal?.clone() || new THREE.Vector3(0, 1, 0);
    normal.transformDirection(faceInfo.mesh.matrixWorld);
    normal.normalize();

    const up = new THREE.Vector3(0, 1, 0);
    if (Math.abs(normal.dot(up)) > 0.9) {
      up.set(1, 0, 0);
    }

    textMesh.up.copy(up);
    textMesh.lookAt(textMesh.position.clone().add(normal));
    textMesh.position.add(normal.multiplyScalar(0.01));
  }
}

export default SurfaceTextPlacement;
