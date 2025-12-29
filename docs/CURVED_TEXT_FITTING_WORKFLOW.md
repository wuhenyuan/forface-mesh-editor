# 曲面文字拟合完整流程

## 🎯 概述

曲面文字拟合是将平面文字变形以适应三维曲面的过程。对于圆柱面，这个过程包括表面检测、路径规划、几何体变形和最终渲染等多个步骤。

## 📋 完整流程图

```
用户点击3D表面
       │
       ▼
1. 射线投射检测
   ├── 获取点击位置
   ├── 计算表面法向量
   └── 确定面索引
       │
       ▼
2. 表面类型分析
   ├── 几何体采样
   ├── 圆柱面检测 (RANSAC)
   ├── 参数验证
   └── 置信度评估
       │
       ▼
3. 文字内容输入
   ├── 显示输入框
   ├── 用户输入文字
   └── 验证文字内容
       │
       ▼
4. 曲面路径规划
   ├── 坐标系转换
   ├── 文字路径生成
   ├── 字符位置计算
   └── 间距优化
       │
       ▼
5. 字符几何体生成
   ├── 加载字体文件
   ├── 生成单字符几何体
   ├── 计算边界框
   └── 几何体居中
       │
       ▼
6. 曲面变形处理
   ├── 顶点坐标变换
   ├── 弯曲算法应用
   ├── 法向量重计算
   └── UV坐标调整
       │
       ▼
7. 几何体合并
   ├── 多字符合并
   ├── 索引重建
   ├── 属性合并
   └── 优化处理
       │
       ▼
8. 表面定位
   ├── 计算最终位置
   ├── 应用旋转变换
   ├── 法向量对齐
   └── Z-fighting避免
       │
       ▼
9. 渲染和显示
   ├── 材质应用
   ├── 光照计算
   ├── 添加到场景
   └── 用户交互
```

## 🔍 详细步骤解析

### 步骤1: 射线投射检测

```javascript
// 用户点击时的射线投射
function handleClick(event) {
  // 1. 计算鼠标在标准化设备坐标中的位置
  const mouse = new THREE.Vector2()
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1
  
  // 2. 设置射线投射器
  raycaster.setFromCamera(mouse, camera)
  
  // 3. 计算射线与目标网格的交点
  const intersects = raycaster.intersectObjects(targetMeshes)
  
  if (intersects.length > 0) {
    const intersection = intersects[0]
    
    return {
      point: intersection.point,        // 交点位置
      face: intersection.face,          // 相交的面
      faceIndex: intersection.faceIndex, // 面索引
      normal: intersection.face.normal, // 面法向量
      mesh: intersection.object,        // 目标网格
      uv: intersection.uv              // UV坐标
    }
  }
  
  return null
}
```

### 步骤2: 表面类型分析

```javascript
function analyzeSurface(faceInfo) {
  const { mesh } = faceInfo
  
  // 1. 尝试检测圆柱面
  const cylinderInfo = cylinderSurfaceHelper.detectCylinder(mesh.geometry)
  
  if (cylinderInfo && cylinderInfo.confidence > 0.7) {
    console.log('检测到圆柱面:', cylinderInfo)
    
    return {
      surfaceType: 'cylinder',
      cylinderInfo: cylinderInfo,
      attachPoint: faceInfo.point.clone(),
      confidence: cylinderInfo.confidence
    }
  }
  
  // 2. 检测球面 (未来扩展)
  // const sphereInfo = sphereHelper.detectSphere(mesh.geometry)
  
  // 3. 默认为平面
  return {
    surfaceType: 'plane',
    attachPoint: faceInfo.point.clone(),
    normal: faceInfo.face.normal.clone()
  }
}
```

### 步骤3: 文字内容输入

```javascript
function showTextInput(screenPosition) {
  // 1. 创建输入框
  const inputElement = document.createElement('input')
  inputElement.type = 'text'
  inputElement.placeholder = '输入文字内容'
  
  // 2. 定位到点击位置
  inputElement.style.position = 'absolute'
  inputElement.style.left = screenPosition.x + 'px'
  inputElement.style.top = screenPosition.y + 'px'
  
  // 3. 添加事件监听
  inputElement.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const text = inputElement.value.trim()
      if (text) {
        createTextOnSurface(text, faceInfo, surfaceInfo)
      }
      removeInputElement()
    }
  })
  
  document.body.appendChild(inputElement)
  inputElement.focus()
}
```

