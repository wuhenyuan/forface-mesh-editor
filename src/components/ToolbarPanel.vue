<template>
  <div class="toolbar">
    <div class="left">
      <el-button type="text">{{ projectName }}</el-button>
    </div>
    <div class="center">
      <el-button size="mini">撤销</el-button>
      <el-button size="mini">恢复</el-button>
      <el-button size="mini">重置视图</el-button>
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
import { ref } from 'vue'
export default {
  name: 'ToolbarPanel',
  setup() {
    const projectName = ref('人物模型编辑器')
    return { projectName }
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
