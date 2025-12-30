<template>
  <div class="toolbar">
    <div class="left">
      <el-button type="text">{{ projectName }}</el-button>
    </div>
    <div class="center">
      <el-button size="mini" :disabled="!canUndo" @click="handleUndo">撤销</el-button>
      <el-button size="mini" :disabled="!canRedo" @click="handleRedo">恢复</el-button>
      <el-button size="mini" @click="handleResetView">重置视图</el-button>
      <el-divider direction="vertical"></el-divider>
      <el-button size="mini">模型尺寸</el-button>
      <el-button size="mini">设计交流</el-button>
      <el-button size="mini">分享</el-button>
      <el-button size="mini">更多</el-button>
    </div>
    <div class="right">
      <el-button type="primary" size="mini">设计保存</el-button>
    </div>
  </div>
</template>

<script>
import { ref, computed } from 'vue'
import { useEditorStore } from '../store/index.js'

export default {
  name: 'ToolbarPanel',
  setup() {
    const store = useEditorStore()
    const projectName = ref('人物模型编辑器')
    
    const isBusy = computed(() => store.isHistoryBusy?.() || false)
    const canUndo = computed(() => store.canUndo() && !isBusy.value)
    const canRedo = computed(() => store.canRedo() && !isBusy.value)
    
    const handleUndo = async () => {
      try {
        await store.undo()
      } catch (error) {
        console.error('撤销失败:', error)
      }
    }
    
    const handleRedo = async () => {
      try {
        await store.redo()
      } catch (error) {
        console.error('重做失败:', error)
      }
    }
    
    const handleResetView = () => {
      const workspace = store.state.workspaceRef?.value
      workspace?.resetView()
    }
    
    return { 
      projectName,
      canUndo,
      canRedo,
      handleUndo,
      handleRedo,
      handleResetView
    }
  }
}
</script>

<style scoped>
.toolbar {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  height: var(--header-height);
  box-sizing: border-box;
  padding: 0 12px;
  border-bottom: 1px solid #ebeef5;
  background: #fff;
}
.left {
  justify-self: start;
}
.center {
  justify-self: center;
  display: flex;
  gap: 8px;
  align-items: center;
}
.right {
  justify-self: end;
}
</style>
