/**
 * 布尔操作器
 * 使用 three-bvh-csg 库处理文字几何体与表面的布尔运算
 */
import * as THREE from 'three'
import { ADDITION, Brush, Evaluator, INTERSECTION, SUBTRACTION } from 'three-bvh-csg'
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh'

// 启用加速光线投射
;(THREE.Mesh.prototype as any).raycast = acceleratedRaycast

export class BooleanOperator {
  evaluator: Evaluator | null
  isLibraryLoaded: boolean
  _initPromise: Promise<void> | null

  constructor() {
    this.evaluator = null
    this.isLibraryLoaded = false
    this._initPromise = null

    // 初始化
    this._init()
  }

  /**
   * 初始化CSG评估器
   */
  _init () {
    try {
      this.evaluator = new Evaluator()
      // 启用材质组，保留来源信息
      this.evaluator.useGroups = true
      this.isLibraryLoaded = true
      console.log('three-bvh-csg 布尔操作库已加载，useGroups 已启用')
    } catch (error) {
      console.error('three-bvh-csg 初始化失败:', error)
      this.isLibraryLoaded = false
    }
  }

  /**
   * 检查库是否已加载
   * @returns {boolean} 是否已加载
   */
  isReady () {
    return this.isLibraryLoaded && this.evaluator !== null
  }

  /**
   * 创建 Brush 对象
   * @param {THREE.BufferGeometry} geometry - 几何体
   * @param {THREE.Material} [material] - 可选的材质（用于标识来源）
   * @param {THREE.Matrix4} [matrix] - 可选的变换矩阵
   * @returns {Brush} Brush 对象
   */
  createBrush (geometry, material = null, matrix = null) {
    // 确保几何体有索引
    let processedGeometry = geometry
    if (!geometry.index) {
      processedGeometry = geometry.clone()
      processedGeometry.setIndex([...Array(processedGeometry.attributes.position.count).keys()])
    }

    const brush = new Brush(processedGeometry, material)

    if (matrix) {
      brush.applyMatrix4(matrix)
    }

    brush.updateMatrixWorld()
    return brush
  }

