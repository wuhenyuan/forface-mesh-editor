/**
 * 弧形文字几何体生成器
 * 用于生成沿曲面拟合的文字几何体
 */
import * as THREE from 'three'
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js'
import { cylinderSurfaceHelper } from './CylinderSurfaceHelper'
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export class CurvedTextGeometry {
  [key: string]: any;
  constructor() {
    this.defaultConfig = {
      curveSegments: 12,
      bevelEnabled: false,
      bevelThickness: 0.02,
      bevelSize: 0.01,
      bevelOffset: 0,
      bevelSegments: 5,
      // 圆柱面文字默认配置
      subdivisionLevel: 1,  // 细分级别，增加顶点密度以获得平滑弯曲
      letterSpacing: 0.2    // 默认字符间距，比平面文字稍大
    }
  }

  /**
   * 生成沿圆柱面拟合的文字几何体
   * @param {string} text - 文字内容
   * @param {THREE.Font} font - 字体
   * @param {Object} cylinderInfo - 圆柱面信息
   * @param {THREE.Vector3} startPoint - 起始点
   * @param {Object} config - 配置参数
   * @returns {THREE.BufferGeometry} 弧形文字几何体
   */
  generateCylinderText(text, font, cylinderInfo, startPoint, config = {}) {
    const finalConfig = { ...this.defaultConfig, ...config }
    
    const fontSize = finalConfig.size || 1
    const thickness = finalConfig.thickness || 0.1
    const radius = cylinderInfo.radius
    
    // 计算弧长补偿系数
    // 当字符包裹到圆柱面时，外表面的弧长比内表面长
    // 外表面半径 = radius + thickness
    // 弧长比例 = (radius + thickness) / radius = 1 + thickness/radius
    const arcLengthRatio = (radius + thickness) / radius
    
    // 字符宽度（平面上）
    const charWidth = fontSize * 0.6
    
    // 字符在圆柱面外表面的实际宽度
    const charArcWidth = charWidth * arcLengthRatio
    
    // 基础间距
    const baseSpacing = finalConfig.letterSpacing !== undefined ? finalConfig.letterSpacing : 0.2
    
    // 弧长补偿间距：需要额外增加的间距 = 字符宽度 × (弧长比例 - 1)
    // 这样可以保证字符外表面不会重叠
    const arcCompensation = charWidth * (arcLengthRatio - 1)
    
    // 最终间距 = 基础间距 + 弧长补偿
    const actualSpacing = baseSpacing + arcCompensation
    
    console.log('📏 圆柱面字符间距计算:', {
      fontSize,
      thickness,
      radius,
      charWidth,
      arcLengthRatio: arcLengthRatio.toFixed(3),
      charArcWidth: charArcWidth.toFixed(3),
      baseSpacing,
      arcCompensation: arcCompensation.toFixed(3),
      actualSpacing: actualSpacing.toFixed(3)
    })
    
    // 生成文字路径
    const textPath = cylinderSurfaceHelper.generateTextPath(
      text, 
      startPoint, 
      cylinderInfo, 
      {
        fontSize: fontSize,
        letterSpacing: actualSpacing,
        direction: finalConfig.direction || 1
      }
    )

    // 为每个字符生成几何体
    const characterGeometries = []
    
    for (const pathPoint of textPath) {
      const charGeometry = this.createCharacterGeometry(
        pathPoint.char,
        font,
        pathPoint,
        cylinderInfo,
        finalConfig
      )
      
      if (charGeometry) {
        characterGeometries.push(charGeometry)
      }
    }

    // 合并所有字符几何体
    if (characterGeometries.length === 0) {
      console.warn('没有生成任何字符几何体')
      return new THREE.BufferGeometry()
    }

    return this.mergeGeometries(characterGeometries)
  }

  /**
   * 为单个字符创建几何体
   * @param {string} char - 字符
   * @param {THREE.Font} font - 字体
   * @param {Object} pathPoint - 路径点信息
   * @param {Object} cylinderInfo - 圆柱信息
   * @param {Object} config - 配置
   * @returns {THREE.BufferGeometry} 字符几何体
   */
  createCharacterGeometry(char, font, pathPoint, cylinderInfo, config) {
    try {
      // 创建基础字符几何体
      let charGeometry = new TextGeometry(char, {
        font: font,
        size: config.size || 1,
        depth: config.thickness || 0.1,
        curveSegments: config.curveSegments,
        bevelEnabled: config.bevelEnabled,
        bevelThickness: config.bevelThickness,
        bevelSize: config.bevelSize,
        bevelOffset: config.bevelOffset,
        bevelSegments: config.bevelSegments
      })

      // 计算字符边界框并居中
      charGeometry.computeBoundingBox()
      const bbox = charGeometry.boundingBox
      const centerX = -0.5 * (bbox.max.x - bbox.min.x)
      const centerY = -0.5 * (bbox.max.y - bbox.min.y)
      const centerZ = -0.5 * (bbox.max.z - bbox.min.z)
      
      charGeometry.translate(centerX, centerY, centerZ)

      // 细分几何体以获得更平滑的弯曲效果
      const subdivisionLevel = config.subdivisionLevel || 1
      if (subdivisionLevel > 0) {
        charGeometry = this.subdivideGeometry(charGeometry, subdivisionLevel)
      }

      // 应用圆柱面变换
      this.applyCylinderTransform(charGeometry, pathPoint, cylinderInfo, config)

      return charGeometry

    } catch (error) {
      console.error(`创建字符 "${char}" 几何体失败:`, error)
      return null
    }
  }

  /**
   * 细分几何体以增加顶点密度
   * 这对于弯曲变形非常重要，否则三角面会出现明显的折痕
   * @param {THREE.BufferGeometry} geometry - 原始几何体
   * @param {number} level - 细分级别 (1-3)
   * @returns {THREE.BufferGeometry} 细分后的几何体
   */
  subdivideGeometry(geometry, level = 1) {
    // 对于 TextGeometry，最好的方式是增加 curveSegments
    // 这里我们实现一个简单的三角形细分
    
    let currentGeometry = geometry
    
    for (let i = 0; i < level; i++) {
      currentGeometry = this.subdivideOnce(currentGeometry)
    }
    
    return currentGeometry
  }

  /**
   * 执行一次细分
   * 将每个三角形分成4个小三角形
   * @param {THREE.BufferGeometry} geometry - 几何体
   * @returns {THREE.BufferGeometry} 细分后的几何体
   */
  subdivideOnce(geometry) {
    const positions = geometry.attributes.position.array
    const indices = geometry.index ? geometry.index.array : null
    
    if (!indices) {
      // 非索引几何体，直接返回
      console.warn('非索引几何体，跳过细分')
      return geometry
    }

    const newPositions = []
    const newIndices = []
    const edgeMidpoints = new Map() // 缓存边的中点

    // 获取边的key
    const getEdgeKey = (i1, i2) => {
      return i1 < i2 ? `${i1}_${i2}` : `${i2}_${i1}`
    }

    // 获取或创建边的中点
    const getMidpoint = (i1, i2) => {
      const key = getEdgeKey(i1, i2)
      if (edgeMidpoints.has(key)) {
        return edgeMidpoints.get(key)
      }

      // 计算中点
      const x = (positions[i1 * 3] + positions[i2 * 3]) / 2
      const y = (positions[i1 * 3 + 1] + positions[i2 * 3 + 1]) / 2
      const z = (positions[i1 * 3 + 2] + positions[i2 * 3 + 2]) / 2

      const newIndex = newPositions.length / 3
      newPositions.push(x, y, z)
      edgeMidpoints.set(key, newIndex)
      return newIndex
    }

    // 首先复制所有原始顶点
    for (let i = 0; i < positions.length; i++) {
      newPositions.push(positions[i])
    }

    // 处理每个三角形
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i]
      const b = indices[i + 1]
      const c = indices[i + 2]

      // 获取三条边的中点
      const ab = getMidpoint(a, b)
      const bc = getMidpoint(b, c)
      const ca = getMidpoint(c, a)

      // 创建4个新三角形
      // 三角形1: a, ab, ca
      newIndices.push(a, ab, ca)
      // 三角形2: ab, b, bc
      newIndices.push(ab, b, bc)
      // 三角形3: ca, bc, c
      newIndices.push(ca, bc, c)
      // 三角形4: ab, bc, ca (中心三角形)
      newIndices.push(ab, bc, ca)
    }

    // 创建新几何体
    const newGeometry = new THREE.BufferGeometry()
    newGeometry.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3))
    newGeometry.setIndex(newIndices)
    
    // 重新计算法向量
    newGeometry.computeVertexNormals()

    // 清理旧几何体
    geometry.dispose()

    console.log(`✅ 几何体细分完成: ${indices.length / 3} → ${newIndices.length / 3} 三角形`)
    
    return newGeometry
  }

  /**
   * 手动细分几何体（备用方案）
   * 通过在每条边的中点添加顶点来增加密度
   * @param {THREE.BufferGeometry} geometry - 原始几何体
   * @param {number} level - 细分级别
   * @returns {THREE.BufferGeometry} 细分后的几何体
   */
  manualSubdivide(geometry, level = 1) {
    // 对于简单情况，我们可以通过增加 curveSegments 来获得更多顶点
    // 这里返回原始几何体，依赖 TextGeometry 的 curveSegments 参数
    console.log('⚠️ 使用原始几何体（建议增加 curveSegments 参数）')
    return geometry
  }

  /**
   * 应用圆柱面变换到字符几何体
   * 核心思路：将每个顶点"包裹"到圆柱面上，而不是简单旋转
   * @param {THREE.BufferGeometry} geometry - 字符几何体
   * @param {Object} pathPoint - 路径点
   * @param {Object} cylinderInfo - 圆柱信息
   * @param {Object} config - 配置
   */
  applyCylinderTransform(geometry, pathPoint, cylinderInfo, config) {
    const { position, theta } = pathPoint
    const { axis, radius, center } = cylinderInfo

    console.log('🔄 应用圆柱面包裹变换:', {
      position: position,
      theta: theta,
      axis: axis,
      radius: radius,
      center: center
    })

    // 获取顶点数据
    const positions = geometry.attributes.position
    const positionArray = positions.array

    // 计算字符在圆柱坐标系中的基准位置
    const toPosition = position.clone().sub(center)
    const baseHeight = toPosition.dot(axis) // 沿轴向的高度
    
    // 获取参考方向（用于计算角度）
    const refDirection = this.getPerpendicularVector(axis)
    const tangentRef = refDirection.clone().cross(axis).normalize()

    // 对每个顶点应用圆柱面包裹变换
    for (let i = 0; i < positionArray.length; i += 3) {
      // 原始顶点坐标（字符局部坐标系，已居中）
      // X = 字符宽度方向（沿圆周）
      // Y = 字符高度方向（沿轴向）
      // Z = 字符厚度方向（径向）
      const localX = positionArray[i]     // 沿圆周方向的偏移
      const localY = positionArray[i + 1] // 沿轴向的偏移
      const localZ = positionArray[i + 2] // 径向偏移（厚度）

      // 1. 计算该顶点对应的角度
      // localX 转换为角度偏移：弧长 = 角度 × 半径，所以 角度 = 弧长 / 半径
      const angleOffset = localX / radius
      const vertexTheta = theta + angleOffset

      // 2. 计算该顶点的轴向位置
      const vertexHeight = baseHeight + localY

      // 3. 计算该顶点的径向距离（半径 + 厚度偏移）
      const vertexRadius = radius + localZ

      // 4. 将圆柱坐标转换为世界坐标
      // 计算径向方向
      const radialDirection = refDirection.clone()
        .multiplyScalar(Math.cos(vertexTheta))
        .add(tangentRef.clone().multiplyScalar(Math.sin(vertexTheta)))

      // 计算最终世界坐标
      const worldPos = center.clone()
        .add(axis.clone().multiplyScalar(vertexHeight))
        .add(radialDirection.multiplyScalar(vertexRadius))

      // 更新顶点位置
      positionArray[i] = worldPos.x
      positionArray[i + 1] = worldPos.y
      positionArray[i + 2] = worldPos.z
    }

    // 标记顶点数据需要更新
    positions.needsUpdate = true

    // 重新计算法向量（因为顶点位置改变了）
    geometry.computeVertexNormals()
    
    // 检查并修正三角形顶点顺序（winding order）
    // 弯曲变换可能导致某些三角形的顶点顺序翻转
    this.fixWindingOrder(geometry, center, axis)
    
    // 重新计算边界框
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()

    console.log('✅ 圆柱面包裹变换完成')
  }

  /**
   * 修正三角形的顶点顺序
   * 确保所有三角形的法向量都指向圆柱外侧
   * @param {THREE.BufferGeometry} geometry - 几何体
   * @param {THREE.Vector3} cylinderCenter - 圆柱中心
   * @param {THREE.Vector3} cylinderAxis - 圆柱轴向
   */
  fixWindingOrder(geometry, cylinderCenter, cylinderAxis) {
    const positions = geometry.attributes.position.array
    const indices = geometry.index ? geometry.index.array : null
    
    if (!indices) {
      console.warn('非索引几何体，跳过顶点顺序修正')
      return
    }

    const newIndices = [...indices]
    let flippedCount = 0

    // 遍历每个三角形
    for (let i = 0; i < indices.length; i += 3) {
      const i0 = indices[i]
      const i1 = indices[i + 1]
      const i2 = indices[i + 2]

      // 获取三个顶点
      const v0 = new THREE.Vector3(positions[i0 * 3], positions[i0 * 3 + 1], positions[i0 * 3 + 2])
      const v1 = new THREE.Vector3(positions[i1 * 3], positions[i1 * 3 + 1], positions[i1 * 3 + 2])
      const v2 = new THREE.Vector3(positions[i2 * 3], positions[i2 * 3 + 1], positions[i2 * 3 + 2])

      // 计算三角形中心
      const triCenter = v0.clone().add(v1).add(v2).divideScalar(3)

      // 计算三角形法向量（通过叉积）
      const edge1 = v1.clone().sub(v0)
      const edge2 = v2.clone().sub(v0)
      const faceNormal = edge1.cross(edge2).normalize()

      // 计算从圆柱中心到三角形中心的径向方向
      const toTriCenter = triCenter.clone().sub(cylinderCenter)
      const axialComponent = toTriCenter.dot(cylinderAxis)
      const radialDirection = toTriCenter.clone().sub(cylinderAxis.clone().multiplyScalar(axialComponent)).normalize()

      // 如果法向量与径向方向相反（指向内部），则翻转顶点顺序
      if (faceNormal.dot(radialDirection) < 0) {
        // 交换 i1 和 i2 来翻转三角形
        newIndices[i + 1] = i2
        newIndices[i + 2] = i1
        flippedCount++
      }
    }

    if (flippedCount > 0) {
      geometry.setIndex(newIndices)
      geometry.computeVertexNormals() // 重新计算法向量
      console.log(`🔄 修正了 ${flippedCount} 个三角形的顶点顺序`)
    }
  }

  /**
   * 获取垂直于给定向量的向量
   * @param {THREE.Vector3} vector - 输入向量
   * @returns {THREE.Vector3} 垂直向量
   */
  getPerpendicularVector(vector) {
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
   * 计算圆柱面上的切线方向
   * @param {number} theta - 角度
   * @param {Object} cylinderInfo - 圆柱信息
   * @returns {THREE.Vector3} 切线向量
   */
  calculateTangent(theta, cylinderInfo) {
    const { axis } = cylinderInfo
    
    // 获取垂直于轴的参考方向
    const refDirection = this.getPerpendicularVector(axis)
    const tangentRef = refDirection.clone().cross(axis).normalize()
    
    // 计算该角度处的切线方向
    // 切线 = -sin(theta) * refDirection + cos(theta) * tangentRef
    const tangent = refDirection.clone()
      .multiplyScalar(-Math.sin(theta))
      .add(tangentRef.clone().multiplyScalar(Math.cos(theta)))
    
    return tangent.normalize()
  }

  /**
   * 合并多个几何体
   * @param {THREE.BufferGeometry[]} geometries - 几何体数组
   * @returns {THREE.BufferGeometry} 合并后的几何体
   */
  mergeGeometries(geometries) {
    if (geometries.length === 0) {
      return new THREE.BufferGeometry()
    }

    if (geometries.length === 1) {
      return geometries[0]
    }

    try {
      // 使用Three.js的BufferGeometryUtils合并几何体
      const mergedGeometry = BufferGeometryUtils.mergeGeometries(geometries)
      
      if (!mergedGeometry) {
        console.warn('几何体合并失败，返回第一个几何体')
        return geometries[0]
      }

      // 清理原始几何体
      geometries.forEach(geo => {
        if (geo !== mergedGeometry) {
          geo.dispose()
        }
      })

      return mergedGeometry

    } catch (error) {
      console.error('合并几何体时出错:', error)
      return geometries[0]
    }
  }

  /**
   * 生成平面文字（用于非圆柱面）
   * @param {string} text - 文字内容
   * @param {THREE.Font} font - 字体
   * @param {Object} config - 配置
   * @returns {THREE.BufferGeometry} 平面文字几何体
   */
  generateFlatText(text, font, config = {}) {
    const finalConfig = { ...this.defaultConfig, ...config }

    try {
      const geometry = new TextGeometry(text, {
        font: font,
        size: finalConfig.size || 1,
        depth: finalConfig.thickness || 0.1,
        curveSegments: finalConfig.curveSegments,
        bevelEnabled: finalConfig.bevelEnabled,
        bevelThickness: finalConfig.bevelThickness,
        bevelSize: finalConfig.bevelSize,
        bevelOffset: finalConfig.bevelOffset,
        bevelSegments: finalConfig.bevelSegments
      })

      // 计算边界框并居中
      geometry.computeBoundingBox()
      const bbox = geometry.boundingBox
      const centerX = -0.5 * (bbox.max.x - bbox.min.x)
      const centerY = -0.5 * (bbox.max.y - bbox.min.y)
      const centerZ = -0.5 * (bbox.max.z - bbox.min.z)
      
      geometry.translate(centerX, centerY, centerZ)

      return geometry

    } catch (error) {
      console.error('生成平面文字几何体失败:', error)
      return new THREE.BufferGeometry()
    }
  }
}

// 导出单例
export const curvedTextGeometry = new CurvedTextGeometry()
