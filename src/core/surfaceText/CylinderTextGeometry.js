/**
 * 圆柱面文字几何体生成器
 * 
 * 核心思路：对已生成的 TextGeometry（闭合流形）进行圆柱坐标映射
 * 
 * 对于垂直圆柱（Y轴为轴向）：
 * - 文字的 X 方向（宽度）→ 沿圆周方向（角度 θ）
 * - 文字的 Y 方向（高度）→ 沿轴向（Y 坐标）
 * - 文字的 Z 方向（厚度）→ 径向（向外突出）
 * 
 * 映射公式：
 * - theta = startTheta + (localX / radius)
 * - worldY = startHeight + localY
 * - r = radius + localZ
 * - worldX = r * cos(theta)
 * - worldZ = r * sin(theta)
 */
import * as THREE from 'three'
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js'

export class CylinderTextGeometry {
  constructor() {
    this.defaultConfig = {
      curveSegments: 12,
      depth: 0.5,
      bevelEnabled: false,
      bevelThickness: 0.02,
      bevelSize: 0.01
    }
  }

  /**
   * 生成圆柱面上的文字几何体
   * @param {string} text - 文字内容
   * @param {THREE.Font} font - 字体
   * @param {Object} cylinderInfo - 圆柱信息 { center, axis, radius }
   * @param {THREE.Vector3} startPoint - 文字起始点（世界坐标）
   * @param {Object} config - 配置参数
   * @returns {THREE.BufferGeometry} 闭合的文字几何体（世界坐标系）
   */
  generate (text, font, cylinderInfo, startPoint, config = {}) {
    const finalConfig = { ...this.defaultConfig, ...config }
    const { center, axis, radius } = cylinderInfo

    console.log('🔧 CylinderTextGeometry.generate 开始:', {
      text,
      radius,
      center: `(${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)})`,
      axis: `(${axis.x.toFixed(2)}, ${axis.y.toFixed(2)}, ${axis.z.toFixed(2)})`,
      startPoint: `(${startPoint.x.toFixed(2)}, ${startPoint.y.toFixed(2)}, ${startPoint.z.toFixed(2)})`
    })

    // 1. 生成平面 TextGeometry（这是一个闭合流形）
    const textGeometry = new TextGeometry(text, {
      font: font,
      size: finalConfig.size || 1,
      height: finalConfig.thickness || finalConfig.depth || 0.5,
      curveSegments: finalConfig.curveSegments,
      bevelEnabled: finalConfig.bevelEnabled,
      bevelThickness: finalConfig.bevelThickness,
      bevelSize: finalConfig.bevelSize
    })

    // 计算边界框
    textGeometry.computeBoundingBox()
    const bbox = textGeometry.boundingBox
    const textWidth = bbox.max.x - bbox.min.x
    const textHeight = bbox.max.y - bbox.min.y
    const textDepth = bbox.max.z - bbox.min.z

    // 将文字几何体居中（X 方向居中，Y 方向居中，Z 从 0 开始向外）
    const centerOffsetX = -0.5 * textWidth - bbox.min.x
    const centerOffsetY = -0.5 * textHeight - bbox.min.y
    const centerOffsetZ = -bbox.min.z  // Z=0 是文字底面（贴着圆柱表面）

    textGeometry.translate(centerOffsetX, centerOffsetY, centerOffsetZ)

    console.log('📐 TextGeometry 尺寸:', {
      width: textWidth.toFixed(3),
      height: textHeight.toFixed(3),
      depth: textDepth.toFixed(3),
      vertexCount: textGeometry.attributes.position.count
    })

    // 2. 计算起始点在圆柱坐标系中的位置
    const startCylCoord = this.worldToCylinderCoord(startPoint, cylinderInfo)

    console.log('🎯 起始位置（圆柱坐标）:', {
      theta: (startCylCoord.theta * 180 / Math.PI).toFixed(2) + '°',
      height: startCylCoord.height.toFixed(3),
      radius: startCylCoord.radius.toFixed(3)
    })

    // 3. 对每个顶点应用圆柱坐标映射
    this.applyCylinderMapping(textGeometry, cylinderInfo, startCylCoord.theta, startCylCoord.height)

    // 4. 重新计算法向量 - 使用平滑法向量避免接缝
    this.computeSmoothNormals(textGeometry, cylinderInfo)

    textGeometry.computeBoundingBox()
    textGeometry.computeBoundingSphere()

    // 标记为流形几何体
    textGeometry.userData = {
      isManifold: true,
      generatorType: 'CylinderTextGeometry',
      cylinderInfo: {
        radius: radius,
        center: center.clone(),
        axis: axis.clone()
      }
    }

    console.log('✅ 圆柱面文字几何体生成完成:', {
      vertexCount: textGeometry.attributes.position.count,
      isManifold: true
    })

    return textGeometry
  }

