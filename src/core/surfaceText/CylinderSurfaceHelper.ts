/**
 * 圆柱面辅助工具
 * 用于检测、分析和处理圆柱面几何体
 */
import * as THREE from 'three'

export class CylinderSurfaceHelper {
  [key: string]: any;
  constructor() {
    this.tolerance = 0.001 // 几何体检测容差
  }

  /**
   * 检测几何体是否为圆柱面
   * @param {THREE.BufferGeometry} geometry - 几何体
   * @returns {Object|null} 圆柱面信息或null
   */
  detectCylinder(geometry) {
    if (!geometry || !geometry.attributes.position) {
      return null
    }

    const positions = geometry.attributes.position.array
    const vertexCount = positions.length / 3

    if (vertexCount < 6) {
      return null // 至少需要6个顶点形成圆柱
    }

    // 采样顶点进行分析
    const sampleSize = Math.min(100, vertexCount)
    const step = Math.floor(vertexCount / sampleSize)
    const samples = []

    for (let i = 0; i < sampleSize; i++) {
      const idx = i * step * 3
      samples.push(new THREE.Vector3(
        positions[idx],
        positions[idx + 1], 
        positions[idx + 2]
      ))
    }

    // 尝试拟合圆柱面
    const cylinderInfo = this.fitCylinder(samples)
    
    if (cylinderInfo && this.validateCylinder(samples, cylinderInfo)) {
      return cylinderInfo
    }

    return null
  }

  /**
   * 拟合圆柱面参数 - 使用RANSAC算法
   * @param {THREE.Vector3[]} points - 采样点
   * @returns {Object|null} 圆柱面参数
   */
  fitCylinder(points) {
    if (points.length < 6) return null

    // 使用RANSAC算法拟合圆柱面
    const bestFit = this.ransacCylinderFit(points)
    
    if (!bestFit) {
      // 如果RANSAC失败，尝试基于主成分分析的方法
      return this.pcaCylinderFit(points)
    }
    
    return bestFit
  }

  /**
   * 使用RANSAC算法拟合圆柱面
   * @param {THREE.Vector3[]} points - 点集
   * @returns {Object|null} 最佳拟合结果
   */
  ransacCylinderFit(points) {
    const maxIterations = 150 // 增加迭代次数
    const minInliers = Math.floor(points.length * 0.5) // 降低要求从60%到50%
    const distanceThreshold = 0.15 // 放宽距离阈值从0.1到0.15
    
    console.log('🎯 RANSAC参数:', {
      maxIterations,
      minInliers,
      distanceThreshold,
      totalPoints: points.length
    })
    
    let bestFit = null
    let bestInlierCount = 0

    for (let iter = 0; iter < maxIterations; iter++) {
      // 随机选择5个点来估计圆柱参数
      const samplePoints = this.randomSample(points, 5)
      
      // 尝试从这5个点估计圆柱参数
      const cylinderCandidate = this.estimateCylinderFrom5Points(samplePoints)
      
      if (!cylinderCandidate) continue

      // 计算有多少点支持这个圆柱
      const inliers = this.countInliers(points, cylinderCandidate, distanceThreshold)
      
      if (inliers > bestInlierCount && inliers >= minInliers) {
        bestInlierCount = inliers
        bestFit = cylinderCandidate
        console.log(`🎯 RANSAC找到更好拟合: ${inliers}/${points.length} 点支持`)
      }
    }

    if (bestFit) {
      console.log('✅ RANSAC拟合成功:', {
        inliers: bestInlierCount,
        totalPoints: points.length,
        inlierRatio: (bestInlierCount / points.length * 100).toFixed(1) + '%'
      })
    } else {
      console.log('❌ RANSAC拟合失败，将尝试PCA方法')
    }

    return bestFit
  }

