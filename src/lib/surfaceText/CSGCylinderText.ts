/**
 * CSG 圆柱面文字生成器
 * 
 * 核心思路：使用 CSG 布尔操作生成完美贴合圆柱面的文字
 * 
 * 步骤：
 * 1. 生成较厚的 TextGeometry（height=30），作为"切割工具"
 * 2. 将文字对齐到圆柱面位置，用圆柱体去"减"文字，得到贴合圆柱面的文字轮廓
 * 3. 将切出的 geometry 向圆柱面方向移动 thickness 距离
 * 4. 与圆柱面求交，得到最终贴合的文字
 * 
 * 优点：
 * - 文字边缘完美贴合圆柱曲面
 * - 不需要手动计算弯曲变形
 * - 边缘更加精确
 */
import * as THREE from 'three'
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js'
import { Brush, Evaluator, SUBTRACTION, INTERSECTION } from 'three-bvh-csg'

export class CSGCylinderText {
  evaluator: Evaluator
  defaultConfig: Record<string, unknown>

  constructor() {
    this.evaluator = new Evaluator()
    this.evaluator.useGroups = false // 不需要材质组
    
    this.defaultConfig = {
      textHeight: 30,        // 文字几何体的厚度（用于切割）
      thickness: 0.5,        // 最终文字的厚度（凸出高度）
      size: 1,               // 文字大小
      curveSegments: 12,     // 曲线分段数
      cylinderSegments: 64,  // 圆柱体分段数（越高越精确）
      bevelEnabled: false
    }
  }

  /**
   * 生成圆柱面上的文字几何体
   * @param {string} text - 文字内容
   * @param {THREE.Font} font - 字体
   * @param {Object} cylinderInfo - 圆柱信息 { center, axis, radius, height }
   * @param {THREE.Vector3} attachPoint - 文字附着点（世界坐标）
   * @param {Object} config - 配置参数
   * @returns {THREE.BufferGeometry} 贴合圆柱面的文字几何体
   */
  generate(text, font, cylinderInfo, attachPoint, config: Record<string, any> = {}) {
    const finalConfig = { ...this.defaultConfig, ...config }
    const { center, axis, radius, height: cylinderHeight } = cylinderInfo

    console.log('🔧 CSGCylinderText.generate 开始:', {
      text,
      radius,
      center: `(${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)})`,
      axis: `(${axis.x.toFixed(2)}, ${axis.y.toFixed(2)}, ${axis.z.toFixed(2)})`,
      attachPoint: `(${attachPoint.x.toFixed(2)}, ${attachPoint.y.toFixed(2)}, ${attachPoint.z.toFixed(2)})`,
      config: finalConfig
    })

    const startTime = performance.now()

    try {
      // Step 1: 生成较厚的 TextGeometry
      const textGeometry = this.createThickTextGeometry(text, font, finalConfig)
      
      // Step 2: 计算文字的变换矩阵，使其对齐到圆柱面
      const textMatrix = this.calculateTextTransform(attachPoint, cylinderInfo, textGeometry)
      
      // Step 3: 创建用于切割的圆柱体
      const cylinderGeometry = this.createCuttingCylinder(cylinderInfo, finalConfig)
      
      // Step 4: 用圆柱体减去文字，得到贴合圆柱面的文字轮廓
      const subtractedGeometry = this.subtractTextFromCylinder(
        cylinderGeometry, 
        textGeometry, 
        textMatrix
      )
      
      // Step 5: 创建内层圆柱（半径 = radius - thickness）
      const innerCylinderGeometry = this.createInnerCylinder(cylinderInfo, finalConfig)
      
      // Step 6: 从减法结果中减去内层圆柱，得到最终的文字壳
      const finalGeometry = this.extractTextShell(
        subtractedGeometry, 
        innerCylinderGeometry,
        cylinderInfo,
        finalConfig
      )

      // 清理临时几何体
      textGeometry.dispose()
      cylinderGeometry.dispose()
      subtractedGeometry.dispose()
      innerCylinderGeometry.dispose()

      const endTime = performance.now()
      console.log(`✅ CSG 圆柱面文字生成完成，耗时: ${(endTime - startTime).toFixed(2)}ms`)

      // 添加元数据
      finalGeometry.userData = {
        isManifold: true,
        generatorType: 'CSGCylinderText',
        cylinderInfo: {
          radius,
          center: center.clone(),
          axis: axis.clone()
        }
      }

      return finalGeometry

    } catch (error) {
      console.error('❌ CSG 圆柱面文字生成失败:', error)
      throw error
    }
  }