### 步骤4: 曲面路径规划

```javascript
function generateTextPath(text, startPoint, cylinderInfo, options = {}) {
  const {
    fontSize = 1,
    letterSpacing = 0.1,
    direction = 1 // 1为顺时针，-1为逆时针
  } = options

  // 1. 转换起始点到圆柱坐标
  const startCoords = worldToCylinderCoords(startPoint, cylinderInfo)
  
  const pathPoints = []
  const letterWidth = fontSize * 0.6 // 估算字符宽度
  
  // 2. 为每个字符计算位置
  for (let i = 0; i < text.length; i++) {
    // 计算角度偏移
    const angleOffset = direction * (i * (letterWidth + letterSpacing)) / cylinderInfo.radius
    const currentTheta = startCoords.theta + angleOffset
    
    // 转换回世界坐标
    const worldPos = cylinderToWorldCoords(
      currentTheta, 
      startCoords.height, 
      cylinderInfo
    )
    
    pathPoints.push({
      position: worldPos,
      theta: currentTheta,
      height: startCoords.height,
      char: text[i],
      index: i,
      // 计算该位置的切线和法向量
      tangent: calculateTangent(currentTheta, cylinderInfo),
      normal: getCylinderNormal(worldPos, cylinderInfo)
    })
  }
  
  return pathPoints
}
```

### 步骤5: 字符几何体生成

```javascript
function createCharacterGeometry(char, font, pathPoint, cylinderInfo, config) {
  // 1. 创建基础字符几何体
  const charGeometry = new TextGeometry(char, {
    font: font,
    size: config.size || 1,
    height: config.thickness || 0.1,
    curveSegments: config.curveSegments || 12,
    bevelEnabled: config.bevelEnabled || false
  })

  // 2. 计算字符边界框并居中
  charGeometry.computeBoundingBox()
  const bbox = charGeometry.boundingBox
  
  const centerX = -0.5 * (bbox.max.x - bbox.min.x)
  const centerY = -0.5 * (bbox.max.y - bbox.min.y)
  const centerZ = -0.5 * (bbox.max.z - bbox.min.z)
  
  charGeometry.translate(centerX, centerY, centerZ)

  // 3. 应用圆柱面变换
  applyCylinderTransform(charGeometry, pathPoint, cylinderInfo, config)

  return charGeometry
}
```

### 步骤6: 曲面变形处理

```javascript
function applyCylinderTransform(geometry, pathPoint, cylinderInfo, config) {
  const { position, theta, normal, tangent } = pathPoint
  const { radius } = cylinderInfo

  // 1. 应用弯曲变形
  if (config.enableCurving !== false) {
    applyCylinderCurving(geometry, cylinderInfo, radius, config)
  }

  // 2. 计算旋转矩阵
  const binormal = normal.clone().cross(tangent).normalize()
  const rotationMatrix = new THREE.Matrix4()
  rotationMatrix.makeBasis(tangent, binormal, normal)

  // 3. 应用变换
  geometry.applyMatrix4(rotationMatrix)

  // 4. 移动到目标位置
  const translation = new THREE.Matrix4().makeTranslation(
    position.x, position.y, position.z
  )
  geometry.applyMatrix4(translation)

  // 5. 向外偏移避免z-fighting
  const offset = normal.clone().multiplyScalar(0.01)
  geometry.translate(offset.x, offset.y, offset.z)
}

function applyCylinderCurving(geometry, cylinderInfo, radius, config) {
  const positions = geometry.attributes.position
  const positionArray = positions.array

  const curvingStrength = config.curvingStrength || 1.0
  const maxCurvingDistance = config.maxCurvingDistance || radius * 0.5

  // 对每个顶点应用弯曲变形
  for (let i = 0; i < positionArray.length; i += 3) {
    const x = positionArray[i]
    const y = positionArray[i + 1]
    const z = positionArray[i + 2]

    // 计算顶点到中心的距离
    const distance = Math.sqrt(x * x + z * z)
    
    if (distance > 0.001 && distance < maxCurvingDistance) {
      // 计算弯曲角度
      const bendAngle = (distance / radius) * curvingStrength
      
      // 应用弯曲变形
      const cosAngle = Math.cos(bendAngle)
      const sinAngle = Math.sin(bendAngle)
      
      // 在XZ平面内弯曲
      const newX = x * cosAngle - z * sinAngle
      const newZ = x * sinAngle + z * cosAngle
      
      positionArray[i] = newX
      positionArray[i + 2] = newZ
    }
  }

  // 标记需要更新
  positions.needsUpdate = true
  
  // 重新计算法向量
  geometry.computeVertexNormals()
}
```

