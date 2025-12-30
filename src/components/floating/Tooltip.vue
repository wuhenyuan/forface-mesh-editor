<template>
  <transition name="fade">
    <div 
      v-if="visible" 
      class="floating-tooltip"
      :style="tooltipStyle"
    >
      {{ content }}
    </div>
  </transition>
</template>

<script>
import { computed } from 'vue'
import { useEditorStore } from '../../store/index.js'

export default {
  name: 'FloatingTooltip',
  setup() {
    const store = useEditorStore()
    
    const visible = computed(() => store.state.tooltip.visible)
    const content = computed(() => store.state.tooltip.content)
    
    const tooltipStyle = computed(() => ({
      left: store.state.tooltip.x + 'px',
      top: store.state.tooltip.y + 'px'
    }))
    
    return { visible, content, tooltipStyle }
  }
}
</script>

<style scoped>
.floating-tooltip {
  position: fixed;
  z-index: 10000;
  background: rgba(0, 0, 0, 0.75);
  color: #fff;
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 12px;
  pointer-events: none;
  white-space: nowrap;
  transform: translate(-50%, -100%);
  margin-top: -8px;
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