  /**
   * 创建较厚的文字几何体（用于切割）
   * 
   * 关键：文字需要从圆柱外部穿透到内部
   * 文字的 Z 范围应该是 [-textHeight/2, +textHeight/2]
   * 这样当文字中心放在圆柱表面时，文字会同时向内和向外延伸
   */
  createThickTextGeometry(text, font, config) {
    const geometry = new TextGeometry(text, {
      font: font,
      size: config.size,
      depth: config.textHeight, // 很厚，用于穿透圆柱
      curveSegments: config.curveSegments,
      bevelEnabled: config.bevelEnabled
    })

    // 计算边界框
    geometry.computeBoundingBox()
    const bbox = geometry.boundingBox
    const width = bbox.max.x - bbox.min.x
    const height = bbox.max.y - bbox.min.y
    const depth = bbox.max.z - bbox.min.z
    
    // 居中文字（X、Y、Z 方向都居中）
    // 这样文字的中心在原点，Z 方向从 -depth/2 到 +depth/2
    const centerX = -0.5 * width - bbox.min.x
    const centerY = -0.5 * height - bbox.min.y
    const centerZ = -0.5 * depth - bbox.min.z
    
    geometry.translate(centerX, centerY, centerZ)
    geometry.computeBoundingBox()

    console.log('📝 厚文字几何体创建完成:', {
      width: width.toFixed(2),
      height: height.toFixed(2),
      depth: depth.toFixed(2),
      zRange: `[-${(depth/2).toFixed(2)}, +${(depth/2).toFixed(2)}]`,
      vertices: geometry.attributes.position.count
    })

    return geometry
  }

  /**
   * 计算文字的变换矩阵，使其对齐到圆柱面
   * 
   * 关键：文字的 Z 轴（厚度方向）应该沿径向
   * 文字几何体的 Z=0 平面应该在圆柱表面上
   */
  calculateTextTransform(attachPoint, cylinderInfo, textGeometry) {
    const { center, axis, radius } = cylinderInfo
    const axisNorm = axis.clone().normalize()

    // 计算附着点在圆柱坐标系中的位置
    const toAttach = attachPoint.clone().sub(center)
    const heightOnAxis = toAttach.dot(axisNorm)
    const radialVector = toAttach.clone().sub(axisNorm.clone().multiplyScalar(heightOnAxis))
    const radialDir = radialVector.length() > 0.001 
      ? radialVector.clone().normalize() 
      : new THREE.Vector3(1, 0, 0) // 默认径向

    // 计算切线方向（文字的 X 方向，沿圆周）
    // 注意：叉积顺序决定方向，这里让文字从左到右沿圆周正方向
    const tangentDir = radialDir.clone().cross(axisNorm).normalize()

    // 文字中心应该在圆柱表面上
    const textCenter = center.clone()
      .add(axisNorm.clone().multiplyScalar(heightOnAxis))
      .add(radialDir.clone().multiplyScalar(radius))

    // 构建变换矩阵
    // 使用 compose 方法：位置 + 旋转 + 缩放
    const position = textCenter
    const quaternion = new THREE.Quaternion()
    const scale = new THREE.Vector3(1, 1, 1)
    
    // 从基向量构建旋转
    // 文字局部坐标系：
    // - X 方向（文字宽度）→ 切线方向（沿圆周）
    // - Y 方向（文字高度）→ 轴向（沿圆柱轴）
    // - Z 方向（文字厚度）→ 径向（指向外部）
    const rotationMatrix = new THREE.Matrix4()
    rotationMatrix.makeBasis(tangentDir, axisNorm, radialDir)
    quaternion.setFromRotationMatrix(rotationMatrix)

    const matrix = new THREE.Matrix4()
    matrix.compose(position, quaternion, scale)

    console.log('🔄 文字变换矩阵计算完成:', {
      textCenter: `(${textCenter.x.toFixed(2)}, ${textCenter.y.toFixed(2)}, ${textCenter.z.toFixed(2)})`,
      tangentDir: `(${tangentDir.x.toFixed(2)}, ${tangentDir.y.toFixed(2)}, ${tangentDir.z.toFixed(2)})`,
      radialDir: `(${radialDir.x.toFixed(2)}, ${radialDir.y.toFixed(2)}, ${radialDir.z.toFixed(2)})`,
      axisNorm: `(${axisNorm.x.toFixed(2)}, ${axisNorm.y.toFixed(2)}, ${axisNorm.z.toFixed(2)})`
    })

    return matrix
  }

