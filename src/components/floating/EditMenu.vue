<template>
  <transition name="slide">
    <div 
      v-if="visible" 
      class="edit-menu"
      :style="menuStyle"
    >
      <div class="menu-row">
        <div class="menu-btn" title="移动" :class="{ active: mode === 'translate' }" @click="setMode('translate')">
          <i class="el-icon-rank"></i>
        </div>
        <div class="menu-btn" title="旋转" :class="{ active: mode === 'rotate' }" @click="setMode('rotate')">
          <i class="el-icon-refresh-right"></i>
        </div>
        <div class="menu-btn" title="缩放" :class="{ active: mode === 'scale' }" @click="setMode('scale')">
          <i class="el-icon-full-screen"></i>
        </div>
        <div class="menu-divider"></div>
        <div class="menu-btn" title="颜色" @click="openColorPicker">
          <i class="el-icon-brush"></i>
        </div>
        <div class="menu-btn" title="复制" @click="duplicate">
          <i class="el-icon-copy-document"></i>
        </div>
        <div class="menu-btn danger" title="删除" @click="remove">
          <i class="el-icon-delete"></i>
        </div>
      </div>
    </div>
  </transition>
</template>

<script>
import { computed, ref } from 'vue'
import { useEditorStore } from '../../store'

export default {
  name: 'EditMenu',
  setup(props, { emit }) {
    const store = useEditorStore()
    
    const visible = computed(() => store.state.editMenu.visible)
    const target = computed(() => store.state.editMenu.target)
    
    const mode = ref('translate')
    
    const menuStyle = computed(() => ({
      left: store.state.editMenu.x + 'px',
      top: store.state.editMenu.y + 'px'
    }))
    
    const setMode = (newMode) => {
      mode.value = newMode
      emit('modeChange', { mode: newMode, target: target.value })
    }
    
    const openColorPicker = () => {
      const rect = { x: store.state.editMenu.x, y: store.state.editMenu.y + 50 }
      store.showColorPicker({
        x: rect.x,
        y: rect.y,
        target: target.value,
        currentColor: target.value?.material?.color?.getHexString?.() || '#ffffff'
      })
    }
    
    const duplicate = () => {
      emit('duplicate', target.value)
    }
    
    const remove = () => {
      emit('delete', target.value)
      store.hideEditMenu()
    }
    
    return {
      visible,
      mode,
      menuStyle,
      setMode,
      openColorPicker,
      duplicate,
      remove
    }
  }
}
</script>

<style scoped>
.edit-menu {
  position: fixed;
  z-index: 9997;
  background: #fff;
  border-radius: 4px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  padding: 6px;
}

.menu-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.menu-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  cursor: pointer;
  color: #606266;
  transition: all 0.2s;
}

.menu-btn:hover {
  background: #f5f7fa;
  color: #409eff;
}

.menu-btn.active {
  background: #ecf5ff;
  color: #409eff;
}

.menu-btn.danger:hover {
  background: #fef0f0;
  color: #f56c6c;
}

.menu-btn i {
  font-size: 16px;
}

.menu-divider {
  width: 1px;
  height: 20px;
  background: #dcdfe6;
  margin: 0 4px;
}

.slide-enter-active,
.slide-leave-active {
  transition: all 0.2s;
}

.slide-enter,
.slide-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
