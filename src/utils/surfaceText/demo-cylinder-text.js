/**
 * 圆柱面文字功能演示
 * 展示如何使用圆柱面文字拟合功能
 */
import * as THREE from 'three'
import { cylinderTextTester } from './test-cylinder-text.js'

export class CylinderTextDemo {
  constructor(scene, camera, renderer) {
    this.scene = scene
    this.camera = camera
    this.renderer = renderer
    this.demoObjects = []
  }

  /**
   * 创建演示场景
   */
  createDemoScene() {
    console.log('🎬 创建圆柱面文字演示场景...')

    // 清理之前的演示对象
    this.cleanup()

    // 创建多个不同的圆柱体
    this.createVariousCylinders()

    // 运行测试验证功能
    this.runTests()

    console.log('✅ 演示场景创建完成')
  }

  /**
   * 创建各种圆柱体用于测试
   */
  createVariousCylinders() {
    const cylinders = [
      {
        name: '标准圆柱',
        geometry: new THREE.CylinderGeometry(3, 3, 8, 16),
        position: new THREE.Vector3(-10, 4, 0),
        color: 0x409eff,
        description: '标准圆柱体，适合测试基本功能'
      },
      {
        name: '细长圆柱',
        geometry: new THREE.CylinderGeometry(1.5, 1.5, 12, 12),
        position: new THREE.Vector3(-5, 6, 0),
        color: 0x67c23a,
        description: '细长圆柱体，测试高宽比影响'
      },
      {
        name: '粗短圆柱',
        geometry: new THREE.CylinderGeometry(5, 5, 4, 20),
        position: new THREE.Vector3(0, 2, 0),
        color: 0xe6a23c,
        description: '粗短圆柱体，测试大半径情况'
      },
      {
        name: '高精度圆柱',
        geometry: new THREE.CylinderGeometry(2.5, 2.5, 6, 32),
        position: new THREE.Vector3(5, 3, 0),
        color: 0xf56c6c,
        description: '高精度圆柱体，测试高面数影响'
      },
      {
        name: '倾斜圆柱',
        geometry: new THREE.CylinderGeometry(2, 2, 7, 16),
        position: new THREE.Vector3(10, 3.5, 0),
        color: 0x909399,
        description: '倾斜圆柱体，测试旋转后的检测',
        rotation: new THREE.Euler(0, 0, Math.PI / 6)
      }
    ]

    cylinders.forEach((config, index) => {
      const material = new THREE.MeshStandardMaterial({
        color: config.color,
        roughness: 0.6,
        metalness: 0.2,
        transparent: true,
        opacity: 0.8
      })

      const mesh = new THREE.Mesh(config.geometry, material)
      mesh.position.copy(config.position)
      
      if (config.rotation) {
        mesh.rotation.copy(config.rotation)
      }

      mesh.name = config.name
      mesh.userData = {
        description: config.description,
        demoIndex: index
      }

      mesh.castShadow = true
      mesh.receiveShadow = true

      this.scene.add(mesh)
      this.demoObjects.push(mesh)

      // 添加标签
      this.addLabel(mesh, config.name)

      console.log(`📦 创建演示对象: ${config.name}`)
    })
  }

  /**
   * 添加文字标签
   */
  addLabel(mesh, text) {
    // 创建简单的文字标签（使用CSS2DRenderer会更好，这里用简单方案）
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    canvas.width = 256
    canvas.height = 64
    
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = '#333333'
    context.font = '16px Arial'
    context.textAlign = 'center'
    context.fillText(text, canvas.width / 2, canvas.height / 2 + 6)

    const texture = new THREE.CanvasTexture(canvas)
    const material = new THREE.SpriteMaterial({ map: texture })
    const sprite = new THREE.Sprite(material)
    
    sprite.position.copy(mesh.position)
    sprite.position.y += mesh.geometry.parameters.height / 2 + 2
    sprite.scale.set(4, 1, 1)
    
    this.scene.add(sprite)
    this.demoObjects.push(sprite)
  }