  /**
   * 执行布尔减法操作（内嵌/雕刻模式）
   * 返回的几何体会包含材质组信息，可以区分原始表面和雕刻区域
   * @param {THREE.BufferGeometry} targetGeometry - 目标几何体（被减的）
   * @param {THREE.BufferGeometry} toolGeometry - 工具几何体（用来减的）
   * @param {THREE.Matrix4} [toolMatrix] - 工具几何体的变换矩阵
   * @param {Object} [options] - 选项
   * @param {string} [options.textId] - 文字ID，用于标识
   * @returns {Promise<{geometry: THREE.BufferGeometry, materials: THREE.Material[]}>} 操作结果
   */
  async subtract (targetGeometry, toolGeometry, toolMatrix = null, options: Record<string, any> = {}) {
    if (!this.isReady()) {
      throw new Error('布尔操作库未准备就绪')
    }

    // 🔧 添加详细的几何体信息日志
    console.log('[DEBUG] 布尔减法操作 - 输入几何体信息:')

    targetGeometry.computeBoundingBox()
    toolGeometry.computeBoundingBox()

    const targetBox = targetGeometry.boundingBox
    const toolBox = toolGeometry.boundingBox.clone()
    if (toolMatrix) {
      toolBox.applyMatrix4(toolMatrix)
    }

    console.log('[DEBUG] 目标几何体边界框:', {
      min: `(${targetBox.min.x.toFixed(2)}, ${targetBox.min.y.toFixed(2)}, ${targetBox.min.z.toFixed(2)})`,
      max: `(${targetBox.max.x.toFixed(2)}, ${targetBox.max.y.toFixed(2)}, ${targetBox.max.z.toFixed(2)})`,
      vertexCount: targetGeometry.attributes.position?.count || 0
    })

    console.log('[DEBUG] 工具几何体边界框:', {
      min: `(${toolBox.min.x.toFixed(2)}, ${toolBox.min.y.toFixed(2)}, ${toolBox.min.z.toFixed(2)})`,
      max: `(${toolBox.max.x.toFixed(2)}, ${toolBox.max.y.toFixed(2)}, ${toolBox.max.z.toFixed(2)})`,
      vertexCount: toolGeometry.attributes.position?.count || 0
    })

    // 预检查几何体相交性（使用综合检测）
    const intersectionCheck = this.checkIntersectionComprehensive(targetGeometry, toolGeometry, toolMatrix, {
      useBVH: true,
      fastOnly: false
    })

    console.log('[DEBUG] 相交检测结果:', {
      finalResult: intersectionCheck.finalResult,
      confidence: intersectionCheck.confidence,
      method: intersectionCheck.method || 'unknown',
      boundingBoxIntersects: intersectionCheck.boundingBoxCheck?.intersects,
      bvhIntersects: intersectionCheck.bvhCheck?.intersects
    })

    if (!intersectionCheck.finalResult) {
      const method = intersectionCheck.bvhCheck ? 'BVH' : '边界盒'
      console.warn(`⚠️ 几何体不相交 (${method}检测):`, intersectionCheck.boundingBoxCheck?.reason || intersectionCheck.bvhCheck?.reason)

      // 🔧 即使检测到不相交，仍然尝试执行布尔操作
      // 因为检测可能有误差，特别是对于复杂的弯曲几何体
      console.log('[DEBUG] 尽管检测到不相交，仍将尝试执行布尔操作...')

      if (options.strictMode) {
        throw new Error(`几何体不相交: ${intersectionCheck.boundingBoxCheck?.reason || intersectionCheck.bvhCheck?.reason}`)
      }
    } else if (intersectionCheck.confidence === 'high') {
      console.log(`✅ 几何体相交确认 (${intersectionCheck.bvhCheck ? 'BVH' : '边界盒'}检测)`)
    }

    try {
      console.log('开始执行布尔减法操作 (SUBTRACTION)')
      const startTime = performance.now()

      // 🔧 调试：打印输入几何体的详细信息
      console.log('[DEBUG] 目标几何体详情:', {
        vertexCount: targetGeometry.attributes.position?.count,
        hasIndex: !!targetGeometry.index,
        indexCount: targetGeometry.index?.count
      })
      console.log('[DEBUG] 工具几何体详情:', {
        vertexCount: toolGeometry.attributes.position?.count,
        hasIndex: !!toolGeometry.index,
        indexCount: toolGeometry.index?.count
      })

      // 创建材质用于标识来源
      // 材质0: 原始表面
      // 材质1: 雕刻区域（来自文字几何体的切割面）
      const targetMaterial = new THREE.MeshStandardMaterial({
        color: 0x409eff,
        name: 'original_surface'
      })
      const toolMaterial = new THREE.MeshStandardMaterial({
        color: 0xff0000,
        name: options.textId ? `engraved_${options.textId}` : 'engraved_text'
      })
      // 存储 textId 到材质的 userData
      toolMaterial.userData = { textId: options.textId, isEngravedText: true }

      // 创建 Brush 对象，带材质
      const targetBrush = this.createBrush(targetGeometry, targetMaterial)
      const toolBrush = this.createBrush(toolGeometry, toolMaterial, toolMatrix)

      console.log('[DEBUG] Brush 创建完成:', {
        targetBrushValid: !!targetBrush,
        toolBrushValid: !!toolBrush
      })

      // 执行布尔减法
      const resultBrush = this.evaluator.evaluate(targetBrush, toolBrush, SUBTRACTION)

      console.log('[DEBUG] 布尔操作执行完成，resultBrush:', {
        valid: !!resultBrush,
        hasGeometry: !!(resultBrush && resultBrush.geometry)
      })

      // 获取结果几何体
      const resultGeometry = resultBrush.geometry
      resultGeometry.computeVertexNormals()
      resultGeometry.computeBoundingBox()
      resultGeometry.computeBoundingSphere()

      const endTime = performance.now()
      console.log(`布尔减法操作完成，耗时: ${(endTime - startTime).toFixed(2)}ms`)
      console.log(`结果几何体有 ${resultGeometry.groups?.length || 0} 个材质组`)

      // 🔧 调试：打印结果几何体的详细信息
      console.log('[DEBUG] 结果几何体详情:', {
        vertexCount: resultGeometry.attributes.position?.count,
        hasIndex: !!resultGeometry.index,
        indexCount: resultGeometry.index?.count,
        groupsCount: resultGeometry.groups?.length || 0,
        groups: resultGeometry.groups
      })

      // 清理临时对象
      targetBrush.geometry.dispose()
      toolBrush.geometry.dispose()

      return {
        geometry: resultGeometry,
        materials: [targetMaterial, toolMaterial]
      }

    } catch (error) {
      console.error('布尔减法操作失败:', error)
      throw error
    }
  }

