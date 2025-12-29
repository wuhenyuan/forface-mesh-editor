/**
 * 曲面文字拟合流程演示
 * 逐步展示整个拟合过程的各个阶段
 */
import * as THREE from 'three'
import { cylinderSurfaceHelper } from './CylinderSurfaceHelper.js'
import { curvedTextGeometry } from './CurvedTextGeometry.js'

export class WorkflowDemo {
  constructor(scene, camera, renderer) {
    this.scene = scene
    this.camera = camera
    this.renderer = renderer
    this.demoObjects = []
    this.currentStep = 0
    this.steps = []
    this.isPlaying = false
  }

  /**
   * 初始化演示流程
   */
  initializeDemo() {
    console.log('🎬 初始化曲面文字拟合流程演示...')

    // 清理之前的演示对象
    this.cleanup()

    // 定义演示步骤
    this.steps = [
      {
        name: '步骤1: 创建目标圆柱体',
        description: '创建一个标准圆柱体作为文字附着的目标表面',
        action: this.step1_CreateTargetCylinder.bind(this),
        duration: 2000
      },
      {
        name: '步骤2: 射线投射检测',
        description: '模拟用户点击，进行射线投射检测交点',
        action: this.step2_RaycastDetection.bind(this),
        duration: 1500
      },
      {
        name: '步骤3: 表面类型分析',
        description: '分析几何体类型，检测是否为圆柱面',
        action: this.step3_SurfaceAnalysis.bind(this),
        duration: 2000
      },
      {
        name: '步骤4: 文字路径规划',
        description: '计算文字在圆柱面上的分布路径',
        action: this.step4_PathPlanning.bind(this),
        duration: 2500
      },
      {
        name: '步骤5: 字符几何体生成',
        description: '为每个字符创建基础的3D几何体',
        action: this.step5_CharacterGeneration.bind(this),
        duration: 2000
      },
      {
        name: '步骤6: 曲面变形处理',
        description: '将平面字符变形以适应圆柱面',
        action: this.step6_SurfaceDeformation.bind(this),
        duration: 3000
      },
      {
        name: '步骤7: 几何体合并',
        description: '将所有字符几何体合并为单一网格',
        action: this.step7_GeometryMerging.bind(this),
        duration: 1500
      },
      {
        name: '步骤8: 最终定位和渲染',
        description: '将文字定位到圆柱面并应用材质',
        action: this.step8_FinalPositioning.bind(this),
        duration: 2000
      }
    ]

    console.log(`✅ 演示流程初始化完成，共 ${this.steps.length} 个步骤`)
  }

  /**
   * 开始播放演示
   */
  async playDemo() {
    if (this.isPlaying) {
      console.warn('演示已在播放中')
      return
    }

    this.isPlaying = true
    this.currentStep = 0

    console.log('▶️ 开始播放曲面文字拟合流程演示')

    for (let i = 0; i < this.steps.length; i++) {
      this.currentStep = i
      const step = this.steps[i]

      console.log(`\n🎯 ${step.name}`)
      console.log(`   ${step.description}`)

      try {
        // 执行步骤
        await step.action()
        
        // 等待指定时间
        await this.wait(step.duration)

      } catch (error) {
        console.error(`❌ 步骤 ${i + 1} 执行失败:`, error)
        break
      }
    }

    this.isPlaying = false
    console.log('🎉 演示播放完成')
  }

