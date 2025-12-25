<template>
  <div class="editor-root">
    <toolbar-panel />
    <div class="editor-body">
      <feature-panel v-model="feature" />
      <feature-menu :feature="feature" />
      <div class="workspace">
        <workspace-viewport />
      </div>
      <property-panel />
    </div>
  </div>
</template>

<script>
import { ref } from 'vue'
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
    const feature = ref('base')
    return { feature }
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
.workspace {
  background: #f7f8fa;
}
:root,
.editor-root {
  --header-height: 56px;
  --aside1-width: 120px;
  --aside2-width: 300px;
  --right-width: 320px;
}
</style>
