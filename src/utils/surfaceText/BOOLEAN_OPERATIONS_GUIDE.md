# three-bvh-csg 布尔运算指南

## 概述

three-bvh-csg 是一个强大的布尔运算库，但在某些情况下可能会失败。本指南介绍常见的失败场景和解决方案，包括使用 BVH 树进行精确相交检测。

## 相交检测方法

### 1. 边界盒检测（快速但不精确）

```javascript
// 快速边界盒检测
const boundingBoxCheck = operator.checkGeometryIntersection(geometry1, geometry2, matrix2)
console.log('边界盒相交:', boundingBoxCheck.intersects)
```

**优点**: 速度快，计算开销小
**缺点**: 可能产生假阳性（边界盒相交但几何体不相交）

### 2. BVH 树检测（精确但较慢）

```javascript
// 创建网格用于 BVH 检测
const mesh1 = operator.createTempMesh(geometry1)
const mesh2 = operator.createTempMesh(geometry2, matrix2)

// BVH 精确检测
const bvhCheck = operator.checkMeshIntersectionBVH(mesh1, mesh2)
console.log('BVH 相交:', bvhCheck.intersects)
```

**优点**: 精确度高，基于实际几何体形状
**缺点**: 计算开销较大，需要构建 BVH 树

### 3. 综合检测（推荐）

```javascript
// 综合检测：先边界盒，再 BVH
const comprehensiveCheck = operator.checkIntersectionComprehensive(geometry1, geometry2, matrix2, {
  useBVH: true,        // 启用 BVH 检测
  fastOnly: false      // 不仅仅使用快速检测
})

console.log('最终结果:', comprehensiveCheck.finalResult)
console.log('检测置信度:', comprehensiveCheck.confidence) // 'high', 'medium'
console.log('使用方法:', comprehensiveCheck.method)       // 'comprehensive'
```

**优点**: 结合两种方法的优势，先快速筛选再精确检测
**缺点**: 在复杂情况下仍有一定计算开销

## 常见失败场景

### 1. 几何体不相交

**问题**: 当两个几何体完全分离时，布尔运算可能失败或返回意外结果。

```javascript
const box = new THREE.BoxGeometry(1, 1, 1)
const sphere = new THREE.SphereGeometry(0.5, 16, 16)

// 球体距离立方体太远
const farMatrix = new THREE.Matrix4().makeTranslation(10, 0, 0)

// 这种情况下减法操作可能失败
const result = await operator.subtract(box, sphere, farMatrix)
```

**解决方案**:
- 使用 `checkGeometryIntersection()` 方法预检查
- 启用严格模式来提前捕获错误
- 在UI中提供视觉反馈

```javascript
// 预检查相交性
const intersectionCheck = operator.checkGeometryIntersection(box, sphere, farMatrix)
if (!intersectionCheck.intersects) {
  console.warn('几何体不相交:', intersectionCheck.reason)
  // 处理不相交的情况
}

// 或使用严格模式
try {
  const result = await operator.subtract(box, sphere, farMatrix, { strictMode: true })
} catch (error) {
  if (error.message.includes('几何体不相交')) {
    // 处理不相交错误
  }
}
```

### 2. 几何体质量问题

**问题**: 非流形几何体、有洞的几何体、法向量不一致等。

```javascript
// 检查几何体质量
const validation = operator.validateGeometry(geometry)
if (!validation.isValid) {
  console.error('几何体验证失败:', validation.errors)
}

// 优化几何体
const optimizedGeometry = operator.optimizeGeometry(geometry)
```

### 3. 精度问题

**问题**: 极小的几何体或极薄的结构可能导致数值不稳定。

```javascript
// 检查几何体大小
const validation = operator.validateGeometry(geometry)
if (validation.warnings.includes('几何体非常复杂')) {
  // 考虑简化几何体
}
```

## 最佳实践

### 1. 预检查流程

```javascript
// 使用综合检测的安全布尔运算
async function safeSubtractWithBVH(targetGeometry, toolGeometry, toolMatrix, options = {}) {
  const operator = new BooleanOperator()
  
  // 1. 验证几何体
  const targetValidation = operator.validateGeometry(targetGeometry)
  const toolValidation = operator.validateGeometry(toolGeometry)
  
  if (!targetValidation.isValid || !toolValidation.isValid) {
    throw new Error('几何体验证失败')
  }
  
  // 2. 综合相交检测（BVH + 边界盒）
  const intersectionCheck = operator.checkIntersectionComprehensive(
    targetGeometry, 
    toolGeometry, 
    toolMatrix,
    {
      useBVH: true,
      fastOnly: false
    }
  )
  
  // 3. 根据检测结果决定是否继续
  if (!intersectionCheck.finalResult) {
    const method = intersectionCheck.bvhCheck ? 'BVH' : '边界盒'
    console.warn(`几何体不相交 (${method}检测):`, intersectionCheck.reason)
    
    if (options.requireIntersection) {
      throw new Error(`几何体不相交 (${method}检测): ${intersectionCheck.reason}`)
    }
  }
  
  // 4. 显示检测信息
  console.log(`相交检测置信度: ${intersectionCheck.confidence}`)
  if (intersectionCheck.bvhCheck) {
    console.log('使用了 BVH 精确检测')
  }
  
  // 5. 优化几何体
  const optimizedTarget = operator.optimizeGeometry(targetGeometry)
  const optimizedTool = operator.optimizeGeometry(toolGeometry)
  
  // 6. 执行布尔运算
  return await operator.subtract(optimizedTarget, optimizedTool, toolMatrix, options)
}
```

