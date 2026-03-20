<template>
  <div class="feature-menu">
    <div class="menu-header">
      <span>功能菜单</span>
      <el-input
        size="mini"
        v-model="keyword"
        placeholder="搜索"
        clearable
        class="menu-header-search"
        @input="handleSearch"
      />
    </div>

    <el-scrollbar class="menu-list">
      <div v-if="loading" class="menu-list-loading">
        <span>加载中...</span>
      </div>
      <div v-else-if="displayItems.length === 0" class="menu-list-empty">
        <span>暂无数据</span>
      </div>
      <div v-else class="list-grid">
        <el-card
          v-for="(item, index) in displayItems"
          :key="resolveItemId(item, index)"
          class="list-grid-card"
          :class="{ active: selectedItemId === resolveItemId(item, index) }"
          shadow="never"
          @click.native="handleSelect(item, index)"
        >
          <div class="list-grid-card-frame">
            <div class="list-grid-card-frame-media">
              <img
                class="list-grid-card-frame-thumb"
                :src="item.thumbnail || baseThumbnail"
                :alt="item.name"
              />

              <el-popover
                v-model="item._detailVisible"
                placement="right-start"
                width="190"
                trigger="hover"
                popper-class="menu-detail-popover-popper"
              >
                <div class="menu-detail-popover">
                  <div class="menu-detail-popover-title">底座信息</div>
                  <div class="menu-detail-popover-row">
                    <span class="menu-detail-popover-label">体积：</span>
                    <span class="menu-detail-popover-value">{{ item.volume || '--' }}</span>
                  </div>
                  <div class="menu-detail-popover-row">
                    <span class="menu-detail-popover-label">表面积：</span>
                    <span class="menu-detail-popover-value">{{ item.surface || '--' }}</span>
                  </div>
                  <div class="menu-detail-popover-row">
                    <span class="menu-detail-popover-label">包围盒：</span>
                    <span class="menu-detail-popover-value">{{ item.boundingBox || '--' }}</span>
                  </div>
                </div>

                <button
                  slot="reference"
                  type="button"
                  class="list-grid-card-frame-detail"
                  title="详情"
                  @click.stop
                >
                  i
                </button>
              </el-popover>
            </div>
          </div>
          <div class="list-grid-card-title">{{ item.name }}</div>
        </el-card>
      </div>
    </el-scrollbar>
  </div>
</template>

<script>
import { computed, ref, watch } from 'vue';
import { useEditorStore } from '../store';
import baseThumbnail from '../assets/model/pic/image.png';

export default {
  name: 'FeatureMenu',
  emits: ['select', 'detail'],
  setup(props, { emit }) {
    const store = useEditorStore();

    const keyword = computed({
      get: () => store.state.menuKeyword,
      set: (val) => store.setMenuKeyword(val),
    });

    const selectedItemId = ref('');
    const loading = computed(() => store.state.menuLoading);
    const displayItems = computed(() => store.state.menuItems);

    const resolveItemId = (item, index) => {
      if (item?.id !== undefined && item?.id !== null) return String(item.id);
      if (item?.objId !== undefined && item?.objId !== null) return String(item.objId);
      return `menu-item-${index}`;
    };

    const createItem = (item) => ({
      ...item,
      _detailVisible: false,
    });

    const allData = [
      createItem({
        id: 'b1',
        name: '这是底座1',
        thumbnail: baseThumbnail,
        volume: '361.23mm³',
        surface: '161.23mm²',
        boundingBox: '12.32*12.32*56.12mm',
      }),
      createItem({
        id: 'b2',
        name: '这是底座2',
        thumbnail: baseThumbnail,
        volume: '358.41mm³',
        surface: '159.48mm²',
        boundingBox: '12.28*12.28*55.96mm',
      }),
      createItem({
        id: 'b3',
        name: '这是底座3',
        thumbnail: baseThumbnail,
        volume: '364.52mm³',
        surface: '162.17mm²',
        boundingBox: '12.36*12.30*56.20mm',
      }),
      createItem({
        id: 'b4',
        name: '这是底座4',
        thumbnail: baseThumbnail,
        volume: '355.96mm³',
        surface: '158.90mm²',
        boundingBox: '12.20*12.24*55.80mm',
      }),
      createItem({
        id: 'b5',
        name: '这是底座5',
        thumbnail: baseThumbnail,
        volume: '359.72mm³',
        surface: '160.45mm²',
        boundingBox: '12.30*12.31*56.05mm',
      }),
      createItem({
        id: 'b6',
        name: '这是底座6',
        thumbnail: baseThumbnail,
        volume: '362.18mm³',
        surface: '161.02mm²',
        boundingBox: '12.34*12.29*56.08mm',
      }),
    ];

    const closeOtherDetails = (keepId = '') => {
      displayItems.value.forEach((menuItem, idx) => {
        const id = resolveItemId(menuItem, idx);
        if (id !== keepId && menuItem._detailVisible) {
          menuItem._detailVisible = false;
        }
      });
    };

    const handleSearch = async (value) => {
      store.setMenuLoading(true);

      await new Promise((resolve) => setTimeout(resolve, 300));

      const source = !value
        ? allData.slice(0, 4)
        : allData.filter((menuItem) => menuItem.name.includes(value));

      store.setMenuItems(source.map((menuItem) => createItem(menuItem)));
      store.setMenuLoading(false);
    };

    const handleSelect = (item, index) => {
      selectedItemId.value = resolveItemId(item, index);
      closeOtherDetails();
      emit('select', item, store.state.currentFeature);
    };

    const handleDetailShow = (item, index) => {
      const currentId = resolveItemId(item, index);
      closeOtherDetails(currentId);
      emit('detail', item, store.state.currentFeature, index);
    };

    const handleDetailHide = (item) => {
      item._detailVisible = false;
    };

    watch(
      () => store.state.currentFeature,
      () => {
        store.setMenuKeyword('');
        selectedItemId.value = '';
        handleSearch('');
      },
      { immediate: true }
    );

    watch(displayItems, (items) => {
      if (!items.some((item, index) => resolveItemId(item, index) === selectedItemId.value)) {
        selectedItemId.value = '';
      }
    });

    return {
      keyword,
      loading,
      displayItems,
      baseThumbnail,
      selectedItemId,
      resolveItemId,
      handleSearch,
      handleSelect,
      handleDetailShow,
      handleDetailHide,
    };
  },
};
</script>