  /**
   * 从5个点估计圆柱参数
   * @param {THREE.Vector3[]} points - 5个采样点
   * @returns {Object|null} 圆柱参数
   */
  estimateCylinderFrom5Points(points) {
    if (points.length !== 5) return null

    try {
      // 方法1: 假设前3个点在一个圆上，后2个点确定轴向
      const circle = this.fitCircleFrom3Points(points.slice(0, 3))
      if (!circle) return null

      // 使用后两个点来估计轴向
      const axis = this.estimateAxisFromPoints(points, circle.center)
      if (!axis) return null

      // 计算圆柱中心（圆心在轴上的投影）
      const center = this.projectPointOntoLine(circle.center, new THREE.Vector3(), axis)
      
      return {
        center: center,
        axis: axis.normalize(),
        radius: circle.radius,
        height: this.estimateHeight(points, center, axis),
        confidence: 0.5 // 初始置信度
      }

    } catch (error) {
      return null
    }
  }

  /**
   * 从3个点拟合圆
   * @param {THREE.Vector3[]} points - 3个点
   * @returns {Object|null} 圆心和半径
   */
  fitCircleFrom3Points(points) {
    if (points.length !== 3) return null

    const [p1, p2, p3] = points

    // 检查三点是否共线
    const v1 = p2.clone().sub(p1)
    const v2 = p3.clone().sub(p1)
    const cross = v1.clone().cross(v2)
    
    if (cross.length() < 0.001) {
      return null // 三点共线，无法确定圆
    }

    // 使用几何方法计算外接圆
    const a = p1.distanceTo(p2)
    const b = p2.distanceTo(p3)
    const c = p3.distanceTo(p1)
    
    // 计算外接圆半径
    const s = (a + b + c) / 2 // 半周长
    const area = Math.sqrt(s * (s - a) * (s - b) * (s - c)) // 海伦公式
    
    if (area < 0.001) return null
    
    const radius = (a * b * c) / (4 * area)
    
    // 计算外接圆圆心
    const d = 2 * (p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y))
    
    if (Math.abs(d) < 0.001) return null
    
    const ux = ((p1.x * p1.x + p1.y * p1.y) * (p2.y - p3.y) + 
                (p2.x * p2.x + p2.y * p2.y) * (p3.y - p1.y) + 
                (p3.x * p3.x + p3.y * p3.y) * (p1.y - p2.y)) / d
    
    const uy = ((p1.x * p1.x + p1.y * p1.y) * (p3.x - p2.x) + 
                (p2.x * p2.x + p2.y * p2.y) * (p1.x - p3.x) + 
                (p3.x * p3.x + p3.y * p3.y) * (p2.x - p1.x)) / d