  /**
   * 创建用于切割的圆柱体
   */
  createCuttingCylinder(cylinderInfo, config) {
    const { center, axis, radius, height: cylinderHeight } = cylinderInfo
    const axisNorm = axis.clone().normalize()

    // 创建圆柱几何体
    // 使用足够的分段数以获得平滑的曲面
    // 如果没有提供高度，使用一个足够大的默认值
    const height = cylinderHeight || radius * 4 || 10
    const geometry = new THREE.CylinderGeometry(
      radius,           // 顶部半径
      radius,           // 底部半径
      height,           // 高度
      config.cylinderSegments, // 径向分段
      1,                // 高度分段
      false             // 不开口
    )

    // 默认圆柱是沿 Y 轴的，需要旋转到正确的轴向
    if (Math.abs(axisNorm.y) < 0.99) {
      const defaultAxis = new THREE.Vector3(0, 1, 0)
      const quaternion = new THREE.Quaternion()
      quaternion.setFromUnitVectors(defaultAxis, axisNorm)
      geometry.applyQuaternion(quaternion)
    }

    // 移动到圆柱中心
    geometry.translate(center.x, center.y, center.z)

    console.log('🔵 切割圆柱体创建完成:', {
      radius,
      height,
      segments: config.cylinderSegments,
      vertices: geometry.attributes.position.count
    })

    return geometry
  }

  /**
   * 创建内层圆柱（用于提取文字壳）
   */
  createInnerCylinder(cylinderInfo, config) {
    const { center, axis, radius, height: cylinderHeight } = cylinderInfo
    const axisNorm = axis.clone().normalize()

    // 内层圆柱的半径 = 外层半径 - 文字厚度
    const innerRadius = radius - config.thickness
    // 如果没有提供高度，使用一个足够大的默认值
    const height = cylinderHeight || radius * 4 || 10

    const geometry = new THREE.CylinderGeometry(
      innerRadius,
      innerRadius,
      height + 0.1, // 稍微长一点，确保完全穿透
      config.cylinderSegments,
      1,
      false
    )

    // 旋转到正确的轴向
    if (Math.abs(axisNorm.y) < 0.99) {
      const defaultAxis = new THREE.Vector3(0, 1, 0)
      const quaternion = new THREE.Quaternion()
      quaternion.setFromUnitVectors(defaultAxis, axisNorm)
      geometry.applyQuaternion(quaternion)
    }

    // 移动到圆柱中心
    geometry.translate(center.x, center.y, center.z)

    console.log('🔵 内层圆柱体创建完成:', {
      innerRadius,
      height,
      vertices: geometry.attributes.position.count
    })

    return geometry
  }

  /**
   * 用圆柱体减去文字
   */
  subtractTextFromCylinder(cylinderGeometry, textGeometry, textMatrix) {
    console.log('⚙️ 执行布尔减法: 圆柱 - 文字')

    // 创建 Brush 对象
    const cylinderBrush = new Brush(cylinderGeometry.clone())
    cylinderBrush.updateMatrixWorld()

    const textBrush = new Brush(textGeometry.clone())
    textBrush.applyMatrix4(textMatrix)
    textBrush.updateMatrixWorld()

    // 执行减法操作
    const resultBrush = this.evaluator.evaluate(cylinderBrush, textBrush, SUBTRACTION)
    const resultGeometry = resultBrush.geometry

    resultGeometry.computeVertexNormals()
    resultGeometry.computeBoundingBox()

    // 清理
    cylinderBrush.geometry.dispose()
    textBrush.geometry.dispose()

    console.log('✅ 布尔减法完成:', {
      vertices: resultGeometry.attributes.position.count
    })

    return resultGeometry
  }

