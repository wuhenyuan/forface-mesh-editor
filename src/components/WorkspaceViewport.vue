<template>
  <div class="viewport" ref="container">
    <!-- 浮动 UI -->
    <context-menu @select="handleContextMenuSelect" />
    <color-picker @confirm="handleColorConfirm" />
    <edit-menu 
      @modeChange="handleTransformModeChange"
      @duplicate="handleDuplicate"
      @delete="handleDelete"
    />
    <floating-tooltip />
  </div>
</template>

<script>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { EditorViewer } from '../core/index.js'
import { useEditorStore } from '../store/index.js'
import { ContextMenu, ColorPicker, EditMenu, FloatingTooltip } from './floating/index.js'

export default {
  name: 'WorkspaceViewport',
  components: {
    ContextMenu,
    ColorPicker,
    EditMenu,
    FloatingTooltip
  },
  props: {
    currentTool: {
      type: String,
      default: 'base'
    }
  },
  emits: [
    'textCreated',
    'textSelected',
    'textDeselected',
    'textDeleted',
    'objectSelected',
    'objectDeselected'
  ],
  setup(props, { emit, expose }) {
    const container = ref(null)
    const store = useEditorStore()
    
    let viewer = null
    
    // ==================== 初始化 ====================
    
    const initViewer = () => {
      viewer = new EditorViewer(container.value)
      
      // 创建测试圆柱体
      viewer.createCylinder({ name: 'TestCylinder' })
      
      // 初始化子系统
      viewer.initTextSystem()
      viewer.initObjectSelection()
      
      // 绑定事件
      bindViewerEvents()
      
      // 创建默认文字（开发测试用）
      createInitialText()
      
      // 注册到 store
      store.setWorkspaceRef({ value: getExposedMethods() })
      
      // 挂载到 window 供调试
      if (import.meta.env.DEV) {
        window.viewer = viewer
        window.debugTextData = {
          get textObjects() { return viewer.getTextObjects() },
          get targetMeshes() { return viewer.getMeshes() },
          get surfaceTextManager() { return viewer.getTextManager() }
        }
      }
    }
    
    // ==================== 事件绑定 ====================
    
    const bindViewerEvents = () => {
      // 右键菜单
      viewer.events.on('contextmenu', ({ x, y, target, targetType }) => {
        store.showContextMenu({ x, y, target, targetType })
      })
      
      // 点击事件
      viewer.events.on('click', ({ target, targetType }) => {
        // 点击空白处关闭浮动 UI
        if (!target) {
          store.hideAllFloatingUI()
        }
      })
      
      // 选中事件
      viewer.events.on('select', ({ target, targetType }) => {
        if (targetType === 'object') {
          // 显示编辑菜单
          const rect = container.value.getBoundingClientRect()
          store.showEditMenu({
            x: rect.left + rect.width / 2,
            y: rect.top + 60,
            target
          })
        }
      })
      
      viewer.events.on('deselect', () => {
        store.hideEditMenu()
      })
      
      // 文字事件
      viewer.events.on('textCreated', ({ textObject }) => {
        store.addText(textObject)
        emit('textCreated', textObject)
      })
      
      viewer.events.on('textSelected', ({ textObject }) => {
        store.selectText(textObject)
        emit('textSelected', textObject)
      })
      
      viewer.events.on('textDeselected', ({ textObject }) => {
        store.deselectText()
        emit('textDeselected', textObject)
      })
      
      viewer.events.on('textDeleted', ({ id, textObject }) => {
        store.removeText(id)
        emit('textDeleted', { id, textObject })
      })
      
      // 物体选择事件
      viewer.events.on('objectSelected', ({ object }) => {
        emit('objectSelected', object)
      })
      
      viewer.events.on('objectDeselected', ({ object }) => {
        emit('objectDeselected', object)
      })
      
      // 悬停提示
      viewer.events.on('hover', ({ target, targetType, event }) => {
        if (target?.name) {
          store.showTooltip({
            x: event.clientX,
            y: event.clientY,
            content: target.name
          })
        }
      })
      
      viewer.events.on('hoverEnd', () => {
        store.hideTooltip()
      })
      
      // 删除请求（按 Delete 键）
      viewer.events.on('deleteRequest', ({ target }) => {
        handleDelete(target)
      })
      
      // ESC 键
      viewer.events.on('escape', () => {
        store.hideAllFloatingUI()
      })
    }
    
    // ==================== 右键菜单处理 ====================
    
    const handleContextMenuSelect = ({ key, target, targetType }) => {
      switch (key) {
        case 'editText':
          if (target?.userData?.textId) {
            viewer.selectText(target.userData.textId)
          }
          break
          
        case 'changeColor':
          const currentColor = target?.material?.color?.getHexString?.() || 'ffffff'
          store.showColorPicker({
            x: store.state.contextMenu.x,
            y: store.state.contextMenu.y + 10,
            target,
            currentColor: '#' + currentColor
          })
          break
          
        case 'duplicate':
          handleDuplicate(target)
          break
          
        case 'delete':
          handleDelete(target)
          break
          
        case 'addText':
          viewer.enableTextMode()
          break
          
        case 'select':
          viewer.select(target)
          break
          
        case 'hide':
          viewer.setObjectVisible(target, false)
          break
          
        case 'resetView':
          viewer.resetView()
          break
      }
    }
    
    // ==================== 颜色选择处理 ====================
    
    const handleColorConfirm = ({ color, target }) => {
      if (!target) return
      
      // 判断是文字还是普通对象
      if (target.userData?.isText) {
        const textId = target.userData.textId
        viewer.updateTextColor(textId, color)
      } else {
        viewer.setObjectColor(target, color)
      }
    }
    
    // ==================== 编辑菜单处理 ====================
    
    const handleTransformModeChange = ({ mode, target }) => {
      viewer.setTransformMode(mode)
    }
    
    const handleDuplicate = (target) => {
      // TODO: 实现复制功能
      console.log('复制对象:', target?.name)
    }
    
    const handleDelete = (target) => {
      if (!target) return
      
      if (target.userData?.isText) {
        const textId = target.userData.textId
        viewer.deleteText(textId)
      } else {
        viewer.removeMesh(target)
      }
      
      store.hideEditMenu()
    }
    
    // ==================== 初始文字（开发用） ====================
    
    const createInitialText = async () => {
      const cylinder = viewer.getMeshByName('TestCylinder')
      if (!cylinder) return
      
      try {
        const THREE = await import('three')
        const cylinderCenter = cylinder.position.clone()
        const radius = 5
        
        const hitPoint = new THREE.Vector3(
          cylinderCenter.x,
          cylinderCenter.y,
          cylinderCenter.z + radius
        )
        
        const faceInfo = {
          mesh: cylinder,
          faceIndex: 0,
          face: { normal: new THREE.Vector3(0, 0, 1) },
          point: hitPoint,
          distance: 0,
          uv: new THREE.Vector2(0.5, 0.5)
        }
        
        await viewer.createText('TEST', faceInfo)
        console.log('✅ 默认文字已创建')
      } catch (error) {
        console.error('创建默认文字失败:', error)
      }
    }
    
    // ==================== 工具切换 ====================
    
    watch(() => props.currentTool, (newTool, oldTool) => {
      if (!viewer) return
      
      if (newTool === 'text') {
        viewer.enableTextMode()
      } else if (oldTool === 'text') {
        viewer.disableTextMode()
      }
    })
    
    // ==================== 暴露方法 ====================
    
    const getExposedMethods = () => ({
      // 文字操作
      selectText: (id) => viewer?.selectText(id),
      deleteText: (id) => viewer?.deleteText(id),
      deleteSelectedText: () => {
        const selected = viewer?.getSelectedTextObject()
        if (selected) viewer.deleteText(selected.id)
      },
      updateTextContent: (id, content) => viewer?.updateTextContent(id, content),
      updateTextColor: (id, color) => viewer?.updateTextColor(id, color),
      switchTextMode: (id, mode) => viewer?.switchTextMode(id, mode),
      updateTextConfig: (id, config) => viewer?.updateTextConfig(id, config),
      
      // 圆柱面专用
      updateTextDirection: (id, dir) => viewer?.updateTextConfig(id, { direction: dir }),
      updateLetterSpacing: (id, val) => viewer?.updateTextConfig(id, { letterSpacing: val }),
      updateCurvingStrength: (id, val) => viewer?.updateTextConfig(id, { curvingStrength: val }),
      updateStartAngle: (id, val) => viewer?.updateTextConfig(id, { startAngle: val }),
      
      // 视图操作
      resetView: () => viewer?.resetView(),
      focusOn: (obj) => viewer?.focusOn(obj),
      screenshot: (opts) => viewer?.screenshot(opts),
      
      // 获取数据
      getTextObjects: () => viewer?.getTextObjects() || [],
      getSelectedTextObject: () => viewer?.getSelectedTextObject(),
      getMeshes: () => viewer?.getMeshes() || [],
      
      // 原始 viewer 访问（高级用法）
      getViewer: () => viewer
    })
    
    // 暴露给父组件
    expose(getExposedMethods())
    
    // ==================== 生命周期 ====================
    
    onMounted(() => {
      initViewer()
    })
    
    onBeforeUnmount(() => {
      if (viewer) {
        viewer.dispose()
        viewer = null
      }
    })
    
    return {
      container,
      handleContextMenuSelect,
      handleColorConfirm,
      handleTransformModeChange,
      handleDuplicate,
      handleDelete
    }
  }
}
</script>

<style scoped>
.viewport {
  width: 100%;
  height: 100%;
  position: relative;
  background: #f7f8fa;
  overflow: hidden;
}

.viewport :deep(canvas) {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
