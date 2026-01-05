<template>
  <div class="feature-menu-panel">
    <div class="header">
      <span>功能菜单</span>
      <el-input
        size="mini"
        v-model="keyword"
        placeholder="搜索"
        clearable
        class="search"
        @input="handleSearch"
      />
    </div>
    <el-scrollbar class="list">
      <div v-if="loading" class="loading">
        <span>加载中...</span>
      </div>
      <div v-else-if="displayItems.length === 0" class="empty">
        <span>暂无数据</span>
      </div>
      <div v-else class="grid">
        <el-card
          v-for="item in displayItems"
          :key="item.id"
          class="card"
          shadow="hover"
          @click="handleSelect(item)"
        >
          <div class="thumb" :style="item.thumbnail ? { backgroundImage: `url(${item.thumbnail})` } : {}"></div>
          <div class="name">{{ item.name }}</div>
        </el-card>
      </div>
    </el-scrollbar>
  </div>
</template>

<script>
import { computed, watch } from 'vue'
import { useEditorStore } from '../store'

export default {
  name: 'FeatureMenu',
  emits: ['select'],
  setup(props, { emit }) {
    const store = useEditorStore()
    
    const keyword = computed({
      get: () => store.state.menuKeyword,
      set: (val) => store.setMenuKeyword(val)
    })
    
    const loading = computed(() => store.state.menuLoading)
    const displayItems = computed(() => store.state.menuItems)
    
    // 搜索处理
    const handleSearch = async (value) => {
      store.setMenuLoading(true)
      
      // 模拟搜索延迟
      await new Promise(resolve => setTimeout(resolve, 300))
      
      // 模拟数据
      const allData = [
        { id: 'b1', name: '圆形底座', thumbnail: '' },
        { id: 'b2', name: '方形底座', thumbnail: '' },
        { id: 'b3', name: '心形底座', thumbnail: '' },
        { id: 'b4', name: '星形底座', thumbnail: '' },
        { id: 'b5', name: '六边形底座', thumbnail: '' },
        { id: 'b6', name: '椭圆底座', thumbnail: '' }
      ]
      
      if (!value) {
        store.setMenuItems(allData.slice(0, 4))
      } else {
        store.setMenuItems(allData.filter(item => item.name.includes(value)))
      }
      
      store.setMenuLoading(false)
    }
    
    // 选择菜单项
    const handleSelect = (item) => {
      emit('select', item, store.state.currentFeature)
      console.log('选中菜单项:', item.name)
    }
    
    // 功能切换时清空搜索并加载数据
    watch(() => store.state.currentFeature, () => {
      store.setMenuKeyword('')
      handleSearch('')
    }, { immediate: true })
    
    return { 
      keyword, 
      loading,
      displayItems,
      handleSearch,
      handleSelect
    }
  }
}
</script>

<style scoped>
.feature-menu-panel {
  width: var(--aside2-width);
  height: 100%;
  border-right: 1px solid #ebeef5;
  background: #fff;
  display: flex;
  flex-direction: column;
}
.header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-bottom: 1px solid #ebeef5;
}
.search {
  flex: 1;
}
.list {
  flex: 1;
}
.grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  padding: 8px;
}
.card {
  cursor: pointer;
}
.card :deep(.el-card__body) {
  padding: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.thumb {
  width: 100%;
  aspect-ratio: 1 / 1;
  background: linear-gradient(135deg, #dde7ff, #c6d4ff);
  background-size: cover;
  background-position: center;
  border-radius: 4px;
}
.name {
  font-size: 12px;
  color: #606266;
}
.loading, .empty {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
  color: #909399;
  font-size: 14px;
}
</style>