  /**
   * 从减法结果中提取文字壳
   * 方法：用减法结果减去内层圆柱，得到文字区域的壳
   */
  extractTextShell(subtractedGeometry, innerCylinderGeometry, cylinderInfo, config) {
    console.log('⚙️ 提取文字壳: 减法结果 - 内层圆柱')

    // 创建 Brush 对象
    const subtractedBrush = new Brush(subtractedGeometry.clone())
    subtractedBrush.updateMatrixWorld()

    const innerBrush = new Brush(innerCylinderGeometry.clone())
    innerBrush.updateMatrixWorld()

    // 执行减法操作
    const resultBrush = this.evaluator.evaluate(subtractedBrush, innerBrush, SUBTRACTION)
    const resultGeometry = resultBrush.geometry

    resultGeometry.computeVertexNormals()
    resultGeometry.computeBoundingBox()
    resultGeometry.computeBoundingSphere()

    // 清理
    subtractedBrush.geometry.dispose()
    innerBrush.geometry.dispose()

    console.log('✅ 文字壳提取完成:', {
      vertices: resultGeometry.attributes.position.count
    })

    return resultGeometry
  }

  /**
   * 简化版本：直接生成贴合圆柱面的文字
   * 使用交集操作而不是两次减法
   * 
   * 核心思路：
   * 1. 生成一个沿径向很厚的文字几何体（从圆柱外部穿透到内部）
   * 2. 创建一个圆柱壳（外半径=radius+突出量，内半径=radius-厚度）
   * 3. 文字与圆柱壳求交，得到贴合圆柱面的文字
   */
  generateSimple(text, font, cylinderInfo, attachPoint, config: Record<string, any> = {}) {
    const finalConfig = { ...this.defaultConfig, ...config }
    const { center, axis, radius } = cylinderInfo

    console.log('🔧 CSGCylinderText.generateSimple 开始:', {
      text,
      radius: radius.toFixed(2),
      thickness: finalConfig.thickness,
      textHeight: finalConfig.textHeight
    })

    const startTime = performance.now()

    try {
      // Step 1: 生成较厚的 TextGeometry
      // 文字的 Z 方向（厚度）将沿径向放置
      const textGeometry = this.createThickTextGeometry(text, font, finalConfig)
      
      // Step 2: 计算文字的变换矩阵
      // 文字中心放在圆柱表面，Z 方向沿径向
      const textMatrix = this.calculateTextTransformForIntersection(
        attachPoint, 
        cylinderInfo, 
        textGeometry,
        finalConfig
      )
      
      // Step 3: 创建圆柱壳（用于求交）
      // 壳的范围：从 (radius - thickness) 到 (radius + protrusion)
      const shellGeometry = this.createCylinderShellForIntersection(cylinderInfo, finalConfig)
      
      // Step 4: 文字与圆柱壳求交
      const finalGeometry = this.intersectTextWithShell(
        textGeometry,
        textMatrix,
        shellGeometry
      )

      // 清理
      textGeometry.dispose()
      shellGeometry.dispose()

      const endTime = performance.now()
      console.log(`✅ CSG 圆柱面文字生成完成（简化版），耗时: ${(endTime - startTime).toFixed(2)}ms`)

      finalGeometry.userData = {
        isManifold: true,
        generatorType: 'CSGCylinderText-Simple',
        cylinderInfo: {
          radius,
          center: center.clone(),
          axis: axis.clone()
        }
      }

      return finalGeometry

    } catch (error) {
      console.error('❌ CSG 圆柱面文字生成失败:', error)
      throw error
    }
  }