  /**
   * 执行布尔加法操作（合并/联合）
   * @param {THREE.BufferGeometry} geometry1 - 几何体1
   * @param {THREE.BufferGeometry} geometry2 - 几何体2
   * @param {THREE.Matrix4} [matrix2] - 几何体2的变换矩阵
   * @param {Object} [options] - 选项
   * @returns {Promise<THREE.BufferGeometry>} 操作结果几何体
   */
  async union (geometry1, geometry2, matrix2 = null, options: Record<string, any> = {}) {
    if (!this.isReady()) {
      throw new Error('布尔操作库未准备就绪')
    }

    // 预检查几何体相交性（联合操作对不相交的几何体也有意义）
    const intersectionCheck = this.checkIntersectionComprehensive(geometry1, geometry2, matrix2, {
      useBVH: true,
      fastOnly: false
    })

    if (!intersectionCheck.finalResult) {
      const method = intersectionCheck.bvhCheck ? 'BVH' : '边界盒'
      console.info(`几何体不相交 (${method}检测)，将执行简单合并:`, intersectionCheck.boundingBoxCheck?.reason || intersectionCheck.bvhCheck?.reason)
    } else {
      console.log(`几何体相交确认 (${intersectionCheck.bvhCheck ? 'BVH' : '边界盒'}检测)，将执行真正的联合操作`)
    }

    try {
      console.log('开始执行布尔加法操作 (ADDITION)')
      const startTime = performance.now()

      // 创建 Brush 对象
      const brush1 = this.createBrush(geometry1)
      const brush2 = this.createBrush(geometry2, matrix2)

      // 执行布尔加法
      const resultBrush = this.evaluator.evaluate(brush1, brush2, ADDITION)

      // 获取结果几何体
      const resultGeometry = resultBrush.geometry
      resultGeometry.computeVertexNormals()
      resultGeometry.computeBoundingBox()
      resultGeometry.computeBoundingSphere()

      const endTime = performance.now()
      console.log(`布尔加法操作完成，耗时: ${(endTime - startTime).toFixed(2)}ms`)

      // 清理临时对象
      brush1.geometry.dispose()
      brush2.geometry.dispose()

      return resultGeometry

    } catch (error) {
      console.error('布尔加法操作失败:', error)
      throw error
    }
  }

  /**
   * 执行布尔交集操作
   * @param {THREE.BufferGeometry} geometry1 - 几何体1
   * @param {THREE.BufferGeometry} geometry2 - 几何体2
   * @param {THREE.Matrix4} [matrix2] - 几何体2的变换矩阵
   * @param {Object} [options] - 选项
   * @returns {Promise<THREE.BufferGeometry>} 操作结果几何体
   */
  async intersect (geometry1, geometry2, matrix2 = null, options: Record<string, any> = {}) {
    if (!this.isReady()) {
      throw new Error('布尔操作库未准备就绪')
    }

    // 预检查几何体相交性
    const intersectionCheck = this.checkIntersectionComprehensive(geometry1, geometry2, matrix2, {
      useBVH: true,
      fastOnly: false
    })

    if (!intersectionCheck.finalResult) {
      const method = intersectionCheck.bvhCheck ? 'BVH' : '边界盒'
      console.warn(`几何体不相交 (${method}检测)，交集操作将返回空结果:`, intersectionCheck.boundingBoxCheck?.reason || intersectionCheck.bvhCheck?.reason)
      if (options.strictMode) {
        throw new Error(`几何体不相交，无法计算交集: ${intersectionCheck.boundingBoxCheck?.reason || intersectionCheck.bvhCheck?.reason}`)
      }
    } else {
      console.log(`几何体相交确认 (${intersectionCheck.bvhCheck ? 'BVH' : '边界盒'}检测)`)
    }

    try {
      console.log('开始执行布尔交集操作 (INTERSECTION)')
      const startTime = performance.now()

      // 创建 Brush 对象
      const brush1 = this.createBrush(geometry1)
      const brush2 = this.createBrush(geometry2, matrix2)

      // 执行布尔交集
      const resultBrush = this.evaluator.evaluate(brush1, brush2, INTERSECTION)

      // 获取结果几何体
      const resultGeometry = resultBrush.geometry
      resultGeometry.computeVertexNormals()
      resultGeometry.computeBoundingBox()
      resultGeometry.computeBoundingSphere()

      const endTime = performance.now()
      console.log(`布尔交集操作完成，耗时: ${(endTime - startTime).toFixed(2)}ms`)

      // 清理临时对象
      brush1.geometry.dispose()
      brush2.geometry.dispose()

      return resultGeometry

    } catch (error) {
      console.error('布尔交集操作失败:', error)
      throw error
    }
  }