    return {
      center: new THREE.Vector3(ux, uy, (p1.z + p2.z + p3.z) / 3),
      radius: radius
    }
  }

  /**
   * 基于主成分分析的圆柱拟合
   * @param {THREE.Vector3[]} points - 点集
   * @returns {Object|null} 圆柱参数
   */
  pcaCylinderFit(points) {
    console.log('🔧 使用PCA方法拟合圆柱')
    
    // 计算点云的质心
    const centroid = new THREE.Vector3()
    for (const point of points) {
      centroid.add(point)
    }
    centroid.divideScalar(points.length)

    // 计算协方差矩阵
    const covariance = this.computeCovarianceMatrix(points, centroid)
    
    // 计算特征值和特征向量
    const eigen = this.computeEigenVectors(covariance)
    
    if (!eigen) {
      console.log('❌ PCA特征向量计算失败')
      return null
    }

    // 最大特征值对应的特征向量作为圆柱轴向
    const axis = eigen.maxEigenVector.normalize()
    
    // 将所有点投影到垂直于轴的平面上
    const projectedPoints = []
    for (const point of points) {
      const toPoint = point.clone().sub(centroid)
      const axialComponent = toPoint.dot(axis)
      const projected = point.clone().sub(axis.clone().multiplyScalar(axialComponent))
      projectedPoints.push(projected)
    }

    // 计算投影点的中心和平均半径
    const projectedCenter = new THREE.Vector3()
    for (const p of projectedPoints) {
      projectedCenter.add(p)
    }
    projectedCenter.divideScalar(projectedPoints.length)

    // 计算平均半径和方差
    let totalRadius = 0
    let radiusVariance = 0
    
    for (const p of projectedPoints) {
      const radius = p.distanceTo(projectedCenter)
      totalRadius += radius
    }
    
    const avgRadius = totalRadius / projectedPoints.length
    
    for (const p of projectedPoints) {
      const radius = p.distanceTo(projectedCenter)
      radiusVariance += Math.pow(radius - avgRadius, 2)
    }
    
    const radiusStdDev = Math.sqrt(radiusVariance / projectedPoints.length)
    
    // 改进置信度计算 - 对低分辨率圆柱更宽容
    const radiusConsistency = Math.max(0, 1 - (radiusStdDev / avgRadius))
    
    // 检查几何体的圆柱特征
    const aspectRatio = this.calculateAspectRatio(points)
    const geometryScore = this.calculateGeometryScore(points, centroid, axis, avgRadius)
    
    // 综合置信度计算
    const confidence = Math.min(1, (radiusConsistency * 0.4 + aspectRatio * 0.3 + geometryScore * 0.3))
    
    console.log('📊 PCA分析结果:', {
      avgRadius: avgRadius.toFixed(3),
      radiusStdDev: radiusStdDev.toFixed(3),
      radiusConsistency: radiusConsistency.toFixed(3),
      aspectRatio: aspectRatio.toFixed(3),
      geometryScore: geometryScore.toFixed(3),
      finalConfidence: confidence.toFixed(3)
    })
    
    // 计算高度范围
    let minHeight = Infinity
    let maxHeight = -Infinity
    
    for (const point of points) {
      const height = point.clone().sub(projectedCenter).dot(axis)
      minHeight = Math.min(minHeight, height)
      maxHeight = Math.max(maxHeight, height)
    }

    return {
      center: projectedCenter,
      axis: axis,
      radius: avgRadius,
      height: maxHeight - minHeight,
      confidence: confidence
    }
  }

  /**
   * 计算几何体的长宽比得分
   * @param {THREE.Vector3[]} points - 点集
   * @returns {number} 长宽比得分 (0-1)
   */
  calculateAspectRatio(points) {
    const bbox = new THREE.Box3().setFromPoints(points)
    const size = bbox.max.clone().sub(bbox.min)
    
    // 对于圆柱，期望有一个轴明显长于其他两个轴
    const dimensions = [size.x, size.y, size.z].sort((a, b) => b - a)
    const [longest, middle, shortest] = dimensions
    
    if (longest < 0.001) return 0
    
    // 检查是否有明显的主轴
    const mainAxisRatio = longest / Math.max(middle, shortest)
    const crossSectionRatio = Math.abs(middle - shortest) / Math.max(middle, shortest)
    
    // 圆柱应该有一个长轴和两个相近的短轴
    const aspectScore = Math.min(1, (mainAxisRatio - 1) / 3) * (1 - crossSectionRatio)
    
    return Math.max(0, aspectScore)
  }

  /**
   * 计算几何体得分
   * @param {THREE.Vector3[]} points - 点集
   * @param {THREE.Vector3} center - 中心点
   * @param {THREE.Vector3} axis - 轴向
   * @param {number} radius - 半径
   * @returns {number} 几何体得分 (0-1)
   */
  calculateGeometryScore(points, center, axis, radius) {
    let validPoints = 0
    const tolerance = Math.max(0.2, radius * 0.1) // 宽松的容差
    
    for (const point of points) {
      const distance = this.distanceTocylinder(point, { center, axis, radius })
      if (distance < tolerance) {
        validPoints++
      }
    }
    
    return validPoints / points.length
  }

  /**
   * 计算协方差矩阵
   * @param {THREE.Vector3[]} points - 点集
   * @param {THREE.Vector3} centroid - 质心
   * @returns {Array} 3x3协方差矩阵
   */
  computeCovarianceMatrix(points, centroid) {
    const cov = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0]
    ]

    for (const point of points) {
      const diff = point.clone().sub(centroid)
      const coords = [diff.x, diff.y, diff.z]
      
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          cov[i][j] += coords[i] * coords[j]
        }
      }
    }

    // 归一化
    const n = points.length
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        cov[i][j] /= n
      }
    }

    return cov
  }

  /**
   * 计算特征向量（简化版本）
   * @param {Array} matrix - 3x3矩阵
   * @returns {Object|null} 特征向量信息
   */
  computeEigenVectors(matrix) {
    // 这里使用简化的方法，实际应用中可能需要更精确的特征值分解
    // 对于圆柱检测，我们主要关心主方向
    
    // 计算矩阵的迹和行列式来估计主方向
    const trace = matrix[0][0] + matrix[1][1] + matrix[2][2]
    
    // 找到最大的对角元素作为主方向的近似
    let maxIndex = 0
    let maxValue = matrix[0][0]
    
    for (let i = 1; i < 3; i++) {
      if (matrix[i][i] > maxValue) {
        maxValue = matrix[i][i]
        maxIndex = i
      }
    }

    const eigenVector = new THREE.Vector3()
    eigenVector.setComponent(maxIndex, 1)
    
    return {
      maxEigenVector: eigenVector,
      maxEigenValue: maxValue
    }
  }

  /**
   * 随机采样
   * @param {Array} array - 数组
   * @param {number} count - 采样数量
   * @returns {Array} 采样结果
   */
  randomSample(array, count) {
    const result = []
    const indices = new Set()
    
    while (result.length < count && indices.size < array.length) {
      const index = Math.floor(Math.random() * array.length)
      if (!indices.has(index)) {
        indices.add(index)
        result.push(array[index])
      }
    }
    
    return result
  }

  /**
   * 计算支持某个圆柱模型的点数
   * @param {THREE.Vector3[]} points - 所有点
   * @param {Object} cylinder - 圆柱参数
   * @param {number} threshold - 距离阈值
   * @returns {number} 支持点数
   */
  countInliers(points, cylinder, threshold) {
    let count = 0
    
    for (const point of points) {
      const distance = this.distanceTocylinder(point, cylinder)
      if (distance < threshold) {
        count++
      }
    }
    
    return count
  }

  /**
   * 估计轴向
   * @param {THREE.Vector3[]} points - 点集
   * @param {THREE.Vector3} center - 中心点
   * @returns {THREE.Vector3|null} 轴向量
   */
  estimateAxisFromPoints(points, center) {
    // 使用点到中心的向量的主方向作为轴向
    const vectors = []
    
    for (const point of points) {
      vectors.push(point.clone().sub(center))
    }

    // 计算主方向（简化版本）
    let maxVarianceAxis = new THREE.Vector3(0, 1, 0)
    let maxVariance = 0

    // 尝试三个主轴方向
    const axes = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 1)
    ]

    for (const axis of axes) {
      let variance = 0
      for (const vec of vectors) {
        const projection = vec.dot(axis)
        variance += projection * projection
      }
      
      if (variance > maxVariance) {
        maxVariance = variance
        maxVarianceAxis = axis.clone()
      }
    }

    return maxVarianceAxis
  }

  /**
   * 将点投影到直线上
   * @param {THREE.Vector3} point - 点
   * @param {THREE.Vector3} linePoint - 直线上的点
   * @param {THREE.Vector3} lineDirection - 直线方向
   * @returns {THREE.Vector3} 投影点
   */
  projectPointOntoLine(point, linePoint, lineDirection) {
    const toPoint = point.clone().sub(linePoint)
    const projection = toPoint.dot(lineDirection)
    return linePoint.clone().add(lineDirection.clone().multiplyScalar(projection))
  }

  /**
   * 估计圆柱高度
   * @param {THREE.Vector3[]} points - 点集
   * @param {THREE.Vector3} center - 圆柱中心
   * @param {THREE.Vector3} axis - 圆柱轴向
   * @returns {number} 高度
   */
  estimateHeight(points, center, axis) {
    let minHeight = Infinity
    let maxHeight = -Infinity
    
    for (const point of points) {
      const height = point.clone().sub(center).dot(axis)
      minHeight = Math.min(minHeight, height)
      maxHeight = Math.max(maxHeight, height)
    }
    
    return maxHeight - minHeight
  }



  /**
   * 验证圆柱面拟合质量
   * @param {THREE.Vector3[]} points - 原始点
   * @param {Object} cylinderInfo - 圆柱参数
   * @returns {boolean} 是否为有效圆柱
   */
  validateCylinder(points, cylinderInfo) {
    if (!cylinderInfo || cylinderInfo.confidence < 0.3) {
      console.log('❌ 圆柱验证失败: 置信度过低', cylinderInfo?.confidence || 'N/A')
      return false // 进一步降低置信度要求从0.6到0.3
    }

    if (cylinderInfo.radius < 0.05 || cylinderInfo.height < 0.05) {
      console.log('❌ 圆柱验证失败: 尺寸过小', {
        radius: cylinderInfo.radius,
        height: cylinderInfo.height
      })
      return false
    }

    // 对于低置信度的情况，进行更宽松的几何验证
    if (cylinderInfo.confidence < 0.5) {
      console.log('⚠️ 低置信度圆柱，使用宽松验证模式')
      return this.performLenientValidation(points, cylinderInfo)
    }

    // 标准几何验证
    const validationResults = this.performGeometricValidation(points, cylinderInfo)
    
    console.log('🔍 几何验证结果:', validationResults)
    
    return validationResults.isValid
  }

  /**
   * 执行宽松验证（用于低置信度圆柱）
   * @param {THREE.Vector3[]} points - 点集
   * @param {Object} cylinderInfo - 圆柱参数
   * @returns {boolean} 是否通过验证
   */
  performLenientValidation(points, cylinderInfo) {
    const { center, axis, radius } = cylinderInfo
    
    // 计算点到圆柱面的距离
    const distances = []
    for (const point of points) {
      const distance = this.distanceTocylinder(point, cylinderInfo)
      distances.push(distance)
    }

    // 非常宽松的容差
    const tolerance = Math.max(0.3, radius * 0.2)
    const validPoints = distances.filter(d => d < tolerance).length
    const validRatio = validPoints / points.length

    console.log('📊 宽松验证指标:', {
      tolerance: tolerance.toFixed(3),
      validPoints: validPoints,
      totalPoints: points.length,
      validRatio: validRatio.toFixed(3),
      threshold: 0.6
    })

    // 只要60%的点在容差内就认为是有效圆柱
    return validRatio > 0.6
  }

  /**
   * 执行几何验证
   * @param {THREE.Vector3[]} points - 点集
   * @param {Object} cylinderInfo - 圆柱参数
   * @returns {Object} 验证结果
   */
  performGeometricValidation(points, cylinderInfo) {
    const { center, axis, radius } = cylinderInfo
    
    // 1. 检查点到圆柱面的距离分布
    const distances = []
    for (const point of points) {
      const distance = this.distanceTocylinder(point, cylinderInfo)
      distances.push(distance)
    }

    // 计算距离统计
    const meanDistance = distances.reduce((a, b) => a + b, 0) / distances.length
    const variance = distances.reduce((sum, d) => sum + Math.pow(d - meanDistance, 2), 0) / distances.length
    const stdDev = Math.sqrt(variance)

    // 2. 检查有多少点在合理距离内
    const tolerance = Math.max(0.15, radius * 0.08) // 增加容差，特别是对小半径圆柱
    const validPoints = distances.filter(d => d < tolerance).length
    const validRatio = validPoints / points.length

    // 3. 检查点的分布是否符合圆柱特征
    const distributionScore = this.analyzePointDistribution(points, cylinderInfo)

    // 4. 检查轴向分布
    const axialDistribution = this.analyzeAxialDistribution(points, cylinderInfo)

    // 放宽验证条件，特别是对低分辨率圆柱
    const isValid = (
      validRatio > 0.7 &&           // 降低从80%到70%
      stdDev < radius * 0.15 &&     // 放宽标准差要求从10%到15%
      distributionScore > 0.6 &&    // 降低分布得分要求从0.7到0.6
      axialDistribution.coverage > 0.5  // 降低轴向覆盖度要求从0.6到0.5
    )

    console.log('📊 验证指标:', {
      validRatio: validRatio.toFixed(3),
      stdDev: stdDev.toFixed(3),
      stdDevRatio: (stdDev / radius).toFixed(3),
      distributionScore: distributionScore.toFixed(3),
      axialCoverage: axialDistribution.coverage.toFixed(3),
      tolerance: tolerance.toFixed(3),
      isValid: isValid
    })

    return {
      isValid,
      validRatio,
      meanDistance,
      stdDev,
      distributionScore,
      axialDistribution,
      tolerance
    }
  }

  /**
   * 分析点分布特征
   * @param {THREE.Vector3[]} points - 点集
   * @param {Object} cylinderInfo - 圆柱参数
   * @returns {number} 分布得分 (0-1)
   */
  analyzePointDistribution(points, cylinderInfo) {
    const { center, axis, radius } = cylinderInfo
    
    // 将点投影到垂直于轴的平面上，分析角度分布
    const angles = []
    const refDirection = this.getPerpendicularVector(axis)
    const tangentDirection = refDirection.clone().cross(axis).normalize()

    for (const point of points) {
      const toPoint = point.clone().sub(center)
      const axialComponent = toPoint.dot(axis)
      const radialVector = toPoint.clone().sub(axis.clone().multiplyScalar(axialComponent))
      
      if (radialVector.length() > 0.001) {
        const angle = Math.atan2(
          radialVector.dot(tangentDirection),
          radialVector.dot(refDirection)
        )
        angles.push(angle)
      }
    }

    if (angles.length < 3) return 0

    // 检查角度分布的均匀性
    angles.sort((a, b) => a - b)
    
    // 计算相邻角度的间隔
    const intervals = []
    for (let i = 1; i < angles.length; i++) {
      intervals.push(angles[i] - angles[i-1])
    }
    
    // 添加首尾间隔
    intervals.push(2 * Math.PI - (angles[angles.length - 1] - angles[0]))

    // 计算间隔的方差，方差越小说明分布越均匀
    const meanInterval = 2 * Math.PI / angles.length
    const intervalVariance = intervals.reduce((sum, interval) => {
      return sum + Math.pow(interval - meanInterval, 2)
    }, 0) / intervals.length

    // 转换为得分（方差越小得分越高）
    const maxVariance = Math.pow(Math.PI, 2) // 最大可能方差
    const score = Math.max(0, 1 - intervalVariance / maxVariance)

    return score
  }

  /**
   * 分析轴向分布
   * @param {THREE.Vector3[]} points - 点集
   * @param {Object} cylinderInfo - 圆柱参数
   * @returns {Object} 轴向分布信息
   */
  analyzeAxialDistribution(points, cylinderInfo) {
    const { center, axis, height } = cylinderInfo
    
    // 计算每个点在轴向的位置
    const axialPositions = []
    for (const point of points) {
      const axialPos = point.clone().sub(center).dot(axis)
      axialPositions.push(axialPos)
    }

    axialPositions.sort((a, b) => a - b)
    
    const minPos = axialPositions[0]
    const maxPos = axialPositions[axialPositions.length - 1]
    const actualHeight = maxPos - minPos
    
    // 计算覆盖度
    const coverage = Math.min(1, actualHeight / height)
    
    // 检查分布密度的均匀性
    const segments = 10
    const segmentHeight = actualHeight / segments
    const segmentCounts = new Array(segments).fill(0)
    
    for (const pos of axialPositions) {
      const segmentIndex = Math.floor((pos - minPos) / segmentHeight)
      const clampedIndex = Math.max(0, Math.min(segments - 1, segmentIndex))
      segmentCounts[clampedIndex]++
    }
    
    // 计算分布均匀性
    const expectedCount = axialPositions.length / segments
    const uniformity = 1 - segmentCounts.reduce((sum, count) => {
      return sum + Math.abs(count - expectedCount)
    }, 0) / (2 * axialPositions.length)

    return {
      coverage,
      uniformity,
      actualHeight,
      expectedHeight: height
    }
  }

  /**
   * 计算点到圆柱面的距离
   * @param {THREE.Vector3} point - 点
   * @param {Object} cylinderInfo - 圆柱参数
   * @returns {number} 距离
   */
  distanceTocylinder(point, cylinderInfo) {
    const { center, axis, radius } = cylinderInfo
    
    // 计算点到圆柱轴的距离
    const toPoint = point.clone().sub(center)
    const axialComponent = toPoint.dot(axis)
    const radialVector = toPoint.clone().sub(axis.clone().multiplyScalar(axialComponent))
    const radialDistance = radialVector.length()
    
    return Math.abs(radialDistance - radius)
  }

  /**
   * 将3D点转换为圆柱面参数坐标
   * @param {THREE.Vector3} point - 3D点
   * @param {Object} cylinderInfo - 圆柱参数
   * @returns {Object} 参数坐标 {theta, height, radius}
   */
  worldToCylinderCoords(point, cylinderInfo) {
    const { center, axis } = cylinderInfo
    
    // 计算相对于圆柱中心的向量
    const toPoint = point.clone().sub(center)
    
    // 计算高度（沿轴方向的投影）
    const height = toPoint.dot(axis)
    
    // 计算径向向量
    const radialVector = toPoint.clone().sub(axis.clone().multiplyScalar(height))
    const radius = radialVector.length()
    
    // 计算角度
    let theta = 0
    if (radius > 0.001) {
      // 选择参考方向（垂直于轴的任意方向）
      const refDirection = this.getPerpendicularVector(axis)
      theta = Math.atan2(
        radialVector.dot(refDirection.clone().cross(axis)),
        radialVector.dot(refDirection)
      )
    }
    
    return { theta, height, radius }
  }

  /**
   * 将圆柱面参数坐标转换为3D点
   * @param {number} theta - 角度
   * @param {number} height - 高度
   * @param {Object} cylinderInfo - 圆柱参数
   * @returns {THREE.Vector3} 3D点
   */
  cylinderToWorldCoords(theta, height, cylinderInfo) {
    const { center, axis, radius } = cylinderInfo
    
    // 获取参考方向
    const refDirection = this.getPerpendicularVector(axis)
    const tangentDirection = refDirection.clone().cross(axis).normalize()
    
    // 计算径向位置
    const radialDirection = refDirection.clone()
      .multiplyScalar(Math.cos(theta))
      .add(tangentDirection.clone().multiplyScalar(Math.sin(theta)))
    
    // 计算最终位置
    const position = center.clone()
      .add(axis.clone().multiplyScalar(height))
      .add(radialDirection.multiplyScalar(radius))
    
    return position
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
   * 计算圆柱面上指定点的法向量
   * @param {THREE.Vector3} point - 表面点
   * @param {Object} cylinderInfo - 圆柱参数
   * @returns {THREE.Vector3} 法向量
   */
  getCylinderNormal(point, cylinderInfo) {
    const { center, axis } = cylinderInfo
    
    // 计算径向向量
    const toPoint = point.clone().sub(center)
    const axialComponent = toPoint.dot(axis)
    const radialVector = toPoint.clone().sub(axis.clone().multiplyScalar(axialComponent))
    
    // 法向量就是归一化的径向向量
    return radialVector.normalize()
  }

  /**
   * 在圆柱面上生成文字路径
   * @param {string} text - 文字内容
   * @param {THREE.Vector3} startPoint - 起始点
   * @param {Object} cylinderInfo - 圆柱参数
   * @param {Object} options - 选项
   * @returns {Array} 文字路径点数组
   */
  generateTextPath(text, startPoint, cylinderInfo, options: Record<string, any> = {}) {
    const {
      fontSize = 1,
      letterSpacing = 0.1,
      direction = 1 // 1为顺时针，-1为逆时针
    } = options

    // 转换起始点到圆柱坐标
    const startCoords = this.worldToCylinderCoords(startPoint, cylinderInfo)
    
    const pathPoints = []
    const letterWidth = fontSize * 0.6 // 估算字符宽度
    
    for (let i = 0; i < text.length; i++) {
      // 计算当前字符的角度偏移
      const angleOffset = direction * (i * (letterWidth + letterSpacing)) / cylinderInfo.radius
      const currentTheta = startCoords.theta + angleOffset
      
      // 转换回世界坐标
      const worldPos = this.cylinderToWorldCoords(
        currentTheta, 
        startCoords.height, 
        cylinderInfo
      )
      
      pathPoints.push({
        position: worldPos,
        theta: currentTheta,
        height: startCoords.height,
        char: text[i],
        index: i
      })
    }
    
    return pathPoints
  }
}

// 导出单例
export const cylinderSurfaceHelper = new CylinderSurfaceHelper()