  /**
   * 计算文字变换矩阵（用于交集操作）
   * 
   * 关键：文字的 Z=0 平面需要与圆柱壳有足够的重叠
   * 文字几何体的 Z 范围是 [-textHeight/2, +textHeight/2]
   * 我们需要将文字中心放在圆柱表面附近，使文字穿透圆柱壳
   */
  calculateTextTransformForIntersection(attachPoint, cylinderInfo, textGeometry, config) {
    const { center, axis, radius } = cylinderInfo
    const axisNorm = axis.clone().normalize()

    // 计算附着点在圆柱坐标系中的位置
    const toAttach = attachPoint.clone().sub(center)
    const heightOnAxis = toAttach.dot(axisNorm)
    const radialVector = toAttach.clone().sub(axisNorm.clone().multiplyScalar(heightOnAxis))
    const radialDir = radialVector.length() > 0.001 
      ? radialVector.clone().normalize() 
      : new THREE.Vector3(1, 0, 0)

    // 切线方向（文字的 X 方向）
    const tangentDir = radialDir.clone().cross(axisNorm).normalize()

    // 🔧 关键修复：文字中心放在圆柱表面
    // 由于文字 Z 方向居中（从 -textHeight/2 到 +textHeight/2），
    // 文字中心在圆柱表面时，文字会同时向内和向外延伸
    const textCenter = center.clone()
      .add(axisNorm.clone().multiplyScalar(heightOnAxis))
      .add(radialDir.clone().multiplyScalar(radius))

    // 构建旋转矩阵
    const rotationMatrix = new THREE.Matrix4()
    rotationMatrix.makeBasis(tangentDir, axisNorm, radialDir)
    
    const quaternion = new THREE.Quaternion()
    quaternion.setFromRotationMatrix(rotationMatrix)

    const matrix = new THREE.Matrix4()
    matrix.compose(textCenter, quaternion, new THREE.Vector3(1, 1, 1))

    console.log('🔄 文字变换矩阵（交集用）:', {
      textCenter: `(${textCenter.x.toFixed(2)}, ${textCenter.y.toFixed(2)}, ${textCenter.z.toFixed(2)})`,
      radialDir: `(${radialDir.x.toFixed(2)}, ${radialDir.y.toFixed(2)}, ${radialDir.z.toFixed(2)})`,
      tangentDir: `(${tangentDir.x.toFixed(2)}, ${tangentDir.y.toFixed(2)}, ${tangentDir.z.toFixed(2)})`
    })

    return matrix
  }

  /**
   * 创建用于交集操作的圆柱壳
   * 
   * 壳的范围需要与文字几何体有足够的重叠：
   * - 外半径 = radius + protrusion（文字突出量）
   * - 内半径 = radius - thickness（文字厚度/深度）
   */
  createCylinderShellForIntersection(cylinderInfo, config) {
    const { center, axis, radius, height: cylinderHeight } = cylinderInfo
    const axisNorm = axis.clone().normalize()
    
    // 圆柱高度
    const height = cylinderHeight || radius * 4 || 10
    
    // 🔧 关键：壳的厚度需要与文字几何体的 Z 范围匹配
    // 文字 Z 范围：[-textHeight/2, +textHeight/2]
    // 壳需要覆盖这个范围的一部分
    const protrusion = config.thickness  // 文字突出圆柱表面的量
    const depth = config.thickness       // 文字深入圆柱内部的量
    
    const outerRadius = radius + protrusion
    const innerRadius = radius - depth

    console.log('🔵 创建交集用圆柱壳:', {
      radius,
      outerRadius: outerRadius.toFixed(2),
      innerRadius: innerRadius.toFixed(2),
      shellThickness: (outerRadius - innerRadius).toFixed(2),
      height
    })

    // 外层圆柱
    const outerGeometry = new THREE.CylinderGeometry(
      outerRadius, outerRadius, height,
      config.cylinderSegments, 1, false
    )

    // 内层圆柱
    const innerGeometry = new THREE.CylinderGeometry(
      innerRadius, innerRadius, height + 0.1,
      config.cylinderSegments, 1, false
    )

    // 旋转到正确的轴向
    if (Math.abs(axisNorm.y) < 0.99) {
      const defaultAxis = new THREE.Vector3(0, 1, 0)
      const quaternion = new THREE.Quaternion()
      quaternion.setFromUnitVectors(defaultAxis, axisNorm)
      outerGeometry.applyQuaternion(quaternion)
      innerGeometry.applyQuaternion(quaternion)
    }

    // 移动到圆柱中心
    outerGeometry.translate(center.x, center.y, center.z)
    innerGeometry.translate(center.x, center.y, center.z)

    // 创建壳：外层 - 内层
    const outerBrush = new Brush(outerGeometry)
    outerBrush.updateMatrixWorld()
    
    const innerBrush = new Brush(innerGeometry)
    innerBrush.updateMatrixWorld()

    const shellBrush = this.evaluator.evaluate(outerBrush, innerBrush, SUBTRACTION)
    const shellGeometry = shellBrush.geometry

    // 清理
    outerGeometry.dispose()
    innerGeometry.dispose()
    outerBrush.geometry.dispose()
    innerBrush.geometry.dispose()

    console.log('🔵 交集用圆柱壳创建完成:', {
      vertices: shellGeometry.attributes.position.count
    })

    return shellGeometry
  }

