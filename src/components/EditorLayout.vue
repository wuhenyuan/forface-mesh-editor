<template>
  <div class="editor-root">
    <toolbar-panel 
      @save="handleSave"
      @export="handleExport"
      @undo="handleUndo"
      @redo="handleRedo"
    />
    <div class="editor-body">
      <feature-panel />
      <feature-menu v-if="shouldShowMenu" :base-list="baseList" @select="onMenuSelect" />
      <div class="workspace" :class="{ 'no-menu': !shouldShowMenu }">
        <workspace-viewport 
          ref="workspaceRef" 
          :current-tool="currentFeature"
          :config="config"
          :origin-path="originPath"
          @ready="handleReady"
          @error="handleError"
        />
      </div>
      <property-panel />
    </div>
  </div>
</template>

<script>
import { computed, ref, onMounted, watch } from 'vue'
import { useEditorStore } from '../store'
import ToolbarPanel from './ToolbarPanel.vue'
import FeaturePanel from './FeaturePanel.vue'
import FeatureMenu from './FeatureMenu.vue'
import PropertyPanel from './PropertyPanel.vue'
import WorkspaceViewport from './WorkspaceViewport.vue'

export default {
  name: 'EditorLayout',
  components: {
    ToolbarPanel,
    FeaturePanel,
    FeatureMenu,
    PropertyPanel,
    WorkspaceViewport
  },
  
  props: {
    /**
     * 已有项目配置（编辑模式）
     * 从后端加载的完整配置，包含模型路径、文字、底座等
     */
    config: {
      type: Object,
      default: null
    },
    
    /**
     * 原始模型路径（新建模式）
     * 首次打开时，仅传入原始模型路径
     */
    originPath: {
      type: String,
      default: ''
    },
    
    /**
     * 底座列表（来自业务 API）
     */
    baseList: {
      type: Array,
      default: () => []
    },
    
    /**
     * 业务接口桥接
     * 提供保存、上传、分享等业务能力
     */
    businessBridge: {
      type: Object,
      default: null
      // {
      //   saveProject: (config) => Promise<void>,
      //   uploadModel: (blob) => Promise<string>,
      //   getShareLink: (projectId) => Promise<string>
      // }
    }
  },
  
  emits: [
    /**
     * 编辑器就绪
     * @param {EditorApp} editor - 编辑器实例
     */
    'ready',
    
    /**
     * 保存项目
     * @param {Object} config - 当前项目配置
     */
    'save',
    
    /**
     * 导出模型
     * @param {Blob} blob - 导出的模型文件
     * @param {string} format - 导出格式 (glb/gltf/obj/stl)
     */
    'export',
    
    /**
     * 脏状态变化
     * @param {boolean} dirty - 是否有未保存的修改
     */
    'dirty-change',
    
    /**
     * 错误发生
     * @param {Error} error - 错误对象
     */
    'error',
    
    /**
     * 文字列表变化
     * @param {Array} texts - 文字列表
     */
    'text-change',
    
    /**
     * 选中状态变化
     * @param {Object} selection - { textId, objectId }
     */
    'selection-change',
    
    /**
     * 视图模式变化
     * @param {string} mode - 'construct' | 'result'
     */
    'view-mode-change'
  ],

  setup(props, { emit }) {
    const store = useEditorStore()
    const workspaceRef = ref(null)
    
    const shouldShowMenu = computed(() => store.shouldShowMenu())
    const currentFeature = computed(() => store.state.currentFeature)
    
    // ==================== 事件处理 ====================
    
    // 编辑器就绪
    const handleReady = (editor) => {
      emit('ready', editor)
    }
    
    // 错误处理
    const handleError = (error) => {
      emit('error', error)
    }
    
    // 保存
    const handleSave = async () => {
      try {
        const editor = workspaceRef.value?.getViewer?.()
        if (!editor) return
        
        const config = editor.projectManager?.exportConfig?.() || {}
        
        // 如果有业务桥接，调用保存接口
        if (props.businessBridge?.saveProject) {
          await props.businessBridge.saveProject(config)
        }
        
        emit('save', config)
      } catch (error) {
        emit('error', error)
      }
    }
    
    // 导出
    const handleExport = async (format = 'glb') => {
      try {
        const editor = workspaceRef.value?.getViewer?.()
        if (!editor) return
        
        const blob = await editor.exportScene?.(format)
        emit('export', blob, format)
      } catch (error) {
        emit('error', error)
      }
    }
    
    // 撤销
    const handleUndo = () => {
      store.undo()
    }
    
    // 重做
    const handleRedo = () => {
      store.redo()
    }
    
    // 菜单选择处理
    const onMenuSelect = (item, featureType) => {
      console.log('选中菜单项:', item, '功能类型:', featureType)
      // TODO: 根据选中的底座类型加载对应的 3D 模型
    }
    
    // ==================== 状态监听 ====================
    
    // 监听文字列表变化
    watch(
      () => store.state.textList,
      (texts) => {
        emit('text-change', texts)
      },
      { deep: true }
    )
    
    // 监听选中状态变化
    watch(
      () => store.state.selectedTextObject,
      (selected) => {
        emit('selection-change', {
          textId: selected?.id || null,
          objectId: null
        })
      }
    )
    
    // 监听视图模式变化
    watch(
      () => store.state.viewMode,
      (mode) => {
        emit('view-mode-change', mode)
      }
    )
    
    // 监听脏状态（简化实现：有撤销栈就是脏）
    watch(
      () => store.state.history.undoCount,
      (count) => {
        emit('dirty-change', count > 0)
      }
    )
    
    // ==================== 暴露方法 ====================
    
    /**
     * 获取编辑器实例
     */
    const getEditor = () => {
      return workspaceRef.value?.getViewer?.()
    }
    
    /**
     * 获取当前配置
     */
    const getConfig = () => {
      const editor = getEditor()
      return editor?.projectManager?.exportConfig?.() || null
    }
    
    /**
     * 检查是否需要更新
     */
    const checkNeedsUpdate = (savedIdentifier) => {
      const editor = getEditor()
      return editor?.checkNeedsUpdate?.(savedIdentifier) || { needsUpdate: false }
    }
    
    onMounted(() => {
      // workspaceRef 已通过 store.setWorkspaceRef 注册
    })
    
    return {
      // refs
      workspaceRef,
      
      // computed
      shouldShowMenu,
      currentFeature,
      
      // 从 props 透传
      baseList: computed(() => props.baseList),
      
      // handlers
      handleReady,
      handleError,
      handleSave,
      handleExport,
      handleUndo,
      handleRedo,
      onMenuSelect,
      
      // exposed methods
      getEditor,
      getConfig,
      checkNeedsUpdate
    }
  }
}
</script>

<style scoped>
.editor-root {
  display: grid;
  grid-template-rows: var(--header-height) 1fr;
  height: 100vh;
}
.editor-body {
  display: grid;
  grid-template-columns: var(--aside1-width) var(--aside2-width) 1fr var(--right-width);
  height: calc(100vh - var(--header-height));
}
/* 当功能菜单隐藏时，workspace 占据更多空间 */
.editor-body:has(.workspace.no-menu) {
  grid-template-columns: var(--aside1-width) 1fr var(--right-width);
}
.workspace {
  background: #f7f8fa;
}
.workspace.no-menu {
  grid-column: 2 / 3;
}
:root,
.editor-root {
  --header-height: 56px;
  --aside1-width: 120px;
  --aside2-width: 300px;
  --right-width: 320px;
}
</style>