  /**
   * 批量执行布尔操作（性能优化）
   * @param {THREE.BufferGeometry} baseGeometry - 基础几何体
   * @param {Array<{geometry: THREE.BufferGeometry, matrix?: THREE.Matrix4, operation: string}>} operations - 操作列表
   * @returns {Promise<THREE.BufferGeometry>} 最终结果几何体
   */
  async batchOperation (baseGeometry, operations) {
    if (!this.isReady()) {
      throw new Error('布尔操作库未准备就绪')
    }

    if (!operations || operations.length === 0) {
      return baseGeometry.clone()
    }

    try {
      console.log(`开始批量布尔操作，共 ${operations.length} 个操作`)
      const startTime = performance.now()

      let currentBrush = this.createBrush(baseGeometry)

      for (let i = 0; i < operations.length; i++) {
        const op = operations[i]
        const toolBrush = this.createBrush(op.geometry, op.matrix)

        let operationType
        switch (op.operation) {
          case 'subtract':
            operationType = SUBTRACTION
            break
          case 'union':
            operationType = ADDITION
            break
          case 'intersect':
            operationType = INTERSECTION
            break
          default:
            console.warn(`未知操作类型: ${op.operation}，跳过`)
            toolBrush.geometry.dispose()
            continue
        }

        const resultBrush = this.evaluator.evaluate(currentBrush, toolBrush, operationType)

        // 清理上一个 brush
        currentBrush.geometry.dispose()
        toolBrush.geometry.dispose()

        currentBrush = resultBrush
      }

      // 获取最终结果
      const resultGeometry = currentBrush.geometry
      resultGeometry.computeVertexNormals()
      resultGeometry.computeBoundingBox()
      resultGeometry.computeBoundingSphere()

      const endTime = performance.now()
      console.log(`批量布尔操作完成，耗时: ${(endTime - startTime).toFixed(2)}ms`)

      return resultGeometry

    } catch (error) {
      console.error('批量布尔操作失败:', error)
      throw error
    }
  }

  /**
   * 检查两个几何体是否相交（边界盒快速检测）
   * @param {THREE.BufferGeometry} geometry1 - 几何体1
   * @param {THREE.BufferGeometry} geometry2 - 几何体2
   * @param {THREE.Matrix4} [matrix2] - 几何体2的变换矩阵
   * @returns {Object} 相交检查结果
   */
  checkGeometryIntersection (geometry1, geometry2, matrix2 = null) {
    try {
      // 计算边界盒
      geometry1.computeBoundingBox()
      geometry2.computeBoundingBox()

      const box1 = geometry1.boundingBox.clone()
      const box2 = geometry2.boundingBox.clone()

      // 应用变换矩阵到第二个边界盒
      if (matrix2) {
        box2.applyMatrix4(matrix2)
      }

      // 检查边界盒是否相交
      const intersects = box1.intersectsBox(box2)

      if (!intersects) {
        // 计算距离
        const center1 = new THREE.Vector3()
        const center2 = new THREE.Vector3()
        box1.getCenter(center1)
        box2.getCenter(center2)
        const distance = center1.distanceTo(center2)

        return {
          intersects: false,
          reason: `边界盒不相交，距离: ${distance.toFixed(2)}`,
          distance,
          box1,
          box2,
          method: 'boundingBox'
        }
      }

      // 检查是否一个完全包含另一个
      const contains1 = box1.containsBox(box2)
      const contains2 = box2.containsBox(box1)

      return {
        intersects: true,
        reason: 'bounding boxes intersect',
        distance: 0,
        contains1,
        contains2,
        box1,
        box2,
        method: 'boundingBox'
      }

    } catch (error) {
      console.warn('几何体相交检查失败:', error)
      return {
        intersects: true, // 默认假设相交，避免阻止操作
        reason: 'intersection check failed',
        error: error.message,
        method: 'boundingBox'
      }
    }
  }