  /**
   * 创建圆柱壳（外层 - 内层）
   * @deprecated 使用 createCylinderShellForIntersection 代替
   */
  createCylinderShell(cylinderInfo, config) {
    // 调用新方法
    return this.createCylinderShellForIntersection(cylinderInfo, config)
  }

  /**
   * 文字与圆柱壳求交
   */
  intersectTextWithShell(textGeometry, textMatrix, shellGeometry) {
    console.log('⚙️ 执行布尔交集: 文字 ∩ 圆柱壳')

    // 调试：打印变换后的文字边界框
    const transformedTextGeo = textGeometry.clone()
    transformedTextGeo.applyMatrix4(textMatrix)
    transformedTextGeo.computeBoundingBox()
    const textBbox = transformedTextGeo.boundingBox
    
    shellGeometry.computeBoundingBox()
    const shellBbox = shellGeometry.boundingBox
    
    console.log('📦 文字边界框（变换后）:', {
      min: `(${textBbox.min.x.toFixed(2)}, ${textBbox.min.y.toFixed(2)}, ${textBbox.min.z.toFixed(2)})`,
      max: `(${textBbox.max.x.toFixed(2)}, ${textBbox.max.y.toFixed(2)}, ${textBbox.max.z.toFixed(2)})`,
      size: `(${(textBbox.max.x - textBbox.min.x).toFixed(2)}, ${(textBbox.max.y - textBbox.min.y).toFixed(2)}, ${(textBbox.max.z - textBbox.min.z).toFixed(2)})`
    })
    
    console.log('📦 圆柱壳边界框:', {
      min: `(${shellBbox.min.x.toFixed(2)}, ${shellBbox.min.y.toFixed(2)}, ${shellBbox.min.z.toFixed(2)})`,
      max: `(${shellBbox.max.x.toFixed(2)}, ${shellBbox.max.y.toFixed(2)}, ${shellBbox.max.z.toFixed(2)})`,
      size: `(${(shellBbox.max.x - shellBbox.min.x).toFixed(2)}, ${(shellBbox.max.y - shellBbox.min.y).toFixed(2)}, ${(shellBbox.max.z - shellBbox.min.z).toFixed(2)})`
    })
    
    // 检查边界框是否相交
    const intersects = textBbox.intersectsBox(shellBbox)
    console.log('📦 边界框是否相交:', intersects)
    
    if (!intersects) {
      console.warn('⚠️ 警告：文字边界框与圆柱壳边界框不相交！')
      console.warn('这可能导致交集结果为空或很小')
    }
    
    transformedTextGeo.dispose()

    const textBrush = new Brush(textGeometry.clone())
    textBrush.applyMatrix4(textMatrix)
    textBrush.updateMatrixWorld()

    const shellBrush = new Brush(shellGeometry.clone())
    shellBrush.updateMatrixWorld()

    const resultBrush = this.evaluator.evaluate(textBrush, shellBrush, INTERSECTION)
    const resultGeometry = resultBrush.geometry

    resultGeometry.computeVertexNormals()
    resultGeometry.computeBoundingBox()
    resultGeometry.computeBoundingSphere()

    // 清理
    textBrush.geometry.dispose()
    shellBrush.geometry.dispose()

    const vertexCount = resultGeometry.attributes.position?.count || 0
    
    console.log('✅ 布尔交集完成:', {
      vertices: vertexCount,
      resultBbox: resultGeometry.boundingBox ? {
        min: `(${resultGeometry.boundingBox.min.x.toFixed(2)}, ${resultGeometry.boundingBox.min.y.toFixed(2)}, ${resultGeometry.boundingBox.min.z.toFixed(2)})`,
        max: `(${resultGeometry.boundingBox.max.x.toFixed(2)}, ${resultGeometry.boundingBox.max.y.toFixed(2)}, ${resultGeometry.boundingBox.max.z.toFixed(2)})`
      } : 'N/A'
    })
    
    if (vertexCount < 100) {
      console.warn('⚠️ 警告：交集结果顶点数很少，可能存在问题')
    }

    return resultGeometry
  }
}

// 导出单例
export const csgCylinderText = new CSGCylinderText()