### 2. 性能优化策略

```javascript
// 根据几何体复杂度选择检测方法
function chooseDetectionMethod(geometry1, geometry2) {
  const validation1 = operator.validateGeometry(geometry1)
  const validation2 = operator.validateGeometry(geometry2)
  
  const totalFaces = validation1.faceCount + validation2.faceCount
  
  if (totalFaces < 1000) {
    // 简单几何体，使用 BVH 精确检测
    return { useBVH: true, fastOnly: false }
  } else if (totalFaces < 10000) {
    // 中等复杂度，先边界盒再 BVH
    return { useBVH: true, fastOnly: false }
  } else {
    // 复杂几何体，仅使用边界盒检测
    return { useBVH: false, fastOnly: true }
  }
}

// 使用示例
const detectionOptions = chooseDetectionMethod(targetGeometry, toolGeometry)
const intersectionCheck = operator.checkIntersectionComprehensive(
  targetGeometry, 
  toolGeometry, 
  toolMatrix,
  detectionOptions
)
```

### 2. 错误处理

```javascript
async function robustBooleanOperation(operation, ...args) {
  const maxRetries = 3
  let lastError
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation(...args)
    } catch (error) {
      lastError = error
      console.warn(`布尔运算失败 (尝试 ${i + 1}/${maxRetries}):`, error.message)
      
      // 根据错误类型采取不同策略
      if (error.message.includes('几何体不相交')) {
        // 不相交错误，不需要重试
        break
      }
      
      // 其他错误，可以尝试优化几何体后重试
      if (i < maxRetries - 1) {
        args = args.map(arg => {
          if (arg && arg.isBufferGeometry) {
            return operator.optimizeGeometry(arg)
          }
          return arg
        })
      }
    }
  }
  
  throw lastError
}
```

### 3. 用户界面集成

```javascript
// 在UI中提供实时反馈
function updateBooleanPreview(targetMesh, toolMesh) {
  const intersectionCheck = operator.checkGeometryIntersection(
    targetMesh.geometry,
    toolMesh.geometry,
    toolMesh.matrixWorld
  )
  
  if (!intersectionCheck.intersects) {
    // 显示警告UI
    showWarning('几何体不相交，布尔运算可能失败')
    // 改变工具几何体颜色为红色
    toolMesh.material.color.setHex(0xff0000)
  } else {
    // 隐藏警告，恢复正常颜色
    hideWarning()
    toolMesh.material.color.setHex(0x00ff00)
  }
}
```

## 性能优化

### 1. 几何体复杂度管理

```javascript
// 检查几何体复杂度
const validation = operator.validateGeometry(geometry)
if (validation.faceCount > 10000) {
  console.warn('几何体较复杂，考虑简化')
  
  // 可以使用 THREE.js 的简化算法
  // 或者提示用户降低细分级别
}
```

### 2. 批量操作优化

```javascript
// 使用批量操作而不是多次单独操作
const operations = [
  { geometry: text1Geometry, matrix: text1Matrix, operation: 'subtract' },
  { geometry: text2Geometry, matrix: text2Matrix, operation: 'subtract' },
  { geometry: text3Geometry, matrix: text3Matrix, operation: 'subtract' }
]

const result = await operator.batchOperation(baseGeometry, operations)
```

## 调试工具

### 1. 可视化边界盒

```javascript
function visualizeBoundingBoxes(geometry1, geometry2, matrix2) {
  const intersectionCheck = operator.checkGeometryIntersection(geometry1, geometry2, matrix2)
  
  // 创建边界盒可视化
  const box1Helper = new THREE.Box3Helper(intersectionCheck.box1, 0x00ff00)
  const box2Helper = new THREE.Box3Helper(intersectionCheck.box2, 0xff0000)
  
  scene.add(box1Helper)
  scene.add(box2Helper)
  
  console.log('边界盒相交:', intersectionCheck.intersects)
  console.log('距离:', intersectionCheck.distance)
}
```

### 2. 运行测试套件

```javascript
// 运行基础测试
import('/src/utils/surfaceText/test-boolean-csg.js').then(m => m.runTests())

// 运行边界情况测试
import('/src/utils/surfaceText/test-boolean-edge-cases.js').then(m => m.runEdgeCaseTests())
```

## 总结

three-bvh-csg 是一个强大的工具，但需要正确处理边界情况：

1. **预检查**: 始终验证几何体质量和相交性
2. **错误处理**: 实现健壮的错误处理和重试机制
3. **用户反馈**: 在UI中提供实时反馈和警告
4. **性能优化**: 管理几何体复杂度，使用批量操作
5. **调试工具**: 使用可视化和测试工具来诊断问题

通过遵循这些最佳实践，可以大大提高布尔运算的成功率和用户体验。