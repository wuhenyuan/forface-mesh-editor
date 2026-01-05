<template>
  <transition name="fade">
    <div 
      v-if="visible" 
      class="context-menu"
      :style="menuStyle"
      @contextmenu.prevent.stop
      @click.stop
    >
      <template v-for="(item, index) in items">
        <div v-if="item.divider" :key="'d' + index" class="menu-divider"></div>
        <div 
          v-else
          :key="item.key"
          class="menu-item"
          :class="{ danger: item.danger }"
          @click.stop="handleClick(item)"
        >
          <i v-if="item.icon" :class="item.icon"></i>
          <span>{{ item.label }}</span>
        </div>
      </template>
    </div>
  </transition>
</template>

<script>
import { computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useEditorStore } from '../../store'

export default {
  name: 'ContextMenu',
  setup(_, { emit }) {
    const store = useEditorStore()
    
    const visible = computed(() => store.state.contextMenu.visible)
    const items = computed(() => store.state.contextMenu.items)
    const target = computed(() => store.state.contextMenu.target)
    const targetType = computed(() => store.state.contextMenu.targetType)
    
    const menuStyle = computed(() => ({
      left: store.state.contextMenu.x + 'px',
      top: store.state.contextMenu.y + 'px'
    }))
    
    const handleClick = (item) => {
      emit('select', {
        key: item.key,
        target: target.value,
        targetType: targetType.value
      })
      store.hideContextMenu()
    }
    
    // 点击外部关闭
    const handleClickOutside = (e) => {
      // 如果点击的是菜单内部，不关闭
      const menu = document.querySelector('.context-menu')
      if (menu && menu.contains(e.target)) {
        return
      }
      if (visible.value) {
        store.hideContextMenu()
      }
    }
    
    // 监听 visible 变化来绑定/解绑事件
    watch(visible, (newVal) => {
      if (newVal) {
        // 延迟绑定，避免当前事件触发关闭
        setTimeout(() => {
          document.addEventListener('click', handleClickOutside, true)
          document.addEventListener('contextmenu', handleClickOutside, true)
        }, 10)
      } else {
        document.removeEventListener('click', handleClickOutside, true)
        document.removeEventListener('contextmenu', handleClickOutside, true)
      }
    })
    
    onBeforeUnmount(() => {
      document.removeEventListener('click', handleClickOutside, true)
      document.removeEventListener('contextmenu', handleClickOutside, true)
    })
    
    return { visible, items, menuStyle, handleClick }
  }
}
</script>

<style scoped>
.context-menu {
  position: fixed;
  z-index: 9999;
  min-width: 150px;
  background: #fff;
  border-radius: 4px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  padding: 4px 0;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  cursor: pointer;
  font-size: 13px;
  color: #333;
  transition: background 0.2s;
}

.menu-item:hover {
  background: #f5f7fa;
}

.menu-item.danger {
  color: #f56c6c;
}

.menu-item.danger:hover {
  background: #fef0f0;
}

.menu-item i {
  font-size: 14px;
  width: 16px;
}

.menu-divider {
  height: 1px;
  background: #ebeef5;
  margin: 4px 0;
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
