<template>
  <div class="viewport" ref="root">
    <canvas ref="canvas"></canvas>
    
    <!-- 面拾取控制面板 -->
    <div v-if="showFacePickingPanel" class="face-picking-panel">
      <div class="panel-header">
        <h4>面拾取</h4>
        <button @click="toggleFacePicking" class="toggle-btn">
          {{ facePickingEnabled ? '禁用' : '启用' }}
        </button>
      </div>
      
      <div class="panel-content">
        <div class="selection-info">
          <p>选择模式: {{ selectionMode }}</p>
          <p>选中面数: {{ selectedFaceCount }}</p>
          <p v-if="hoverFace">悬停: {{ hoverFace.mesh.name }}[{{ hoverFace.faceIndex }}]</p>
          <p v-if="performanceStats.totalOperations > 0" class="performance-info">
            性能: {{ performanceStats.performanceGrade }} 
            ({{ performanceStats.averageResponseTime }}ms)
          </p>
        </div>
        
        <div class="controls">
          <button @click="clearSelection" :disabled="selectedFaceCount === 0">
            清除选择
          </button>
          <button @click="toggleSelectionMode">
            切换到{{ selectionMode === 'single' ? '多选' : '单选' }}
          </button>
        </div>
        
        <div class="color-controls">
          <label>
            选择颜色:
            <input type="color" v-model="selectionColor" @change="updateHighlightColors">
          </label>
          <label>
            悬停颜色:
            <input type="color" v-model="hoverColor" @change="updateHighlightColors">
          </label>
        </div>
      </div>
    </div>
    
    <!-- 文字工具控制面板 -->
    <div v-if="isTextMode" class="text-tool-panel">
      <div class="panel-header">
        <h4>文字工具</h4>
        <button @click="toggleTextMode" class="toggle-btn">
          {{ isTextMode ? '退出' : '启用' }}
        </button>
      </div>
      
      <div class="panel-content">
        <div class="text-info">
          <p>文字模式: {{ isTextMode ? '启用' : '禁用' }}</p>
          <p>文字数量: {{ textCount }}</p>
          <p v-if="hasSelectedText" class="selected-text">
            已选中: {{ getSelectedTextObject()?.content || '未知' }}
          </p>
        </div>
        
        <div class="text-instructions">
          <p class="instruction">点击网格表面添加文字</p>
          <p class="instruction">点击文字对象进行编辑</p>
          <p class="instruction">按Escape键退出文字模式</p>
          <p class="instruction">在右侧属性面板编辑文字属性</p>
        </div>
        
        <div class="text-controls" v-if="hasSelectedText">
          <button @click="deleteSelectedText" class="danger-btn">
            删除选中文字
          </button>
        </div>
        
        <div class="text-stats" v-if="textCount > 0">
          <p class="stats-title">文字统计</p>
          <p class="stats-item">总数: {{ textCount }}</p>
          <p class="stats-item">选中: {{ hasSelectedText ? 1 : 0 }}</p>
        </div>
      </div>
    </div>
    
    <!-- 快捷键提示 -->
    <div v-if="showShortcuts" class="shortcuts-panel">
      <h5>快捷键</h5>
      <ul>
        <li>Escape: 清除选择</li>
        <li>Ctrl+Z: 撤销</li>
        <li>Ctrl+Y: 重做</li>
        <li>Ctrl+点击: 多选</li>
      </ul>
    </div>
  </div>
</template>

