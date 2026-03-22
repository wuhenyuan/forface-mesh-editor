/**
 * 简单可靠的圆柱面检测器
 * 绕过复杂算法，直接基于几何体类型和基本特征检测
 */
import * as THREE from 'three';

export class SimpleCylinderDetector {
  [key: string]: CoreValue;
  /**
   * 简单直接的圆柱检测
   * @param {THREE.BufferGeometry} geometry - 几何体
   * @param {THREE.Mesh} mesh - 网格对象（可选，用于获取世界变换）
   * @returns {Object|null} 圆柱信息
   */
  detectCylinder(geometry, mesh = null) {
    console.log('🚀 使用简单圆柱检测器');

    // 1. 首先检查几何体类型
    if (geometry.type === 'CylinderGeometry') {
      console.log('✅ 检测到CylinderGeometry类型，直接提取参数');
      return this.extractFromCylinderGeometry(geometry, mesh);
    }

    // 2. 对于其他几何体，进行基本形状分析
    return this.analyzeGeometryShape(geometry, mesh);
  }

  /**
   * 从CylinderGeometry直接提取参数
   * @param {THREE.CylinderGeometry} geometry - 圆柱几何体
   * @param {THREE.Mesh} mesh - 网格对象（可选）
   * @returns {Object} 圆柱信息
   */
  extractFromCylinderGeometry(geometry, mesh = null) {
    // 计算边界框
    if (!geometry.boundingBox) {
      geometry.computeBoundingBox();
    }

    const bbox = geometry.boundingBox;
    const size = bbox.max.clone().sub(bbox.min);
    let center = bbox.getCenter(new THREE.Vector3());

    // 🔧 关键修复：如果有网格对象，将中心点转换到世界坐标系
    let axis = new THREE.Vector3(0, 1, 0); // 默认Y轴

    if (mesh) {
      // 更新网格的世界矩阵
      mesh.updateMatrixWorld(true);

      // 将局部中心点转换到世界坐标
      center = center.applyMatrix4(mesh.matrixWorld);

      // 将轴向也转换到世界坐标系（只旋转，不平移）
      const worldRotation = new THREE.Matrix4().extractRotation(mesh.matrixWorld);
      axis = axis.applyMatrix4(worldRotation).normalize();

      console.log('🌍 应用网格世界变换:', {
        meshPosition: mesh.position,
        meshRotation: mesh.rotation,
        worldCenter: center,
        worldAxis: axis,
      });
    }

    // 找到最长的轴作为圆柱轴（在局部坐标系中）
    const dimensions = [
      { value: size.x, localAxis: new THREE.Vector3(1, 0, 0), name: 'X' },
      { value: size.y, localAxis: new THREE.Vector3(0, 1, 0), name: 'Y' },
      { value: size.z, localAxis: new THREE.Vector3(0, 0, 1), name: 'Z' },
    ].sort((a, b) => b.value - a.value);

    const [longest, middle, shortest] = dimensions;

    // 如果有网格，将轴向转换到世界坐标系
    if (mesh) {
      const worldRotation = new THREE.Matrix4().extractRotation(mesh.matrixWorld);
      axis = longest.localAxis.clone().applyMatrix4(worldRotation).normalize();
    } else {
      axis = longest.localAxis.clone();
    }

    const height = longest.value;
    const radius = (middle.value + shortest.value) / 4;

    console.log('📏 从CylinderGeometry提取的参数:', {
      radius: radius.toFixed(3),
      height: height.toFixed(3),
      center: `(${center.x.toFixed(3)}, ${center.y.toFixed(3)}, ${center.z.toFixed(3)})`,
      axis: `(${axis.x.toFixed(3)}, ${axis.y.toFixed(3)}, ${axis.z.toFixed(3)})`,
      longestAxis: longest.name,
      dimensions: {
        [longest.name]: longest.value.toFixed(3),
        [middle.name]: middle.value.toFixed(3),
        [shortest.name]: shortest.value.toFixed(3),
      },
    });

    return {
      center: center,
      axis: axis,
      radius: radius,
      height: height,
      confidence: 0.95,
    };
  }

  /**
   * 分析几何体形状
   * @param {THREE.BufferGeometry} geometry - 几何体
   * @param {THREE.Mesh} mesh - 网格对象（可选）
   * @returns {Object|null} 圆柱信息
   */
  analyzeGeometryShape(geometry, mesh = null) {
    if (!geometry.attributes.position) {
      return null;
    }

    // 计算边界框
    if (!geometry.boundingBox) {
      geometry.computeBoundingBox();
    }

    const bbox = geometry.boundingBox;
    const size = bbox.max.clone().sub(bbox.min);
    let center = bbox.getCenter(new THREE.Vector3());

    // 如果有网格对象，转换到世界坐标
    if (mesh) {
      mesh.updateMatrixWorld(true);
      center = center.applyMatrix4(mesh.matrixWorld);
    }

    console.log('📐 几何体尺寸分析:', {
      width: size.x.toFixed(3),
      height: size.y.toFixed(3),
      depth: size.z.toFixed(3),
    });

    // 检查是否像圆柱
    const dimensions = [
      { value: size.x, localAxis: new THREE.Vector3(1, 0, 0), name: 'X' },
      { value: size.y, localAxis: new THREE.Vector3(0, 1, 0), name: 'Y' },
      { value: size.z, localAxis: new THREE.Vector3(0, 0, 1), name: 'Z' },
    ].sort((a, b) => b.value - a.value);

    const [longest, middle, shortest] = dimensions;

    const aspectRatio = longest.value / Math.max(middle.value, shortest.value);
    const crossSectionRatio =
      Math.abs(middle.value - shortest.value) / Math.max(middle.value, shortest.value);

    console.log('📊 形状分析:', {
      longestAxis: longest.name,
      aspectRatio: aspectRatio.toFixed(2),
      crossSectionRatio: crossSectionRatio.toFixed(2),
    });

    if (aspectRatio > 1.2 && crossSectionRatio < 0.3) {
      let axis = longest.localAxis.clone();

      // 如果有网格，转换轴向到世界坐标系
      if (mesh) {
        const worldRotation = new THREE.Matrix4().extractRotation(mesh.matrixWorld);
        axis = axis.applyMatrix4(worldRotation).normalize();
      }

      const radius = (middle.value + shortest.value) / 4;
      const height = longest.value;

      console.log('✅ 形状分析认为是圆柱');

      return {
        center: center,
        axis: axis,
        radius: radius,
        height: height,
        confidence: Math.min(0.8, 0.5 + (aspectRatio - 1) * 0.1),
      };
    }

    console.log('❌ 形状分析认为不是圆柱');
    return null;
  }

  /**
   * 快速验证（非常宽松）
   * @param {Object} cylinderInfo - 圆柱信息
   * @returns {boolean} 是否有效
   */
  quickValidate(cylinderInfo) {
    if (!cylinderInfo) return false;

    const isValid =
      cylinderInfo.radius > 0.01 && cylinderInfo.height > 0.01 && cylinderInfo.confidence > 0.1;

    console.log('🔍 快速验证结果:', {
      radius: cylinderInfo.radius.toFixed(3),
      height: cylinderInfo.height.toFixed(3),
      confidence: cylinderInfo.confidence.toFixed(3),
      isValid: isValid,
    });

    return isValid;
  }
}

// 创建单例
export const simpleCylinderDetector = new SimpleCylinderDetector();