<style scoped lang="less">
.feature-menu {
  width: var(--aside2-width);
  height: 100%;
  border-right: 1px solid #ebeef5;
  background: #fff;
  display: flex;
  flex-direction: column;
}

.menu-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-bottom: 1px solid #ebeef5;

  &-search {
    flex: 1;
  }
}

.menu-list {
  flex: 1;

  &-loading,
  &-empty {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 200px;
    color: #909399;
    font-size: 14px;
  }
}

.list-grid {
  --thumb-size: 88px;
  --thumb-active-size: 92px;
  width: 240px;
  display: grid;
  grid-template-columns: repeat(2, auto);
  justify-content: space-between;
  row-gap: 12px;
  margin: 0 auto;
  padding: 8px 0;

  &-card {
    border: none;
    box-shadow: none;
    background: transparent;
    cursor: pointer;
    width: var(--thumb-size);
    transition: width 0.2s ease;

    :deep(.el-card__body) {
      padding: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }

    &-frame {
      width: 100%;
      aspect-ratio: 1 / 1;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    &-frame-media {
      position: relative;
      width: 100%;
      height: 100%;
    }

    &-frame-thumb {
      display: block;
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      border: 1px solid transparent;
      object-fit: cover;
      background-color: #eef1f5;
      border-radius: 4px;
      transition:
        border-color 0.2s ease,
        background-color 0.2s ease;
    }

    &-frame-detail {
      position: absolute;
      top: 4px;
      right: 4px;
      width: 18px;
      height: 18px;
      border: none;
      border-radius: 3px;
      padding: 0;
      background: rgba(0, 0, 0, 0.45);
      color: #fff;
      font-size: 12px;
      line-height: 18px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition:
        opacity 0.2s ease,
        background-color 0.2s ease;
    }

    &:hover &-frame-media {
      width: 100%;
      height: 100%;
    }

    &:hover &-frame-thumb {
      border-color: #8ab8ff;
      background-color: #f5f9ff;
    }

    &.active &-frame-media {
      width: 100%;
      height: 100%;
    }

    &.active &-frame-thumb {
      border-width: 2px;
      border-color: #409eff;
      background-color: #ecf5ff;
    }

    &:hover,
    &.active {
      width: var(--thumb-active-size);
    }

    &:hover &-frame-detail,
    &.active &-frame-detail {
      opacity: 1;
    }

    &-frame-detail:hover {
      background-color: #409eff;
    }

    &-title {
      width: 100%;
      min-height: 20px;
      line-height: 20px;
      text-align: center;
      font-size: 12px;
      color: #606266;
    }

    &:hover &-title {
      color: #303133;
    }

    &.active &-title {
      color: #409eff;
      font-weight: 500;
    }
  }
}
</style>

<style lang="less">
.menu-detail-popover-popper {
  padding: 10px 12px;
  border-color: #e6ebf2;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);

  .menu-detail-popover-title {
    margin-bottom: 10px;
    color: #303133;
    font-size: 14px;
    font-weight: 500;
  }

  .menu-detail-popover-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    margin-top: 6px;
    font-size: 13px;
    color: #606266;
  }

  .menu-detail-popover-label {
    flex-shrink: 0;
    color: #909399;
  }

  .menu-detail-popover-value {
    text-align: right;
    color: #606266;
    word-break: break-all;
  }
}
</style>