<script>
import { onMounted, onBeforeUnmount, ref, reactive, computed, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { FacePicker, FacePickingUtils } from '../utils/facePicking/index.js'
import { SurfaceTextManager, runAllTextSystemTests } from '../utils/surfaceText/index.js'
import { debugFacePicking, testFacePicking } from '../utils/facePicking/debug-face-picking.js'

export default {
  name: 'WorkspaceViewport',
  props: {
    // 面拾取配置
    enableFacePicking: {
      type: Boolean,
      default: true
    },
    showFacePickingPanel: {
      type: Boolean,
      default: true
    },
    showShortcuts: {
      type: Boolean,
      default: false
    },
    // 高亮颜色配置
    defaultSelectionColor: {
      type: String,
      default: '#ff6b35'
    },
    defaultHoverColor: {
      type: String,
      default: '#4fc3f7'
    },
    // 文字工具配置
    enableTextTool: {
      type: Boolean,
      default: true
    },
    currentTool: {
      type: String,
      default: 'base' // 'base' | 'text' | 'ornament' | 'adjust'
    }
  },
  emits: [
    'faceSelected',
    'faceDeselected', 
    'selectionCleared',
    'faceHover',
    'facePickingToggled',
    // 文字相关事件
    'textCreated',
    'textSelected',
    'textDeselected',
    'textDeleted',
    'textModeToggled'
  ],
  setup(props, { emit }) {
    const root = ref(null)
    const canvas = ref(null)
    
    // Three.js 核心对象
    let renderer, scene, camera, controls, animationId
    
    // 面拾取相关
    let facePicker = null
    const meshes = ref([])
    
    // 文字系统相关
    let surfaceTextManager = null
    const textObjects = ref([])
    const selectedTextId = ref(null)
    
    // 响应式状态
    const facePickingState = reactive({
      enabled: props.enableFacePicking,
      selectedFaces: [],
      hoverFace: null,
      selectionMode: 'single'
    })
    
    // 颜色状态
    const colorState = reactive({
      selection: props.defaultSelectionColor,
      hover: props.defaultHoverColor
    })
    
    // 性能状态
    const performanceState = reactive({
      stats: {
        totalOperations: 0,
        averageResponseTime: 0,
        performanceGrade: 'A'
      }
    })
    
    // 文字工具状态
    const textState = reactive({
      enabled: false,
      mode: 'raised', // 'raised' | 'engraved'
      currentTextId: null,
      isTextMode: false
    })
    
    // 计算属性
    const facePickingEnabled = computed(() => facePickingState.enabled)
    const selectedFaceCount = computed(() => facePickingState.selectedFaces.length)
    const selectionMode = computed(() => facePickingState.selectionMode)
    const hoverFace = computed(() => facePickingState.hoverFace)
    const selectionColor = computed({
      get: () => colorState.selection,
      set: (value) => { colorState.selection = value }
    })
    const hoverColor = computed({
      get: () => colorState.hover,
      set: (value) => { colorState.hover = value }
    })
    const performanceStats = computed(() => performanceState.stats)
    
    // 文字相关计算属性
    const isTextMode = computed(() => textState.isTextMode)
    const textCount = computed(() => textObjects.value.length)
    const hasSelectedText = computed(() => !!selectedTextId.value)
    
    // 初始化Three.js场景
    const init = () => {
      const rect = root.value.getBoundingClientRect()
      
      // 创建渲染器
      renderer = new THREE.WebGLRenderer({ 
        canvas: canvas.value, 
        antialias: true,
        preserveDrawingBuffer: true // 支持截图
      })
      renderer.setSize(rect.width, rect.height)
      renderer.setPixelRatio(window.devicePixelRatio)
      renderer.shadowMap.enabled = true
      renderer.shadowMap.type = THREE.PCFSoftShadowMap
      
      // 创建场景
      scene = new THREE.Scene()
      scene.background = new THREE.Color(0xf2f3f5)
      
      // 创建相机
      camera = new THREE.PerspectiveCamera(60, rect.width / rect.height, 0.1, 1000)
      camera.position.set(3, 3, 6)
      
      // 创建控制器
      controls = new OrbitControls(camera, renderer.domElement)
      controls.enableDamping = true
      controls.dampingFactor = 0.05
      
      // 添加光照
      setupLighting()
      
      // 添加网格和对象
      setupScene()
      
      // 初始化面拾取
      if (props.enableFacePicking) {
        initializeFacePicking()
      }
      
      // 初始化文字系统
      if (props.enableTextTool) {
        initializeTextSystem()
      }
      
      // 开始渲染循环
      animate()
      
      // 添加窗口大小变化监听
      window.addEventListener('resize', onResize)
    }
    
    // 设置光照
    const setupLighting = () => {
      // 半球光
      const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1)
      scene.add(hemi)
      
      // 环境光
      const ambient = new THREE.AmbientLight(0xffffff, 0.35)
      scene.add(ambient)
      
      // 方向光
      const dir = new THREE.DirectionalLight(0xffffff, 0.6)
      dir.position.set(5, 10, 7.5)
      dir.castShadow = true
      dir.shadow.mapSize.width = 2048
      dir.shadow.mapSize.height = 2048
      scene.add(dir)
    }
    
    // 设置场景对象
    const setupScene = () => {
      // 添加网格地面
      const grid = new THREE.GridHelper(20, 20, 0xcccccc, 0xeeeeee)
      scene.add(grid)
      
      // 创建测试立方体
      const boxGeometry = new THREE.BoxGeometry(1, 1, 1)
      const boxMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x409eff,
        roughness: 0.7,
        metalness: 0.1
      })
      const boxMesh = new THREE.Mesh(boxGeometry, boxMaterial)
      boxMesh.position.set(0, 0.5, 0)
      boxMesh.name = 'TestBox'
      boxMesh.castShadow = true
      boxMesh.receiveShadow = true
      scene.add(boxMesh)
      meshes.value.push(boxMesh)
      
      // 创建测试圆柱体
      const cylinderGeometry = new THREE.CylinderGeometry(0.5, 0.5, 1.5, 16)
      const cylinderMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x67c23a,
        roughness: 0.6,
        metalness: 0.2
      })
      const cylinderMesh = new THREE.Mesh(cylinderGeometry, cylinderMaterial)
      cylinderMesh.position.set(-2, 0.75, 0)
      cylinderMesh.name = 'TestCylinder'
      cylinderMesh.castShadow = true
      cylinderMesh.receiveShadow = true
      scene.add(cylinderMesh)
      meshes.value.push(cylinderMesh)
      
      // 创建测试球体
      const sphereGeometry = new THREE.SphereGeometry(0.6, 16, 12)
      const sphereMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xe6a23c,
        roughness: 0.5,
        metalness: 0.3
      })
      const sphereMesh = new THREE.Mesh(sphereGeometry, sphereMaterial)
      sphereMesh.position.set(2, 0.6, 0)
      sphereMesh.name = 'TestSphere'
      sphereMesh.castShadow = true
      sphereMesh.receiveShadow = true
      scene.add(sphereMesh)
      meshes.value.push(sphereMesh)
      
      // 加载STL模型（如果存在）
      // loadSTLModel()
    }
    
    // 加载STL模型
    const loadSTLModel = () => {
      const loader = new STLLoader()
      const robotUrl = new URL('../assets/model/机器人.stl', import.meta.url).href
      
      loader.load(
        robotUrl,
        (geometry) => {
          console.log('STL模型加载成功')
          geometry.center()
          
          const material = new THREE.MeshStandardMaterial({ 
            color: 0x999999, 
            roughness: 0.8, 
            metalness: 0.1 
          })
          const robot = new THREE.Mesh(geometry, material)
          
          // 缩放模型
          const box = new THREE.Box3().setFromBufferAttribute(geometry.attributes.position)
          const size = new THREE.Vector3()
          box.getSize(size)
          const maxDim = Math.max(size.x, size.y, size.z) || 1
          const target = 4
          const scaleFactor = target / maxDim
          robot.scale.setScalar(scaleFactor)
          
          robot.position.set(2, 0, 0)
          robot.name = 'RobotModel'
          robot.castShadow = true
          robot.receiveShadow = true
          
          scene.add(robot)
          meshes.value.push(robot)
          
          // 如果面拾取已启用，添加到可拾取列表
          if (facePicker) {
            facePicker.addMesh(robot)
          }
        },
        (progress) => {
          console.log('STL加载进度:', (progress.loaded / progress.total * 100) + '%')
        },
        (error) => {
          console.warn('STL模型加载失败:', error)
        }
      )
    }
    
    // 初始化面拾取
    const initializeFacePicking = () => {
      if (!scene || !camera || !renderer || !root.value) {
        console.warn('Three.js组件未完全初始化，无法创建面拾取器')
        return
      }
      
      try {
        // 创建面拾取器
        facePicker = new FacePicker(scene, camera, renderer, root.value)
        
        // 设置可拾取的网格
        const validMeshes = meshes.value.filter(mesh => 
          FacePickingUtils.validateMesh(mesh)
        )
        facePicker.setMeshes(validMeshes)
        
        // 设置高亮颜色
        updateHighlightColors()
        
        // 设置事件监听器
        setupFacePickingEvents()
        
        // 启用面拾取
        facePicker.enable()
        facePickingState.enabled = true
        
        console.log('面拾取功能已启用，可拾取网格数量:', validMeshes.length)
        
        // 添加调试信息
        debugFacePicking(facePicker, validMeshes)
        
        // 延迟测试，确保所有组件都已初始化
        setTimeout(() => {
          testFacePicking(facePicker, validMeshes)
        }, 1000)
      } catch (error) {
        console.error('面拾取初始化失败:', error)
      }
    }
    
    // 设置面拾取事件监听
    const setupFacePickingEvents = () => {
      if (!facePicker) return
      
      // 面选择事件
      facePicker.on('faceSelected', (faceInfo) => {
        facePickingState.selectedFaces = facePicker.getSelectedFaces()
        emit('faceSelected', faceInfo)
        console.log('面被选中:', faceInfo.mesh.name, faceInfo.faceIndex)
      })
      
      facePicker.on('faceDeselected', (faceInfo) => {
        facePickingState.selectedFaces = facePicker.getSelectedFaces()
        emit('faceDeselected', faceInfo)
        console.log('面被取消选择:', faceInfo.mesh.name, faceInfo.faceIndex)
      })
      
      facePicker.on('selectionCleared', () => {
        facePickingState.selectedFaces = []
        emit('selectionCleared')
        console.log('选择已清除')
      })
      
      // 悬停事件
      facePicker.on('faceHover', (faceInfo) => {
        facePickingState.hoverFace = faceInfo
        emit('faceHover', faceInfo)
      })
      
      facePicker.on('faceHoverEnd', () => {
        facePickingState.hoverFace = null
      })
      
      // 选择模式变化
      facePicker.on('selectionModeChanged', (modeData) => {
        facePickingState.selectionMode = modeData.newMode
      })
      
      // 历史操作事件
      facePicker.on('undoPerformed', () => {
        facePickingState.selectedFaces = facePicker.getSelectedFaces()
        console.log('撤销操作完成')
      })
      
      facePicker.on('redoPerformed', () => {
        facePickingState.selectedFaces = facePicker.getSelectedFaces()
        console.log('重做操作完成')
      })
      
      // 性能监控事件
      facePicker.on('performanceWarning', (data) => {
        console.warn('性能警告:', data)
        updatePerformanceStats()
      })
      
      facePicker.on('error', (errorInfo) => {
        console.error('面拾取错误:', errorInfo)
      })
      
      facePicker.on('fallbackModeEnabled', () => {
        console.warn('面拾取已启用降级模式')
      })
      
      // 定期更新性能统计
      const performanceUpdateInterval = setInterval(() => {
        if (facePicker) {
          updatePerformanceStats()
        }
      }, 2000) // 每2秒更新一次
      
      // 在组件卸载时清理定时器
      onBeforeUnmount(() => {
        clearInterval(performanceUpdateInterval)
      })
    }
    
    // 窗口大小变化处理
    const onResize = () => {
      if (!camera || !renderer || !root.value) return
      
      const rect = root.value.getBoundingClientRect()
      camera.aspect = rect.width / rect.height
      camera.updateProjectionMatrix()
      renderer.setSize(rect.width, rect.height)
    }
    
    // 渲染循环
    const animate = () => {
      animationId = requestAnimationFrame(animate)
      
      if (controls) {
        controls.update()
      }
      
      if (renderer && scene && camera) {
        renderer.render(scene, camera)
      }
    }
    
    // 切换面拾取功能
    const toggleFacePicking = () => {
      if (!facePicker) {
        initializeFacePicking()
        return
      }
      
      if (facePickingState.enabled) {
        facePicker.disable()
        facePickingState.enabled = false
      } else {
        facePicker.enable()
        facePickingState.enabled = true
      }
      
      emit('facePickingToggled', facePickingState.enabled)
    }
    
    // 清除选择
    const clearSelection = () => {
      if (facePicker) {
        facePicker.clearSelection()
      }
    }
    
    // 切换选择模式
    const toggleSelectionMode = () => {
      if (facePicker) {
        const newMode = facePickingState.selectionMode === 'single' ? 'multi' : 'single'
        facePicker.setSelectionMode(newMode)
      }
    }
    
    // 更新高亮颜色
    const updateHighlightColors = () => {
      if (facePicker) {
        const colors = {
          selection: parseInt(colorState.selection.replace('#', ''), 16),
          hover: parseInt(colorState.hover.replace('#', ''), 16)
        }
        facePicker.setHighlightColors(colors)
      }
    }
    
    // 更新性能统计
    const updatePerformanceStats = () => {
      if (facePicker) {
        performanceState.stats = facePicker.getPerformanceStats()
      }
    }
    
    // 监听颜色变化
    watch([() => colorState.selection, () => colorState.hover], updateHighlightColors)
    
    // ==================== 文字系统相关函数 ====================
    
    // 初始化文字系统
    const initializeTextSystem = () => {
      if (!scene || !camera || !renderer || !root.value || !facePicker) {
        console.warn('Three.js组件或面拾取器未完全初始化，无法创建文字系统')
        return
      }
      
      try {
        // 创建文字管理器
        surfaceTextManager = new SurfaceTextManager(scene, camera, renderer, root.value, facePicker)
        
        // 设置事件监听器
        setupTextSystemEvents()
        
        console.log('文字系统已初始化')
        
        // 运行测试（开发模式）
        if (import.meta.env.DEV) {
          setTimeout(() => {
            runAllTextSystemTests().then(results => {
              console.log('文字系统测试完成:', results)
            })
          }, 1000)
        }
        
      } catch (error) {
        console.error('文字系统初始化失败:', error)
      }
    }
    
    // 设置文字系统事件监听
    const setupTextSystemEvents = () => {
      if (!surfaceTextManager) return
      
      // 文字创建事件
      surfaceTextManager.on('textCreated', (textObject) => {
        textObjects.value.push(textObject)
        emit('textCreated', textObject)
        console.log('文字已创建:', textObject.content)
      })
      
      // 文字选择事件
      surfaceTextManager.on('textSelected', (textObject) => {
        selectedTextId.value = textObject.id
        textState.currentTextId = textObject.id
        emit('textSelected', textObject)
        console.log('文字已选中:', textObject.content)
      })
      
      // 文字取消选择事件
      surfaceTextManager.on('textDeselected', (textObject) => {
        selectedTextId.value = null
        textState.currentTextId = null
        emit('textDeselected', textObject)
        console.log('文字已取消选择:', textObject.content)
      })
      
      // 文字删除事件
      surfaceTextManager.on('textDeleted', ({ id, textObject }) => {
        const index = textObjects.value.findIndex(obj => obj.id === id)
        if (index !== -1) {
          textObjects.value.splice(index, 1)
        }
        if (selectedTextId.value === id) {
          selectedTextId.value = null
          textState.currentTextId = null
        }
        emit('textDeleted', { id, textObject })
        console.log('文字已删除:', textObject.content)
      })
      
      // 文字模式切换事件
      surfaceTextManager.on('textModeEnabled', () => {
        textState.isTextMode = true
        emit('textModeToggled', true)
        console.log('文字添加模式已启用')
      })
      
      surfaceTextManager.on('textModeDisabled', () => {
        textState.isTextMode = false
        emit('textModeToggled', false)
        console.log('文字添加模式已禁用')
      })
      
      // 错误处理
      surfaceTextManager.on('error', (errorData) => {
        console.error('文字系统错误:', errorData)
      })
    }
    
    // 启用文字添加模式
    const enableTextMode = () => {
      if (surfaceTextManager) {
        surfaceTextManager.enableTextMode()
      }
    }
    
    // 禁用文字添加模式
    const disableTextMode = () => {
      if (surfaceTextManager) {
        surfaceTextManager.disableTextMode()
      }
    }
    
    // 切换文字模式
    const toggleTextMode = () => {
      if (textState.isTextMode) {
        disableTextMode()
      } else {
        enableTextMode()
      }
    }
    
    // 删除选中的文字
    const deleteSelectedText = () => {
      if (selectedTextId.value && surfaceTextManager) {
        surfaceTextManager.deleteText(selectedTextId.value)
      }
    }
    
    // 获取选中的文字对象
    const getSelectedTextObject = () => {
      if (selectedTextId.value && surfaceTextManager) {
        return surfaceTextManager.getSelectedTextObject()
      }
      return null
    }
    
    // 更新文字内容
    const updateTextContent = async (textId, newContent) => {
      if (surfaceTextManager) {
        try {
          await surfaceTextManager.updateTextContent(textId, newContent)
        } catch (error) {
          console.error('更新文字内容失败:', error)
        }
      }
    }
    
    // 更新文字颜色
    const updateTextColor = (textId, color) => {
      if (surfaceTextManager) {
        const colorHex = typeof color === 'string' ? parseInt(color.replace('#', ''), 16) : color
        surfaceTextManager.updateTextColor(textId, colorHex)
      }
    }
    
    // 切换文字雕刻模式
    const switchTextMode = async (textId, mode) => {
      if (surfaceTextManager) {
        try {
          await surfaceTextManager.switchTextMode(textId, mode)
        } catch (error) {
          console.error('切换文字模式失败:', error)
        }
      }
    }
    
    // 更新文字字体
    const updateTextFont = async (textId, font) => {
      if (surfaceTextManager) {
        try {
          await surfaceTextManager.updateTextConfig(textId, { font })
        } catch (error) {
          console.error('更新文字字体失败:', error)
        }
      }
    }
    
    // 更新文字大小
    const updateTextSize = async (textId, size) => {
      if (surfaceTextManager) {
        try {
          await surfaceTextManager.updateTextConfig(textId, { size })
        } catch (error) {
          console.error('更新文字大小失败:', error)
        }
      }
    }
    
    // 更新文字厚度
    const updateTextThickness = async (textId, thickness) => {
      if (surfaceTextManager) {
        try {
          await surfaceTextManager.updateTextConfig(textId, { thickness })
        } catch (error) {
          console.error('更新文字厚度失败:', error)
        }
      }
    }
    
    // 监听当前工具变化
    watch(() => props.currentTool, (newTool, oldTool) => {
      if (newTool === 'text') {
        enableTextMode()
      } else if (oldTool === 'text') {
        disableTextMode()
      }
    })
    
    // 组件挂载
    onMounted(() => {
      init()
    })
    
    // 组件卸载
    onBeforeUnmount(() => {
      // 清理动画
      if (animationId) {
        cancelAnimationFrame(animationId)
      }
      
      // 清理事件监听器
      window.removeEventListener('resize', onResize)
      
      // 清理面拾取器
      if (facePicker) {
        facePicker.destroy()
      }
      
      // 清理Three.js资源
      if (controls) {
        controls.dispose()
      }
      
      if (renderer) {
        renderer.dispose()
      }
      
      // 清理网格资源
      meshes.value.forEach(mesh => {
        if (mesh.geometry) mesh.geometry.dispose()
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach(mat => mat.dispose())
          } else {
            mesh.material.dispose()
          }
        }
      })
    })
    
    // 暴露给模板的数据和方法
    return {
      root,
      canvas,
      
      // 面拾取状态
      facePickingEnabled,
      selectedFaceCount,
      selectionMode,
      hoverFace,
      selectionColor,
      hoverColor,
      performanceStats,
      
      // 文字系统状态
      isTextMode,
      textCount,
      hasSelectedText,
      textObjects,
      selectedTextId,
      
      // 面拾取方法
      toggleFacePicking,
      clearSelection,
      toggleSelectionMode,
      updateHighlightColors,
      
      // 文字系统方法
      toggleTextMode,
      enableTextMode,
      disableTextMode,
      deleteSelectedText,
      getSelectedTextObject,
      updateTextContent,
      updateTextColor,
      switchTextMode,
      updateTextFont,
      updateTextSize,
      updateTextThickness
    }
  }
}
</script>