### 步骤7: 几何体合并

```javascript
function mergeCharacterGeometries(geometries) {
  if (geometries.length === 0) {
    return new THREE.BufferGeometry()
  }

  if (geometries.length === 1) {
    return geometries[0]
  }

  try {
    // 1. 使用BufferGeometryUtils合并
    const mergedGeometry = BufferGeometryUtils.mergeBufferGeometries(geometries)
    
    if (!mergedGeometry) {
      console.warn('几何体合并失败，返回第一个几何体')
      return geometries[0]
    }

    // 2. 清理原始几何体
    geometries.forEach(geo => {
      if (geo !== mergedGeometry) {
        geo.dispose()
      }
    })

    // 3. 优化合并后的几何体
    mergedGeometry.computeBoundingBox()
    mergedGeometry.computeBoundingSphere()

    return mergedGeometry

  } catch (error) {
    console.error('合并几何体时出错:', error)
    return geometries[0]
  }
}
```

### 步骤8: 表面定位

```javascript
function positionTextOnCylinder(textMesh, faceInfo, surfaceInfo) {
  const { cylinderInfo } = surfaceInfo
  const attachPoint = faceInfo.point
  
  // 1. 计算圆柱面上的法向量
  const normal = getCylinderNormal(attachPoint, cylinderInfo)
  
  // 2. 计算切线方向
  const cylinderCoords = worldToCylinderCoords(attachPoint, cylinderInfo)
  const tangent = calculateCylinderTangent(cylinderCoords.theta, cylinderInfo)
  
  // 3. 设置文字位置
  textMesh.position.copy(attachPoint)
  
  // 4. 创建旋转矩阵
  const up = cylinderInfo.axis.clone()
  const rotationMatrix = new THREE.Matrix4()
  rotationMatrix.lookAt(
    new THREE.Vector3(0, 0, 0),
    normal,
    up
  )
  
  // 5. 应用旋转
  textMesh.setRotationFromMatrix(rotationMatrix)
  
  // 6. 向外偏移避免z-fighting
  textMesh.position.add(normal.multiplyScalar(0.02))
}
```

### 步骤9: 渲染和显示

```javascript
function finalizeTextObject(textMesh, textObject) {
  // 1. 应用材质
  const material = new THREE.MeshPhongMaterial({
    color: textObject.config.color,
    shininess: 30,
    transparent: false
  })
  textMesh.material = material

  // 2. 设置阴影
  textMesh.castShadow = true
  textMesh.receiveShadow = false

  // 3. 设置用户数据
  textMesh.userData = {
    isTextObject: true,
    textId: textObject.id,
    type: 'text',
    surfaceType: textObject.surfaceInfo?.surfaceType || 'plane'
  }

  // 4. 添加到场景
  scene.add(textMesh)

  // 5. 启用交互
  setupTextInteraction(textMesh, textObject)

  console.log(`曲面文字创建完成: "${textObject.content}"`)
}
```

## ⚙️ 关键算法详解

### 坐标系转换

```javascript
// 世界坐标 → 圆柱坐标
function worldToCylinderCoords(point, cylinderInfo) {
  const { center, axis } = cylinderInfo
  
  const toPoint = point.clone().sub(center)
  const height = toPoint.dot(axis)
  const radialVector = toPoint.clone().sub(axis.clone().multiplyScalar(height))
  const radius = radialVector.length()
  
  let theta = 0
  if (radius > 0.001) {
    const refDirection = getPerpendicularVector(axis)
    theta = Math.atan2(
      radialVector.dot(refDirection.clone().cross(axis)),
      radialVector.dot(refDirection)
    )
  }
  
  return { theta, height, radius }
}

// 圆柱坐标 → 世界坐标
function cylinderToWorldCoords(theta, height, cylinderInfo) {
  const { center, axis, radius } = cylinderInfo
  
  const refDirection = getPerpendicularVector(axis)
  const tangentDirection = refDirection.clone().cross(axis).normalize()
  
  const radialDirection = refDirection.clone()
    .multiplyScalar(Math.cos(theta))
    .add(tangentDirection.clone().multiplyScalar(Math.sin(theta)))
  
  const position = center.clone()
    .add(axis.clone().multiplyScalar(height))
    .add(radialDirection.multiplyScalar(radius))
  
  return position
}
```

