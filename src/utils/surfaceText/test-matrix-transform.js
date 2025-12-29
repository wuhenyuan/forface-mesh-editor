/**
 * 测试矩阵变换是否正确
 */
import * as THREE from 'three'

/**
 * 测试圆柱面变换矩阵
 */
window.testCylinderTransform = function() {
  console.log('🧪 测试圆柱面变换矩阵')
  
  // 创建测试圆柱
  const cylinderInfo = {
    center: new THREE.Vector3(0, 0, 0),
    axis: new THREE.Vector3(0, 1, 0),  // Y轴向上
    radius: 2
  }
  
  // 测试点（圆柱表面上的点）
  const testPoint = new THREE.Vector3(2, 0, 0)  // X轴正方向，圆柱表面
  
  console.log('测试配置:', {
    cylinderCenter: cylinderInfo.center,
    cylinderAxis: cylinderInfo.axis,
    cylinderRadius: cylinderInfo.radius,
    testPoint: testPoint
  })
  
  // 计算变换矩阵
  const toPosition = testPoint.clone().sub(cylinderInfo.center)
  const axialComponent = toPosition.dot(cylinderInfo.axis)
  const radialVector = toPosition.clone().sub(cylinderInfo.axis.clone().multiplyScalar(axialComponent))
  
  // 局部坐标系
  const normal = radialVector.normalize()      // 径向向外 (1, 0, 0)
  const tangent = cylinderInfo.axis.clone().cross(normal).normalize()  // 切线 (0, 0, -1)
  const up = cylinderInfo.axis.clone()         // 上方向 (0, 1, 0)
  
  console.log('计算的局部坐标系:', {
    normal: normal,    // 应该是 (1, 0, 0)
    tangent: tangent,  // 应该是 (0, 0, -1) 或 (0, 0, 1)
    up: up            // 应该是 (0, 1, 0)
  })
  
  // 创建旋转矩阵
  const rotationMatrix = new THREE.Matrix4()
  rotationMatrix.makeBasis(tangent, up, normal)
  
  console.log('旋转矩阵:', rotationMatrix.elements)
  
  // 测试向量变换
  const testVectors = [
    { name: 'X轴单位向量', vector: new THREE.Vector3(1, 0, 0) },
    { name: 'Y轴单位向量', vector: new THREE.Vector3(0, 1, 0) },
    { name: 'Z轴单位向量', vector: new THREE.Vector3(0, 0, 1) }
  ]
  
  console.log('向量变换测试:')
  testVectors.forEach(test => {
    const transformed = test.vector.clone().applyMatrix4(rotationMatrix)
    console.log(`${test.name}: ${test.vector.toArray()} -> ${transformed.toArray().map(x => x.toFixed(3))}`)
  })
  
  // 验证正交性
  const dot1 = tangent.dot(up)
  const dot2 = tangent.dot(normal)
  const dot3 = up.dot(normal)
  
  console.log('正交性验证 (应该都接近0):', {
    'tangent·up': dot1.toFixed(6),
    'tangent·normal': dot2.toFixed(6),
    'up·normal': dot3.toFixed(6)
  })
  
  // 验证单位长度
  console.log('单位长度验证 (应该都接近1):', {
    'tangent长度': tangent.length().toFixed(6),
    'up长度': up.length().toFixed(6),
    'normal长度': normal.length().toFixed(6)
  })
}

/**
 * 可视化坐标系
 */
window.visualizeCoordinateSystem = function() {
  console.log('📐 可视化坐标系')
  
  if (!window.scene) {
    console.log('❌ 未找到场景')
    return
  }
  
  // 清理之前的可视化
  const existingHelper = window.scene.getObjectByName('CoordinateSystemHelper')
  if (existingHelper) {
    window.scene.remove(existingHelper)
  }
  
  const group = new THREE.Group()
  group.name = 'CoordinateSystemHelper'
  
  // 圆柱中心
  const center = new THREE.Vector3(0, 0, 0)
  const axis = new THREE.Vector3(0, 1, 0)
  const testPoint = new THREE.Vector3(2, 0, 0)
  
  // 计算局部坐标系
  const toPosition = testPoint.clone().sub(center)
  const axialComponent = toPosition.dot(axis)
  const radialVector = toPosition.clone().sub(axis.clone().multiplyScalar(axialComponent))
  
  const normal = radialVector.normalize()
  const tangent = axis.clone().cross(normal).normalize()
  const up = axis.clone()
  
  // 创建箭头辅助器
  const arrowLength = 1
  
  // 法向量 - 红色
  const normalArrow = new THREE.ArrowHelper(normal, testPoint, arrowLength, 0xff0000)
  normalArrow.name = 'Normal'
  group.add(normalArrow)
  
  // 切线 - 绿色
  const tangentArrow = new THREE.ArrowHelper(tangent, testPoint, arrowLength, 0x00ff00)
  tangentArrow.name = 'Tangent'
  group.add(tangentArrow)
  
  // 上方向 - 蓝色
  const upArrow = new THREE.ArrowHelper(up, testPoint, arrowLength, 0x0000ff)
  upArrow.name = 'Up'
  group.add(upArrow)
  
  // 测试点标记
  const pointMarker = new THREE.Mesh(
    new THREE.SphereGeometry(0.1),
    new THREE.MeshBasicMaterial({ color: 0xffff00 })
  )
  pointMarker.position.copy(testPoint)
  group.add(pointMarker)
  
  window.scene.add(group)
  
  console.log('✅ 坐标系可视化已添加到场景')
  console.log('红色箭头: 法向量 (Normal)')
  console.log('绿色箭头: 切线 (Tangent)')
  console.log('蓝色箭头: 上方向 (Up)')
  console.log('黄色球: 测试点')
  
  // 5秒后自动清理
  setTimeout(() => {
    window.scene.remove(group)
  }, 10000)
}

console.log('🔧 矩阵变换测试工具已加载')
console.log('可用函数:')
console.log('  - testCylinderTransform(): 测试变换矩阵计算')
console.log('  - visualizeCoordinateSystem(): 可视化坐标系')