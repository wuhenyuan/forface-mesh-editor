<template>
  <div class="face-picking-demo">
    <div class="demo-header">
      <h2>面拾取功能演示</h2>
      <div class="demo-controls">
        <button @click="resetDemo" class="reset-btn">重置演示</button>
        <button @click="togglePanel" class="toggle-panel-btn">
          {{ showPanel ? '隐藏' : '显示' }}控制面板
        </button>
        <button @click="toggleShortcuts" class="toggle-shortcuts-btn">
          {{ showShortcuts ? '隐藏' : '显示' }}快捷键
        </button>
      </div>
    </div>
    
    <div class="demo-content">
      <!-- 3D视口 -->
      <div class="viewport-container">
        <WorkspaceViewport
          :enableFacePicking="true"
          :showFacePickingPanel="showPanel"
          :showShortcuts="showShortcuts"
          :defaultSelectionColor="selectionColor"
          :defaultHoverColor="hoverColor"
          @faceSelected="onFaceSelected"
          @faceDeselected="onFaceDeselected"
          @selectionCleared="onSelectionCleared"
          @faceHover="onFaceHover"
          @facePickingToggled="onFacePickingToggled"
        />
      </div>
      
      <!-- 事件日志 -->
      <div class="event-log">
        <h3>事件日志</h3>
        <div class="log-controls">
          <button @click="clearLog" class="clear-log-btn">清除日志</button>
          <label class="auto-scroll-label">
            <input type="checkbox" v-model="autoScroll">
            自动滚动
          </label>
        </div>
        <div class="log-content" ref="logContainer">
          <div
            v-for="(log, index) in eventLogs"
            :key="index"
            :class="['log-entry', `log-${log.type}`]"
          >
            <span class="log-time">{{ log.time }}</span>
            <span class="log-type">{{ log.type }}</span>
            <span class="log-message">{{ log.message }}</span>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 统计信息 -->
    <div class="demo-stats">
      <div class="stat-item">
        <label>总选择次数:</label>
        <span>{{ stats.totalSelections }}</span>
      </div>
      <div class="stat-item">
        <label>总取消选择次数:</label>
        <span>{{ stats.totalDeselections }}</span>
      </div>
      <div class="stat-item">
        <label>悬停次数:</label>
        <span>{{ stats.totalHovers }}</span>
      </div>
      <div class="stat-item">
        <label>清除次数:</label>
        <span>{{ stats.totalClears }}</span>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, reactive, nextTick, watch } from 'vue'
import WorkspaceViewport from './WorkspaceViewport.vue'

export default {
  name: 'FacePickingDemo',
  components: {
    WorkspaceViewport
  },
  setup() {
    // 控制状态
    const showPanel = ref(true)
    const showShortcuts = ref(true)
    const autoScroll = ref(true)
    const logContainer = ref(null)
    
    // 颜色配置
    const selectionColor = ref('#ff6b35')
    const hoverColor = ref('#4fc3f7')
    
    // 事件日志
    const eventLogs = ref([])
    const maxLogs = 100
    
    // 统计信息
    const stats = reactive({
      totalSelections: 0,
      totalDeselections: 0,
      totalHovers: 0,
      totalClears: 0
    })
    
    // 添加日志条目
    const addLog = (type, message, data = null) => {
      const log = {
        time: new Date().toLocaleTimeString(),
        type,
        message,
        data
      }
      
      eventLogs.value.push(log)
      
      // 限制日志数量
      if (eventLogs.value.length > maxLogs) {
        eventLogs.value.shift()
      }
      
      // 自动滚动到底部
      if (autoScroll.value) {
        nextTick(() => {
          if (logContainer.value) {
            logContainer.value.scrollTop = logContainer.value.scrollHeight
          }
        })
      }
    }
    
    // 面选择事件处理
    const onFaceSelected = (faceInfo) => {
      stats.totalSelections++
      addLog('selection', `选中面: ${faceInfo.mesh.name}[${faceInfo.faceIndex}]`, faceInfo)
    }
    
    const onFaceDeselected = (faceInfo) => {
      stats.totalDeselections++
      addLog('deselection', `取消选择: ${faceInfo.mesh.name}[${faceInfo.faceIndex}]`, faceInfo)
    }
    
    const onSelectionCleared = () => {
      stats.totalClears++
      addLog('clear', '清除所有选择')
    }
    
    const onFaceHover = (faceInfo) => {
      stats.totalHovers++
      addLog('hover', `悬停: ${faceInfo.mesh.name}[${faceInfo.faceIndex}]`, faceInfo)
    }
    
    const onFacePickingToggled = (enabled) => {
      addLog('toggle', `面拾取${enabled ? '启用' : '禁用'}`)
    }
    
    // 控制方法
    const resetDemo = () => {
      // 重置统计
      stats.totalSelections = 0
      stats.totalDeselections = 0
      stats.totalHovers = 0
      stats.totalClears = 0
      
      // 清除日志
      eventLogs.value = []
      
      addLog('system', '演示已重置')
    }
    
    const clearLog = () => {
      eventLogs.value = []
    }
    
    const togglePanel = () => {
      showPanel.value = !showPanel.value
    }
    
    const toggleShortcuts = () => {
      showShortcuts.value = !showShortcuts.value
    }
    
    // 监听自动滚动设置
    watch(autoScroll, (newValue) => {
      addLog('system', `自动滚动${newValue ? '启用' : '禁用'}`)
    })
    
    // 初始化日志
    addLog('system', '面拾取演示已启动')
    
    return {
      // 状态
      showPanel,
      showShortcuts,
      autoScroll,
      logContainer,
      selectionColor,
      hoverColor,
      eventLogs,
      stats,
      
      // 方法
      onFaceSelected,
      onFaceDeselected,
      onSelectionCleared,
      onFaceHover,
      onFacePickingToggled,
      resetDemo,
      clearLog,
      togglePanel,
      toggleShortcuts
    }
  }
}
</script>