  /**
   * 使用 BVH 树进行精确的几何体相交检测
   * @param {THREE.Mesh} meshA - 网格A
   * @param {THREE.Mesh} meshB - 网格B
   * @returns {Object} 精确相交检查结果
   */
  checkMeshIntersectionBVH (meshA, meshB) {
    try {
      // 确保几何体有 BVH 树
      if (!meshA.geometry.boundsTree) {
        meshA.geometry.computeBoundsTree = meshA.geometry.computeBoundsTree || (() => {
          meshA.geometry.boundsTree = new MeshBVH(meshA.geometry)
        })
        meshA.geometry.computeBoundsTree()
      }

      if (!meshB.geometry.boundsTree) {
        meshB.geometry.computeBoundsTree = meshB.geometry.computeBoundsTree || (() => {
          meshB.geometry.boundsTree = new MeshBVH(meshB.geometry)
        })
        meshB.geometry.computeBoundsTree()
      }

      // 使用 BVH 树检测相交
      const intersects = meshA.geometry.boundsTree.intersectsGeometry(
        meshB.geometry,
        meshA.matrixWorld,
        meshB.matrixWorld
      )

      return {
        intersects,
        reason: intersects ? 'BVH trees intersect' : 'BVH trees do not intersect',
        method: 'BVH',
        precision: 'high'
      }

    } catch (error) {
      console.warn('BVH 相交检测失败:', error)
      return {
        intersects: true, // 默认假设相交
        reason: 'BVH intersection check failed',
        error: error.message,
        method: 'BVH',
        fallback: true
      }
    }
  }

  /**
   * 从几何体创建临时网格用于 BVH 检测
   * @param {THREE.BufferGeometry} geometry - 几何体
   * @param {THREE.Matrix4} [matrix] - 变换矩阵
   * @returns {THREE.Mesh} 临时网格
   */
  createTempMesh (geometry, matrix = null) {
    const material = new THREE.MeshBasicMaterial()
    const mesh = new THREE.Mesh(geometry, material)

    if (matrix) {
      mesh.applyMatrix4(matrix)
    }

    mesh.updateMatrixWorld()
    return mesh
  }

  /**
   * 综合相交检测（先快速边界盒检测，再精确 BVH 检测）
   * @param {THREE.BufferGeometry} geometry1 - 几何体1
   * @param {THREE.BufferGeometry} geometry2 - 几何体2
   * @param {THREE.Matrix4} [matrix2] - 几何体2的变换矩阵
   * @param {Object} [options] - 检测选项
   * @returns {Object} 综合相交检查结果
   */
  checkIntersectionComprehensive (geometry1, geometry2, matrix2 = null, options: Record<string, any> = {}) {
    const { useBVH = true, fastOnly = false } = options

    // 第一步：快速边界盒检测
    const boundingBoxCheck = this.checkGeometryIntersection(geometry1, geometry2, matrix2)

    if (!boundingBoxCheck.intersects) {
      // 边界盒都不相交，肯定不相交
      return {
        ...boundingBoxCheck,
        bvhCheck: null,
        finalResult: false,
        confidence: 'high'
      }
    }

    // 如果只需要快速检测，返回边界盒结果
    if (fastOnly || !useBVH) {
      return {
        ...boundingBoxCheck,
        bvhCheck: null,
        finalResult: true,
        confidence: 'medium'
      }
    }

    // 第二步：精确 BVH 检测
    try {
      const mesh1 = this.createTempMesh(geometry1)
      const mesh2 = this.createTempMesh(geometry2, matrix2)

      const bvhCheck = this.checkMeshIntersectionBVH(mesh1, mesh2)

      // 清理临时网格
      mesh1.geometry = null // 避免清理原始几何体
      mesh2.geometry = null
      mesh1.material.dispose()
      mesh2.material.dispose()

      return {
        boundingBoxCheck,
        bvhCheck,
        finalResult: bvhCheck.intersects,
        confidence: bvhCheck.fallback ? 'medium' : 'high',
        method: 'comprehensive'
      }

    } catch (error) {
      console.warn('BVH 检测失败，回退到边界盒结果:', error)
      return {
        ...boundingBoxCheck,
        bvhCheck: { error: error.message },
        finalResult: boundingBoxCheck.intersects,
        confidence: 'medium',
        fallback: true
      }
    }
  }