  /**
   * 步骤1: 创建目标圆柱体
   */
  async step1_CreateTargetCylinder() {
    // 创建圆柱几何体
    const cylinderGeometry = new THREE.CylinderGeometry(4, 4, 8, 16)
    const cylinderMaterial = new THREE.MeshStandardMaterial({
      color: 0x409eff,
      transparent: true,
      opacity: 0.7,
      wireframe: false
    })

    const cylinderMesh = new THREE.Mesh(cylinderGeometry, cylinderMaterial)
    cylinderMesh.position.set(0, 4, 0)
    cylinderMesh.name = 'TargetCylinder'

    this.scene.add(cylinderMesh)
    this.demoObjects.push(cylinderMesh)

    // 添加标签
    this.addLabel(cylinderMesh.position.clone().add(new THREE.Vector3(0, 5, 0)), '目标圆柱体')

    // 存储圆柱信息供后续步骤使用
    this.targetCylinder = cylinderMesh
    this.cylinderInfo = {
      center: new THREE.Vector3(0, 4, 0),
      axis: new THREE.Vector3(0, 1, 0),
      radius: 4,
      height: 8
    }
  }

  /**
   * 步骤2: 射线投射检测
   */
  async step2_RaycastDetection() {
    // 模拟点击位置
    const clickPoint = new THREE.Vector3(4, 4, 0) // 圆柱表面上的点

    // 创建射线可视化
    const rayOrigin = this.camera.position.clone()
    const rayDirection = clickPoint.clone().sub(rayOrigin).normalize()

    const rayGeometry = new THREE.BufferGeometry().setFromPoints([
      rayOrigin,
      clickPoint
    ])
    const rayMaterial = new THREE.LineBasicMaterial({ 
      color: 0xff0000,
      linewidth: 2
    })
    const rayLine = new THREE.Line(rayGeometry, rayMaterial)

    this.scene.add(rayLine)
    this.demoObjects.push(rayLine)

    // 创建交点标记
    const intersectionGeometry = new THREE.SphereGeometry(0.2, 8, 6)
    const intersectionMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 })
    const intersectionMesh = new THREE.Mesh(intersectionGeometry, intersectionMaterial)
    intersectionMesh.position.copy(clickPoint)

    this.scene.add(intersectionMesh)
    this.demoObjects.push(intersectionMesh)

    // 存储交点信息
    this.intersectionPoint = clickPoint
    this.addLabel(clickPoint.clone().add(new THREE.Vector3(0, 1, 0)), '射线交点')
  }

  /**
   * 步骤3: 表面类型分析
   */
  async step3_SurfaceAnalysis() {
    // 检测圆柱面
    const detectedInfo = cylinderSurfaceHelper.detectCylinder(this.targetCylinder.geometry)

    if (detectedInfo) {
      console.log('✅ 检测到圆柱面:', detectedInfo)

      // 可视化圆柱轴
      const axisGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 8, 0)
      ])
      const axisMaterial = new THREE.LineBasicMaterial({ 
        color: 0x00ff00,
        linewidth: 3
      })
      const axisLine = new THREE.Line(axisGeometry, axisMaterial)
      axisLine.position.copy(this.cylinderInfo.center)

      this.scene.add(axisLine)
      this.demoObjects.push(axisLine)

      // 可视化检测结果
      this.addLabel(
        this.cylinderInfo.center.clone().add(new THREE.Vector3(2, 0, 0)), 
        `圆柱面检测\n半径: ${detectedInfo.radius.toFixed(1)}\n置信度: ${(detectedInfo.confidence * 100).toFixed(1)}%`
      )
    }
  }

  /**
   * 步骤4: 文字路径规划
   */
  async step4_PathPlanning() {
    const text = 'DEMO'
    
    // 生成文字路径
    const textPath = cylinderSurfaceHelper.generateTextPath(
      text,
      this.intersectionPoint,
      this.cylinderInfo,
      {
        fontSize: 1,
        letterSpacing: 0.2,
        direction: 1
      }
    )

    // 可视化路径点
    for (let i = 0; i < textPath.length; i++) {
      const pathPoint = textPath[i]
      
      // 创建路径点标记
      const pointGeometry = new THREE.SphereGeometry(0.15, 8, 6)
      const pointMaterial = new THREE.MeshBasicMaterial({ 
        color: new THREE.Color().setHSL(i / textPath.length, 1, 0.5)
      })
      const pointMesh = new THREE.Mesh(pointGeometry, pointMaterial)
      pointMesh.position.copy(pathPoint.position)

      this.scene.add(pointMesh)
      this.demoObjects.push(pointMesh)

      // 添加字符标签
      this.addLabel(
        pathPoint.position.clone().add(new THREE.Vector3(0, 0.5, 0)), 
        pathPoint.char
      )

      // 可视化法向量
      const normalGeometry = new THREE.BufferGeometry().setFromPoints([
        pathPoint.position,
        pathPoint.position.clone().add(pathPoint.normal.clone().multiplyScalar(0.5))
      ])
      const normalMaterial = new THREE.LineBasicMaterial({ color: 0x00ffff })
      const normalLine = new THREE.Line(normalGeometry, normalMaterial)

      this.scene.add(normalLine)
      this.demoObjects.push(normalLine)
    }

    this.textPath = textPath
  }

  /**
   * 步骤5: 字符几何体生成
   */
  async step5_CharacterGeneration() {
    // 模拟字符几何体生成
    this.characterGeometries = []

    for (let i = 0; i < this.textPath.length; i++) {
      const pathPoint = this.textPath[i]
      
      // 创建简单的立方体代表字符几何体
      const charGeometry = new THREE.BoxGeometry(0.8, 1, 0.2)
      const charMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(i / this.textPath.length, 0.7, 0.6),
        transparent: true,
        opacity: 0.8
      })
      const charMesh = new THREE.Mesh(charGeometry, charMaterial)
      
      // 暂时放置在路径点位置
      charMesh.position.copy(pathPoint.position)
      charMesh.position.add(new THREE.Vector3(0, 0, 2)) // 偏移显示

      this.scene.add(charMesh)
      this.demoObjects.push(charMesh)

      this.characterGeometries.push(charMesh)

      // 添加延迟以显示逐个生成的效果
      await this.wait(300)
    }
  }

  /**
   * 步骤6: 曲面变形处理
   */
  async step6_SurfaceDeformation() {
    // 模拟变形过程
    for (let i = 0; i < this.characterGeometries.length; i++) {
      const charMesh = this.characterGeometries[i]
      const pathPoint = this.textPath[i]

      // 创建变形动画
      const startPosition = charMesh.position.clone()
      const endPosition = pathPoint.position.clone()
      const startRotation = charMesh.rotation.clone()
      
      // 计算目标旋转
      const normal = pathPoint.normal
      const tangent = pathPoint.tangent || new THREE.Vector3(1, 0, 0)
      const binormal = normal.clone().cross(tangent).normalize()
      
      const rotationMatrix = new THREE.Matrix4()
      rotationMatrix.makeBasis(tangent, binormal, normal)
      
      const endRotation = new THREE.Euler().setFromRotationMatrix(rotationMatrix)

      // 执行变形动画
      const animationDuration = 1000
      const startTime = Date.now()

      const animate = () => {
        const elapsed = Date.now() - startTime
        const progress = Math.min(elapsed / animationDuration, 1)
        const easeProgress = this.easeInOutCubic(progress)

        // 插值位置
        charMesh.position.lerpVectors(startPosition, endPosition, easeProgress)
        
        // 插值旋转
        charMesh.rotation.x = startRotation.x + (endRotation.x - startRotation.x) * easeProgress
        charMesh.rotation.y = startRotation.y + (endRotation.y - startRotation.y) * easeProgress
        charMesh.rotation.z = startRotation.z + (endRotation.z - startRotation.z) * easeProgress

        if (progress < 1) {
          requestAnimationFrame(animate)
        }
      }

      animate()
      await this.wait(200) // 错开动画时间
    }

    await this.wait(1000) // 等待所有动画完成
  }

  /**
   * 步骤7: 几何体合并
   */
  async step7_GeometryMerging() {
    // 创建合并后的几何体可视化
    const mergedGeometry = new THREE.BoxGeometry(4, 1, 0.2)
    const mergedMaterial = new THREE.MeshStandardMaterial({
      color: 0x67c23a,
      transparent: true,
      opacity: 0.9
    })
    const mergedMesh = new THREE.Mesh(mergedGeometry, mergedMaterial)

    // 计算合并位置（所有字符的中心）
    const centerPosition = new THREE.Vector3()
    for (const charMesh of this.characterGeometries) {
      centerPosition.add(charMesh.position)
    }
    centerPosition.divideScalar(this.characterGeometries.length)
    
    mergedMesh.position.copy(centerPosition)

    // 隐藏单独的字符
    for (const charMesh of this.characterGeometries) {
      charMesh.visible = false
    }

    this.scene.add(mergedMesh)
    this.demoObjects.push(mergedMesh)
    this.mergedTextMesh = mergedMesh

    this.addLabel(centerPosition.clone().add(new THREE.Vector3(0, 1, 0)), '合并后的文字')
  }

  /**
   * 步骤8: 最终定位和渲染
   */
  async step8_FinalPositioning() {
    if (this.mergedTextMesh) {
      // 应用最终材质
      this.mergedTextMesh.material = new THREE.MeshPhongMaterial({
        color: 0xffffff,
        shininess: 30
      })

      // 启用阴影
      this.mergedTextMesh.castShadow = true

      // 添加完成标记
      this.addLabel(
        this.mergedTextMesh.position.clone().add(new THREE.Vector3(0, 2, 0)), 
        '✅ 曲面文字拟合完成'
      )
    }

    console.log('🎉 曲面文字拟合流程演示完成')
  }

  /**
   * 添加文字标签
   */
  addLabel(position, text) {
    // 创建简单的文字标签（实际项目中可能使用CSS2DRenderer）
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    canvas.width = 256
    canvas.height = 128
    
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = '#333333'
    context.font = '14px Arial'
    context.textAlign = 'center'
    
    const lines = text.split('\n')
    lines.forEach((line, index) => {
      context.fillText(line, canvas.width / 2, 30 + index * 20)
    })

    const texture = new THREE.CanvasTexture(canvas)
    const material = new THREE.SpriteMaterial({ map: texture })
    const sprite = new THREE.Sprite(material)
    
    sprite.position.copy(position)
    sprite.scale.set(2, 1, 1)
    
    this.scene.add(sprite)
    this.demoObjects.push(sprite)
  }

  /**
   * 缓动函数
   */
  easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
  }

  /**
   * 等待指定时间
   */
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * 获取当前步骤信息
   */
  getCurrentStepInfo() {
    if (this.currentStep >= 0 && this.currentStep < this.steps.length) {
      return {
        step: this.currentStep + 1,
        total: this.steps.length,
        name: this.steps[this.currentStep].name,
        description: this.steps[this.currentStep].description,
        progress: (this.currentStep / this.steps.length * 100).toFixed(1)
      }
    }
    return null
  }

  /**
   * 跳转到指定步骤
   */
  async jumpToStep(stepIndex) {
    if (stepIndex < 0 || stepIndex >= this.steps.length) {
      console.warn('无效的步骤索引:', stepIndex)
      return
    }

    this.cleanup()
    this.currentStep = stepIndex

    // 执行到指定步骤的所有步骤
    for (let i = 0; i <= stepIndex; i++) {
      try {
        await this.steps[i].action()
      } catch (error) {
        console.error(`执行步骤 ${i + 1} 失败:`, error)
        break
      }
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
    this.characterGeometries = []
    this.textPath = null
    this.mergedTextMesh = null
  }

  /**
   * 销毁演示器
   */
  destroy() {
    this.cleanup()
    this.isPlaying = false
    console.log('💥 曲面文字拟合流程演示器已销毁')
  }
}

// 导出演示器类
export default WorkflowDemo