  /**
   * 运行功能测试
   */
  async runTests() {
    console.log('🧪 运行圆柱面文字功能测试...')
    
    try {
      // 运行自动化测试
      const testReport = await cylinderTextTester.runAllTests()
      
      // 创建可视化测试
      const visualTest = cylinderTextTester.createVisualTest(this.scene)
      if (visualTest.mesh) {
        this.demoObjects.push(visualTest.mesh)
      }

      // 输出测试结果
      console.log('📊 测试完成:', testReport.summary)
      
      if (testReport.summary.success) {
        console.log('✅ 所有测试通过，功能正常')
      } else {
        console.warn('⚠️ 部分测试失败，请检查实现')
      }

      return testReport

    } catch (error) {
      console.error('❌ 测试运行失败:', error)
      return null
    }
  }

  /**
   * 演示圆柱面检测
   */
  demonstrateCylinderDetection() {
    console.log('🔍 演示圆柱面检测功能...')

    this.demoObjects.forEach(obj => {
      if (obj.geometry && obj.geometry.type === 'CylinderGeometry') {
        // 检测圆柱面
        const cylinderInfo = cylinderSurfaceHelper.detectCylinder(obj.geometry)
        
        if (cylinderInfo) {
          console.log(`✅ ${obj.name} 检测成功:`, {
            radius: cylinderInfo.radius.toFixed(2),
            height: cylinderInfo.height.toFixed(2),
            confidence: cylinderInfo.confidence.toFixed(3)
          })

          // 可视化圆柱轴
          this.visualizeCylinderAxis(obj, cylinderInfo)
        } else {
          console.log(`❌ ${obj.name} 检测失败`)
        }
      }
    })
  }

  /**
   * 可视化圆柱轴
   */
  visualizeCylinderAxis(cylinderMesh, cylinderInfo) {
    // 创建轴线
    const axisGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -cylinderInfo.height / 2, 0),
      new THREE.Vector3(0, cylinderInfo.height / 2, 0)
    ])
    
    const axisMaterial = new THREE.LineBasicMaterial({ 
      color: 0xff0000,
      linewidth: 3
    })
    
    const axisLine = new THREE.Line(axisGeometry, axisMaterial)
    axisLine.position.copy(cylinderMesh.position)
    axisLine.rotation.copy(cylinderMesh.rotation)
    
    this.scene.add(axisLine)
    this.demoObjects.push(axisLine)

    // 创建中心点标记
    const centerGeometry = new THREE.SphereGeometry(0.1, 8, 6)
    const centerMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 })
    const centerMesh = new THREE.Mesh(centerGeometry, centerMaterial)
    centerMesh.position.copy(cylinderMesh.position)
    
    this.scene.add(centerMesh)
    this.demoObjects.push(centerMesh)
  }

  /**
   * 获取演示统计信息
   */
  getDemoStats() {
    const cylinderCount = this.demoObjects.filter(obj => 
      obj.geometry && obj.geometry.type === 'CylinderGeometry'
    ).length

    return {
      totalObjects: this.demoObjects.length,
      cylinderCount: cylinderCount,
      sceneObjects: this.scene.children.length,
      memoryUsage: this.calculateMemoryUsage()
    }
  }

  /**
   * 计算内存使用量（估算）
   */
  calculateMemoryUsage() {
    let totalVertices = 0
    let totalFaces = 0

    this.demoObjects.forEach(obj => {
      if (obj.geometry) {
        const positions = obj.geometry.attributes.position
        if (positions) {
          totalVertices += positions.count
          totalFaces += obj.geometry.index ? 
            obj.geometry.index.count / 3 : 
            positions.count / 3
        }
      }
    })

    return {
      vertices: totalVertices,
      faces: Math.floor(totalFaces),
      estimatedMB: ((totalVertices * 12 + totalFaces * 6) / 1024 / 1024).toFixed(2)
    }
  }

  /**
   * 清理演示对象
   */
  cleanup() {
    this.demoObjects.forEach(obj => {
      this.scene.remove(obj)
      if (obj.geometry) obj.geometry.dispose()
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach(mat => mat.dispose())
        } else {
          obj.material.dispose()
        }
      }
    })
    this.demoObjects = []
    console.log('🧹 演示场景已清理')
  }

  /**
   * 销毁演示器
   */
  destroy() {
    this.cleanup()
    console.log('💥 圆柱面文字演示器已销毁')
  }
}

// 导出演示器类
export default CylinderTextDemo