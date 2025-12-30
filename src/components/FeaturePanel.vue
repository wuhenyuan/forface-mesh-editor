<template>
  <div class="feature-panel">
    <el-menu :default-active="currentFeature" class="feature-menu" @select="onSelect">
      <el-menu-item index="base">底座</el-menu-item>
      <el-menu-item index="ornament">饰品</el-menu-item>
      <el-menu-item index="text">文字</el-menu-item>
      <el-menu-item index="adjust">调整</el-menu-item>
    </el-menu>
  </div>
</template>

<script>
import { computed } from 'vue'
import { useEditorStore } from '../store/index.js'

export default {
  name: 'FeaturePanel',
  setup() {
    const store = useEditorStore()
    
    const currentFeature = computed(() => store.state.currentFeature)
    
    const onSelect = (key) => {
      console.log('🔥 FeaturePanel onSelect:', key)
      store.setFeature(key)
    }
    
    return { currentFeature, onSelect }
  }
}
</script>

<style scoped>
.feature-panel {
  width: var(--aside1-width);
  height: 100%;
  border-right: 1px solid #ebeef5;
  background: #f7f8fa;
}
.feature-menu {
  border-right: none;
}
.feature-menu :deep(.el-menu-item) {
  height: 48px;
  line-height: 48px;
}
</style>
