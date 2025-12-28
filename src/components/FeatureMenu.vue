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
        <span>{{ emptyText }}</span>
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
import { computed, ref, watch } from 'vue'
export default {
  name: 'FeatureMenu',
  props: {
    feature: {
      type: String,
      default: 'base'
    },
    // 上层传入的菜单数据
    items: {
      type: Array,
      default: () => []
    },
    // 是否正在加载
    loading: {
      type: Boolean,
      default: false
    },
    // 是否使用远程搜索（true 时不在本地过滤，由上层处理）
    remoteSearch: {
      type: Boolean,
      default: false
    },
    // 空状态文案
    emptyText: {
      type: String,
      default: '暂无数据'
    }
  },
  emits: ['search', 'select'],
  setup(props, { emit }) {
    const keyword = ref('')
    
    // 显示的数据：如果是远程搜索，直接用 items；否则本地过滤
    const displayItems = computed(() => {
      if (props.remoteSearch || !keyword.value) {
        return props.items
      }
      // 本地搜索过滤
      return props.items.filter(item => 
        item.name.includes(keyword.value) ||
        (item.tags && item.tags.some(tag => tag.includes(keyword.value)))
      )
    })
    
    // 搜索处理
    const handleSearch = (value) => {
      emit('search', value, props.feature)
    }
    
    // 选择菜单项
    const handleSelect = (item) => {
      emit('select', item, props.feature)
    }
    
    // feature 变化时清空搜索
    watch(() => props.feature, () => {
      keyword.value = ''
    })
    
    return { 
      keyword, 
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
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  cursor: pointer;
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