  /**
   * 将世界坐标转换为圆柱坐标
   * @param {THREE.Vector3} worldPoint - 世界坐标点
   * @param {Object} cylinderInfo - 圆柱信息
   * @returns {Object} { theta: 角度, height: 沿轴高度, radius: 径向距离 }
   */
  worldToCylinderCoord (worldPoint, cylinderInfo) {
    const { center, axis } = cylinderInfo
    const axisNorm = axis.clone().normalize()

    // 计算点相对于圆柱中心的向量
    const toPoint = worldPoint.clone().sub(center)

    // 沿轴方向的分量（高度）
    const height = toPoint.dot(axisNorm)

    // 径向分量（垂直于轴的分量）
    const radialVector = toPoint.clone().sub(axisNorm.clone().multiplyScalar(height))
    const radius = radialVector.length()

    // 计算角度
    // 对于 Y 轴向上的圆柱，我们用 X-Z 平面来计算角度
    // theta = atan2(z, x)
    let theta = 0
    if (radius > 0.001) {
      // 判断轴向
      if (Math.abs(axisNorm.y) > 0.9) {
        // Y 轴为主轴（垂直圆柱）
        theta = Math.atan2(radialVector.z, radialVector.x)
      } else if (Math.abs(axisNorm.z) > 0.9) {
        // Z 轴为主轴
        theta = Math.atan2(radialVector.y, radialVector.x)
      } else {
        // X 轴为主轴
        theta = Math.atan2(radialVector.z, radialVector.y)
      }
    }

    return { theta, height, radius }
  }

  /**
   * 对几何体应用圆柱坐标映射
   * 
   * 对于垂直圆柱（Y轴为轴向）：
   * - localX（文字宽度）→ 角度偏移
   * - localY（文字高度）→ Y 坐标偏移
   * - localZ（文字厚度）→ 径向偏移
   * 
   * @param {THREE.BufferGeometry} geometry - 文字几何体
   * @param {Object} cylinderInfo - 圆柱信息
   * @param {number} startTheta - 起始角度
   * @param {number} startHeight - 起始高度（沿轴向）
   */
  applyCylinderMapping (geometry, cylinderInfo, startTheta, startHeight) {
    const { center, axis, radius } = cylinderInfo
    const axisNorm = axis.clone().normalize()
    const positions = geometry.attributes.position
    const positionArray = positions.array

    console.log('🔄 开始圆柱坐标映射:', {
      vertexCount: positionArray.length / 3,
      radius,
      startTheta: (startTheta * 180 / Math.PI).toFixed(2) + '°',
      startHeight: startHeight.toFixed(3),
      axisDirection: `(${axisNorm.x.toFixed(2)}, ${axisNorm.y.toFixed(2)}, ${axisNorm.z.toFixed(2)})`
    })

    // 判断圆柱轴向
    const isVertical = Math.abs(axisNorm.y) > 0.9  // Y 轴为主轴

    // 记录一些顶点用于调试
    const sampleVertices = []

    for (let i = 0; i < positionArray.length; i += 3) {
      // 原始顶点坐标（文字局部坐标系，已居中）
      const localX = positionArray[i]     // 宽度方向 → 角度
      const localY = positionArray[i + 1] // 高度方向 → 轴向
      const localZ = positionArray[i + 2] // 厚度方向 → 径向

      // 1. 计算该顶点的角度
      // 弧长 = 角度 × 半径，所以 角度 = 弧长 / 半径
      const deltaTheta = localX / radius
      const theta = startTheta + deltaTheta

      // 2. 计算该顶点的径向距离
      // localZ 是文字厚度方向，0 表示文字底面（贴着圆柱表面）
      const vertexRadius = radius + localZ

      // 3. 计算世界坐标
      let worldX, worldY, worldZ

      if (isVertical) {
        // 垂直圆柱（Y 轴为轴向）
        // X-Z 平面是圆周平面
        // 注意：使用负的 deltaTheta 来修正镜像问题
        // 因为从外部看圆柱，角度增加应该是逆时针方向（文字从左到右）
        const correctedTheta = startTheta - deltaTheta
        worldX = center.x + vertexRadius * Math.cos(correctedTheta)
        worldZ = center.z + vertexRadius * Math.sin(correctedTheta)
        worldY = center.y + startHeight + localY  // Y 是轴向
      } else {
        // 其他方向的圆柱（通用处理）
        // 需要建立局部坐标系
        const refDir = this.getPerpendicularVector(axisNorm)
        const tangentDir = axisNorm.clone().cross(refDir).normalize()

        const radialDir = refDir.clone()
          .multiplyScalar(Math.cos(theta))
          .add(tangentDir.clone().multiplyScalar(Math.sin(theta)))

        const axialOffset = axisNorm.clone().multiplyScalar(startHeight + localY)
        const radialOffset = radialDir.multiplyScalar(vertexRadius)

        worldX = center.x + axialOffset.x + radialOffset.x
        worldY = center.y + axialOffset.y + radialOffset.y
        worldZ = center.z + axialOffset.z + radialOffset.z
      }

      // 更新顶点位置
      positionArray[i] = worldX
      positionArray[i + 1] = worldY
      positionArray[i + 2] = worldZ

      // 记录前几个顶点用于调试
      if (sampleVertices.length < 5) {
        const displayTheta = isVertical ? (startTheta - deltaTheta) : theta
        sampleVertices.push({
          index: i / 3,
          local: `(${localX.toFixed(2)}, ${localY.toFixed(2)}, ${localZ.toFixed(2)})`,
          theta: (displayTheta * 180 / Math.PI).toFixed(2) + '°',
          radius: vertexRadius.toFixed(2),
          world: `(${worldX.toFixed(2)}, ${worldY.toFixed(2)}, ${worldZ.toFixed(2)})`
        })
      }
    }

    // 标记顶点数据需要更新
    positions.needsUpdate = true

    console.log('📍 顶点映射示例:', sampleVertices)
  }