### 弯曲变形算法

```javascript
function calculateBendingTransform(vertex, cylinderRadius, curvingStrength) {
  const { x, y, z } = vertex
  
  // 计算到中心轴的距离
  const radialDistance = Math.sqrt(x * x + z * z)
  
  if (radialDistance < 0.001) return vertex
  
  // 计算弯曲角度
  const bendAngle = (radialDistance / cylinderRadius) * curvingStrength
  
  // 应用弯曲变换
  const cosAngle = Math.cos(bendAngle)
  const sinAngle = Math.sin(bendAngle)
  
  return {
    x: x * cosAngle - z * sinAngle,
    y: y,
    z: x * sinAngle + z * cosAngle
  }
}
```

## 🎛️ 参数控制

### 用户可调参数

| 参数 | 说明 | 范围 | 默认值 | 影响 |
|------|------|------|--------|------|
| 文字内容 | 要显示的文字 | 任意字符串 | "Hello" | 基础内容 |
| 字体大小 | 文字的尺寸 | 0.1 - 10 | 1.0 | 整体大小 |
| 厚度 | 文字的3D厚度 | 0.01 - 2 | 0.1 | Z方向深度 |
| 环绕方向 | 沿圆周的方向 | 1 / -1 | 1 | 顺/逆时针 |
| 字符间距 | 相邻字符间距 | 0 - 2 | 0.1 | 字符分布 |
| 弯曲强度 | 适应曲面程度 | 0 - 2 | 1.0 | 变形程度 |
| 起始角度 | 文字起始位置 | -180° - 180° | 0° | 旋转偏移 |

### 内部算法参数

```javascript
const algorithmConfig = {
  // 路径生成
  pathSampling: {
    minPoints: 10,
    maxPoints: 100,
    adaptiveSpacing: true
  },
  
  // 几何体变形
  curving: {
    maxCurvingDistance: 'radius * 0.5',
    vertexProcessingBatch: 1000,
    normalRecalculation: true
  },
  
  // 性能优化
  performance: {
    geometryMerging: true,
    indexOptimization: true,
    memoryCleanup: true
  }
}
```

## 🚀 性能优化策略

### 1. 几何体缓存
```javascript
const geometryCache = new Map()

function getCachedCharacterGeometry(char, config) {
  const key = `${char}_${JSON.stringify(config)}`
  
  if (geometryCache.has(key)) {
    return geometryCache.get(key).clone()
  }
  
  const geometry = createCharacterGeometry(char, config)
  geometryCache.set(key, geometry)
  
  return geometry.clone()
}
```

### 2. 批量处理
```javascript
function batchProcessVertices(geometry, transformFunction) {
  const positions = geometry.attributes.position.array
  const batchSize = 1000
  
  for (let i = 0; i < positions.length; i += batchSize * 3) {
    const endIndex = Math.min(i + batchSize * 3, positions.length)
    
    // 批量处理顶点
    for (let j = i; j < endIndex; j += 3) {
      const vertex = {
        x: positions[j],
        y: positions[j + 1],
        z: positions[j + 2]
      }
      
      const transformed = transformFunction(vertex)
      
      positions[j] = transformed.x
      positions[j + 1] = transformed.y
      positions[j + 2] = transformed.z
    }
  }
  
  geometry.attributes.position.needsUpdate = true
}
```

### 3. LOD (Level of Detail)
```javascript
function selectGeometryLOD(distance, config) {
  if (distance > 50) {
    return {
      ...config,
      curveSegments: 4,
      bevelEnabled: false
    }
  } else if (distance > 20) {
    return {
      ...config,
      curveSegments: 8,
      bevelEnabled: false
    }
  } else {
    return config // 使用完整质量
  }
}
```

## 🎯 总结

曲面文字拟合是一个复杂的多步骤过程，涉及：

1. **几何分析** - 识别表面类型和参数
2. **路径规划** - 计算文字在曲面上的分布
3. **几何变形** - 将平面文字适应曲面形状
4. **渲染优化** - 确保良好的视觉效果和性能

每个步骤都有其特定的算法和优化策略，整个流程需要在准确性、性能和用户体验之间找到平衡。

---

*流程设计: 2024年12月29日*