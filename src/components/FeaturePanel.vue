<template>
  <div class="feature-panel">
    <el-menu :default-active="active" class="feature-menu" @select="onSelect" router="false">
      <el-menu-item index="base">底座</el-menu-item>
      <el-menu-item index="ornament">饰品</el-menu-item>
      <el-menu-item index="text">文字</el-menu-item>
      <el-menu-item index="adjust">调整</el-menu-item>
    </el-menu>
  </div>
</template>

<script>
import { ref } from 'vue'
export default {
  name: 'FeaturePanel',
  props: {
    value: {
      type: String,
      default: 'base'
    }
  },
  setup(props, { emit }) {
    const active = ref(props.value)
    const onSelect = key => {
      active.value = key
      emit('input', key)
      emit('change', key)
    }
    return { active, onSelect }
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
.feature-menu ::v-deep .el-menu-item {
  height: 48px;
  line-height: 48px;
}
</style>