<style scoped>
.face-picking-demo {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f5f5f5;
}

.demo-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: white;
  border-bottom: 1px solid #e0e0e0;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.demo-header h2 {
  margin: 0;
  color: #333;
  font-size: 20px;
}

.demo-controls {
  display: flex;
  gap: 10px;
}

.demo-controls button {
  padding: 8px 16px;
  border: 1px solid #409eff;
  background: #409eff;
  color: white;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.demo-controls button:hover {
  background: #66b1ff;
}

.demo-content {
  flex: 1;
  display: flex;
  gap: 16px;
  padding: 16px;
  min-height: 0;
}

.viewport-container {
  flex: 2;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.event-log {
  flex: 1;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  min-width: 300px;
}

.event-log h3 {
  margin: 0;
  padding: 16px 20px 12px;
  color: #333;
  font-size: 16px;
  border-bottom: 1px solid #e0e0e0;
}

.log-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 20px;
  border-bottom: 1px solid #e0e0e0;
  background: #f9f9f9;
}

.clear-log-btn {
  padding: 4px 12px;
  border: 1px solid #f56c6c;
  background: #f56c6c;
  color: white;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.clear-log-btn:hover {
  background: #f78989;
}

.auto-scroll-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #666;
  cursor: pointer;
}

.log-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.log-entry {
  display: flex;
  align-items: center;
  padding: 4px 20px;
  font-size: 12px;
  font-family: monospace;
  border-left: 3px solid transparent;
}

.log-entry:hover {
  background: #f5f5f5;
}

.log-time {
  color: #999;
  margin-right: 12px;
  min-width: 80px;
}

.log-type {
  font-weight: bold;
  margin-right: 12px;
  min-width: 80px;
  text-transform: uppercase;
}

.log-message {
  color: #333;
}

/* 日志类型颜色 */
.log-selection {
  border-left-color: #67c23a;
}

.log-selection .log-type {
  color: #67c23a;
}

.log-deselection {
  border-left-color: #f56c6c;
}

.log-deselection .log-type {
  color: #f56c6c;
}

.log-hover {
  border-left-color: #409eff;
}

.log-hover .log-type {
  color: #409eff;
}

.log-clear {
  border-left-color: #e6a23c;
}

.log-clear .log-type {
  color: #e6a23c;
}

.log-toggle {
  border-left-color: #909399;
}

.log-toggle .log-type {
  color: #909399;
}

.log-system {
  border-left-color: #606266;
}

.log-system .log-type {
  color: #606266;
}

.demo-stats {
  display: flex;
  gap: 20px;
  padding: 16px 20px;
  background: white;
  border-top: 1px solid #e0e0e0;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.stat-item label {
  color: #666;
  font-weight: 500;
}

.stat-item span {
  color: #409eff;
  font-weight: bold;
  font-size: 16px;
}

/* 响应式设计 */
@media (max-width: 1024px) {
  .demo-content {
    flex-direction: column;
  }
  
  .viewport-container {
    height: 400px;
  }
  
  .event-log {
    min-width: auto;
    height: 300px;
  }
  
  .demo-stats {
    flex-wrap: wrap;
    gap: 10px;
  }
}

@media (max-width: 768px) {
  .demo-header {
    flex-direction: column;
    gap: 12px;
    align-items: stretch;
  }
  
  .demo-controls {
    justify-content: center;
  }
  
  .demo-controls button {
    flex: 1;
    font-size: 12px;
    padding: 6px 12px;
  }
}
</style>