<style scoped>
.viewport {
  height: 100%;
  width: 100%;
  position: relative;
  background: #fff;
}

canvas {
  width: 100%;
  height: 100%;
  display: block;
}

/* 面拾取控制面板 */
.face-picking-panel {
  position: absolute;
  top: 10px;
  right: 10px;
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 12px;
  min-width: 200px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(4px);
  font-size: 12px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid #eee;
}

.panel-header h4 {
  margin: 0;
  font-size: 14px;
  color: #333;
}

.toggle-btn {
  padding: 4px 8px;
  font-size: 11px;
  border: 1px solid #409eff;
  background: #409eff;
  color: white;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.toggle-btn:hover {
  background: #66b1ff;
}

.panel-content {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.selection-info p {
  margin: 2px 0;
  color: #666;
  font-size: 11px;
}

.performance-info {
  font-weight: bold;
}

.performance-info[data-grade="A"] { color: #67c23a; }
.performance-info[data-grade="B"] { color: #e6a23c; }
.performance-info[data-grade="C"] { color: #f56c6c; }
.performance-info[data-grade="D"] { color: #f56c6c; }

.controls {
  display: flex;
  gap: 6px;
}

.controls button {
  flex: 1;
  padding: 6px 8px;
  font-size: 10px;
  border: 1px solid #ddd;
  background: #f5f5f5;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.controls button:hover:not(:disabled) {
  background: #e6f7ff;
  border-color: #409eff;
}

.controls button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.color-controls {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.color-controls label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 10px;
  color: #666;
}

.color-controls input[type="color"] {
  width: 30px;
  height: 20px;
  border: none;
  border-radius: 3px;
  cursor: pointer;
}

/* 快捷键面板 */
.shortcuts-panel {
  position: absolute;
  bottom: 10px;
  left: 10px;
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 10px;
  border-radius: 6px;
  font-size: 11px;
  backdrop-filter: blur(4px);
}

.shortcuts-panel h5 {
  margin: 0 0 8px 0;
  font-size: 12px;
}

.shortcuts-panel ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

.shortcuts-panel li {
  margin: 2px 0;
  font-family: monospace;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .face-picking-panel {
    top: 5px;
    right: 5px;
    min-width: 160px;
    font-size: 11px;
  }
  
  .shortcuts-panel {
    bottom: 5px;
    left: 5px;
    font-size: 10px;
  }
}

/* 动画效果 */
.face-picking-panel,
.shortcuts-panel,
.text-tool-panel {
  animation: fadeIn 0.3s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 文字工具面板 */
.text-tool-panel {
  position: absolute;
  top: 10px;
  left: 10px;
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 12px;
  min-width: 200px;
  max-width: 280px;
  font-size: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(4px);
}

.text-info p {
  margin: 2px 0;
  color: #666;
  font-size: 11px;
}

.text-instructions {
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 4px;
  padding: 8px;
  margin: 8px 0;
}

.instruction {
  margin: 2px 0;
  color: #0369a1;
  font-size: 11px;
  font-style: italic;
}

.text-controls {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.danger-btn {
  padding: 4px 8px;
  font-size: 11px;
  border: 1px solid #f56565;
  background: #f56565;
  color: white;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.danger-btn:hover {
  background: #e53e3e;
}

.danger-btn:disabled {
  background: #cbd5e0;
  border-color: #cbd5e0;
  cursor: not-allowed;
}

.selected-text {
  color: #409eff !important;
  font-weight: bold;
}

.text-stats {
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 4px;
  padding: 8px;
  margin-top: 8px;
}

.stats-title {
  margin: 0 0 4px 0;
  font-weight: bold;
  color: #495057;
  font-size: 11px;
}

.stats-item {
  margin: 2px 0;
  color: #6c757d;
  font-size: 10px;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 高亮状态指示 */
.panel-header::before {
  content: '';
  position: absolute;
  top: -2px;
  left: -2px;
  right: -2px;
  bottom: -2px;
  background: linear-gradient(45deg, #409eff, #67c23a);
  border-radius: 10px;
  z-index: -1;
  opacity: 0;
  transition: opacity 0.3s;
}

.face-picking-panel.active .panel-header::before {
  opacity: 0.3;
}
</style>
