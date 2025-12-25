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
      />
    </div>
    <el-scrollbar class="list">
      <div class="grid">
        <el-card
          v-for="item in filtered"
          :key="item.id"
          class="card"
          shadow="hover"
        >
          <div class="thumb"></div>
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
    }
  },
  setup(props) {
    const keyword = ref('')
    const dataMap = {
      base: [
        { id: 'b1', name: '这是底座1' },
        { id: 'b2', name: '这是底座2' },
        { id: 'b3', name: '这是底座3' },
        { id: 'b4', name: '这是底座4' }
      ],
      ornament: [
        { id: 'o1', name: '这是饰品1' },
        { id: 'o2', name: '这是饰品2' }
      ],
      text: [
        { id: 't1', name: '这是文字1' },
        { id: 't2', name: '这是文字2' }
      ],
      adjust: [
        { id: 'a1', name: '缩放' },
        { id: 'a2', name: '旋转' },
        { id: 'a3', name: '平移' }
      ]
    }
    const items = ref(dataMap[props.feature] || [])
    watch(() => props.feature, v => {
      items.value = dataMap[v] || []
      keyword.value = ''
    })
    const filtered = computed(() =>
      items.value.filter(i => i.name.includes(keyword.value))
    )
    return { keyword, filtered }
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
}
.thumb {
  width: 100%;
  aspect-ratio: 1 / 1;
  background: linear-gradient(135deg, #dde7ff, #c6d4ff);
  border-radius: 4px;
}
.name {
  font-size: 12px;
  color: #606266;
}
</style>