  /**
   * 获取垂直于给定向量的向量
   * @param {THREE.Vector3} vector - 输入向量
   * @returns {THREE.Vector3} 垂直向量
   */
  getPerpendicularVector (vector) {
    const normalized = vector.clone().normalize()

    // 选择一个不平行的向量
    let perpendicular
    if (Math.abs(normalized.x) < 0.9) {
      perpendicular = new THREE.Vector3(1, 0, 0)
    } else {
      perpendicular = new THREE.Vector3(0, 1, 0)
    }

    // 计算叉积得到垂直向量
    return perpendicular.cross(normalized).normalize()
  }

  /**
   * 计算平滑法向量
   * 对于圆柱面上的文字，顶面和底面的法向量应该是径向的
   * 侧面的法向量需要根据面的朝向计算
   * 
   * @param {THREE.BufferGeometry} geometry - 几何体
   * @param {Object} cylinderInfo - 圆柱信息
   */
  computeSmoothNormals (geometry, cylinderInfo) {
    const { center, axis } = cylinderInfo
    const axisNorm = axis.clone().normalize()
    const isVertical = Math.abs(axisNorm.y) > 0.9

    // 先用标准方法计算法向量
    geometry.computeVertexNormals()

    const positions = geometry.attributes.position.array
    const normals = geometry.attributes.normal.array

    // 对于每个顶点，检查其法向量是否需要修正
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i]
      const y = positions[i + 1]
      const z = positions[i + 2]

      const nx = normals[i]
      const ny = normals[i + 1]
      const nz = normals[i + 2]

      // 计算该顶点的径向方向
      let radialDir
      if (isVertical) {
        // 垂直圆柱：径向在 X-Z 平面
        radialDir = new THREE.Vector3(x - center.x, 0, z - center.z).normalize()
      } else {
        // 通用情况
        const toVertex = new THREE.Vector3(x, y, z).sub(center)
        const axialComponent = toVertex.dot(axisNorm)
        radialDir = toVertex.clone().sub(axisNorm.clone().multiplyScalar(axialComponent)).normalize()
      }

      // 检查当前法向量与径向方向的关系
      const currentNormal = new THREE.Vector3(nx, ny, nz)
      const dotProduct = currentNormal.dot(radialDir)

      // 如果法向量主要是径向的（顶面/底面），确保它指向外部
      if (Math.abs(dotProduct) > 0.7) {
        // 这是顶面或底面，法向量应该是径向的
        if (dotProduct < 0) {
          // 法向量指向内部，需要翻转
          normals[i] = -nx
          normals[i + 1] = -ny
          normals[i + 2] = -nz
        }
      }
      // 侧面的法向量保持不变（由 computeVertexNormals 计算）
    }

    geometry.attributes.normal.needsUpdate = true
  }
}

// 导出单例
export const cylinderTextGeometry = new CylinderTextGeometry()
