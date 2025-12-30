<template>
  <transition name="fade">
    <div 
      v-if="visible" 
      class="color-picker-popup"
      :style="popupStyle"
    >
      <div class="picker-header">
        <span>选择颜色</span>
        <i class="el-icon-close" @click="handleClose"></i>
      </div>
      <div class="picker-body">
        <el-color-picker
          v-model="localColor"
          :predefine="predefineColors"
          show-alpha
          @change="handleChange"
        />
        <div class="color-presets">
          <div 
            v-for="color in predefineColors" 
            :key="color"
            class="preset-item"
            :style="{ background: color }"
            @click="selectPreset(color)"
          ></div>
        </div>
      </div>
      <div class="picker-footer">
        <el-button size="mini" @click="handleClose">取消</el-button>
        <el-button size="mini" type="primary" @click="handleConfirm">确定</el-button>
      </div>
    </div>
  </transition>
</template>

<script>
import { computed, ref, watch } from 'vue'
import { useEditorStore } from '../../store/index.js'

export default {
  name: 'ColorPicker',
  setup(props, { emit }) {
    const store = useEditorStore()
    
    const visible = computed(() => store.state.colorPicker.visible)
    const target = computed(() => store.state.colorPicker.target)
    
    const localColor = ref('#ffffff')
    
    const popupStyle = computed(() => ({
      left: store.state.colorPicker.x + 'px',
      top: store.state.colorPicker.y + 'px'
    }))
    
    const predefineColors = [
      '#ff4500', '#ff8c00', '#ffd700', '#90ee90', '#00ced1',
      '#1e90ff', '#c71585', '#333333', '#666666', '#999999'
    ]
    
    // 同步 store 颜色到本地
    watch(() => store.state.colorPicker.currentColor, (val) => {
      localColor.value = val
    }, { immediate: true })
    
    const handleChange = (color) => {
      store.setPickerColor(color)
    }
    
    const selectPreset = (color) => {
      localColor.value = color
      store.setPickerColor(color)
    }
    
    const handleClose = () => {
      store.hideColorPicker()
    }
    
    const handleConfirm = () => {
      emit('confirm', {
        color: localColor.value,
        target: target.value
      })
      store.hideColorPicker()
    }
    
    return {
      visible,
      localColor,
      popupStyle,
      predefineColors,
      handleChange,
      selectPreset,
      handleClose,
      handleConfirm
    }
  }
}
</script>

<style scoped>
.color-picker-popup {
  position: fixed;
  z-index: 9998;
  background: #fff;
  border-radius: 4px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  width: 240px;
}

.picker-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid #ebeef5;
  font-size: 14px;
  font-weight: 500;
}

.picker-header i {
  cursor: pointer;
  color: #909399;
}

.picker-header i:hover {
  color: #409eff;
}

.picker-body {
  padding: 12px;
}

.color-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.preset-item {
  width: 20px;
  height: 20px;
  border-radius: 2px;
  cursor: pointer;
  border: 1px solid #dcdfe6;
  transition: transform 0.2s;
}

.preset-item:hover {
  transform: scale(1.2);
}

.picker-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid #ebeef5;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s;
}

.fade-enter,
.fade-leave-to {
  opacity: 0;
}
</style>