  /**
   * 验证几何体是否适合布尔操作
   * @param {THREE.BufferGeometry} geometry - 几何体
   * @returns {Object} 验证结果
   */
  validateGeometry (geometry) {
    const errors = []
    const warnings = []

    if (!geometry) {
      errors.push('几何体不能为空')
      return { isValid: false, errors, warnings }
    }

    if (!geometry.isBufferGeometry) {
      errors.push('只支持 BufferGeometry')
    }

    const positionAttribute = geometry.getAttribute('position')
    if (!positionAttribute) {
      errors.push('几何体缺少位置属性')
    } else if (positionAttribute.count < 3) {
      errors.push('几何体顶点数量不足')
    }

    const indexAttribute = geometry.getIndex()
    if (!indexAttribute) {
      warnings.push('几何体没有索引，将自动生成')
    }

    // 检查几何体复杂度
    const vertexCount = positionAttribute ? positionAttribute.count : 0
    const faceCount = indexAttribute ? indexAttribute.count / 3 : vertexCount / 3

    if (faceCount > 50000) {
      warnings.push('几何体非常复杂（>50000面），布尔操作可能较慢')
    } else if (faceCount > 10000) {
      warnings.push('几何体较复杂（>10000面），布尔操作可能需要一些时间')
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      faceCount,
      vertexCount
    }
  }

  /**
   * 优化几何体以提高布尔操作性能
   * @param {THREE.BufferGeometry} geometry - 几何体
   * @returns {THREE.BufferGeometry} 优化后的几何体
   */
  optimizeGeometry (geometry) {
    if (!geometry) return geometry

    const optimized = geometry.clone()

    // 确保有索引
    if (!optimized.index) {
      const indices = [...Array(optimized.attributes.position.count).keys()]
      optimized.setIndex(indices)
    }

    // 合并顶点（如果方法存在）
    if (typeof optimized.mergeVertices === 'function') {
      optimized.mergeVertices()
    }

    // 计算法向量
    optimized.computeVertexNormals()

    // 计算边界
    optimized.computeBoundingBox()
    optimized.computeBoundingSphere()

    console.log('几何体已优化，用于布尔操作')
    return optimized
  }

  /**
   * 获取操作统计信息
   * @returns {Object} 统计信息
   */
  getStats () {
    return {
      libraryLoaded: this.isLibraryLoaded,
      libraryName: 'three-bvh-csg',
      libraryVersion: '0.0.17',
      supportedOperations: ['subtract', 'union', 'intersect'],
      isSimulated: false
    }
  }

  /**
   * 设置评估器选项
   * @param {Object} options - 选项
   */
  setOptions (options: Record<string, any> = {}) {
    if (!this.evaluator) return

    // three-bvh-csg Evaluator 的可配置选项
    if (options.useGroups !== undefined) {
      this.evaluator.useGroups = options.useGroups
    }

    console.log('布尔操作参数已更新:', options)
  }

  /**
   * 销毁操作器，清理资源
   */
  destroy () {
    this.evaluator = null
    this.isLibraryLoaded = false
    console.log('布尔操作器已销毁')
  }
}
