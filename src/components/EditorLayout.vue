<template>
  <div class="editor-root">
    <toolbar-panel />
    <div class="editor-body">
      <feature-panel />
      <feature-menu v-if="shouldShowMenu" @select="onMenuSelect" />
      <div class="workspace" :class="{ 'no-menu': !shouldShowMenu }">
        <workspace-viewport ref="workspaceRef" :current-tool="currentFeature" />
      </div>
      <property-panel />
    </div>
  </div>
</template>

<script>
import { computed, ref, onMounted, watch } from 'vue'
import { useEditorStore } from '../store/index.js'
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
  setup() {
    const store = useEditorStore()
    const workspaceRef = ref(null)
    
    const shouldShowMenu = computed(() => store.shouldShowMenu())
    const currentFeature = computed(() => store.state.currentFeature)
    
    // 测试 watch 监听 store
    watch(
      () => store.shouldShowMenu(),
      (newVal, oldVal) => {
        console.log('📢 shouldShowMenu 变化:', oldVal, '->', newVal)
      }
    )
    
    watch(
      () => store.state.currentFeature,
      (newVal, oldVal) => {
        console.log('📢 currentFeature 变化:', oldVal, '->', newVal)
      }
    )
    
    // 菜单选择处理
    const onMenuSelect = (item, featureType) => {
      console.log('选中菜单项:', item, '功能类型:', featureType)
      // TODO: 根据选中的底座类型加载对应的 3D 模型
    }
    
    onMounted(() => {
      // workspaceRef 已通过 store.setWorkspaceRef 注册
    })
    
    return {
      workspaceRef,
      shouldShowMenu,
      currentFeature,
      onMenuSelect
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
