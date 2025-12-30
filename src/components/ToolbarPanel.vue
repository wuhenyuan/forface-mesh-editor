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
    
    const canUndo = computed(() => store.canUndo())
    const canRedo = computed(() => store.canRedo())
    
    const handleUndo = () => {
      const action = store.undo()
      if (!action) return
      
      const workspace = store.state.workspaceRef?.value
      if (!workspace) return
      
      // 根据 action 类型执行撤销
      switch (action.type) {
        case 'TEXT_ADD':
          workspace.deleteText(action.payload.id)
          break
        case 'TEXT_REMOVE':
          // TODO: 恢复文字
          console.log('恢复文字:', action.payload)
          break
        case 'TEXT_UPDATE':
          workspace.updateTextContent(action.payload.textId, action.payload.from)
          break
      }
    }
    
    const handleRedo = () => {
      const action = store.redo()
      if (!action) return
      
      const workspace = store.state.workspaceRef?.value
      if (!workspace) return
      
      switch (action.type) {
        case 'TEXT_ADD':
          // TODO: 重新创建文字
          console.log('重新创建文字:', action.payload)
          break
        case 'TEXT_REMOVE':
          workspace.deleteText(action.payload.id)
          break
        case 'TEXT_UPDATE':
          workspace.updateTextContent(action.payload.textId, action.payload.to)
          break
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
