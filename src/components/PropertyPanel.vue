<template>
  <div class="property-panel">
    <div class="title">工艺信息</div>
    <el-collapse v-model="activeNames">
      <el-collapse-item title="基本尺寸" name="base">
        <div class="row">
          <span>体积</span>
          <el-input size="mini" v-model="form.volume"></el-input>
        </div>
        <div class="row">
          <span>外形尺寸</span>
          <el-input size="mini" v-model="form.size"></el-input>
        </div>
      </el-collapse-item>
      <el-collapse-item title="颜色" name="color">
        <div class="colors">
          <el-color-picker v-model="form.color" size="small"></el-color-picker>
          <el-color-picker v-model="form.color2" size="small"></el-color-picker>
          <el-color-picker v-model="form.color3" size="small"></el-color-picker>
        </div>
      </el-collapse-item>
      <el-collapse-item title="设计参数" name="design">
        <div class="row">
          <span>厚度</span>
          <el-input-number v-model="form.thickness" :min="0.5" :max="10" size="mini"></el-input-number>
        </div>
        <div class="row">
          <span>比例</span>
          <el-input-number v-model="form.scale" :min="0.1" :max="3" :step="0.1" size="mini"></el-input-number>
        </div>
      </el-collapse-item>
      <el-collapse-item title="对象属性" name="object">
        <div class="row">
          <span>名称</span>
          <el-input size="mini" v-model="form.objectName"></el-input>
        </div>
      </el-collapse-item>
    </el-collapse>
    <div class="price">
      <div class="text">预计价格</div>
      <div class="value">￥{{ price }}</div>
    </div>
    <div class="actions">
      <el-button type="default">设计交流</el-button>
      <el-button type="primary">设计下单</el-button>
    </div>
  </div>
</template>

<script>
import { ref, computed } from 'vue'
export default {
  name: 'PropertyPanel',
  setup() {
    const activeNames = ref(['base', 'color', 'design'])
    const form = ref({
      volume: '36531.36mm³',
      size: '120×120×180.00mm',
      color: '#409eff',
      color2: '#67c23a',
      color3: '#e6a23c',
      thickness: 1.0,
      scale: 1.0,
      objectName: '对象'
    })
    const price = computed(() =>
      (Math.round(form.value.thickness * 128 * form.value.scale * 100) / 100).toFixed(2)
    )
    return { activeNames, form, price }
  }
}
</script>

<style scoped>
.property-panel {
  width: var(--right-width);
  height: 100%;
  border-left: 1px solid #ebeef5;
  background: #fff;
  display: flex;
  flex-direction: column;
}
.title {
  padding: 10px 12px;
  font-weight: 600;
  border-bottom: 1px solid #ebeef5;
}
.row {
  display: grid;
  grid-template-columns: 80px 1fr;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
}
.colors {
  display: flex;
  gap: 8px;
}
.price {
  margin-top: auto;
  padding: 12px;
  border-top: 1px dashed #ebeef5;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.value {
  color: #f56c6c;
  font-weight: 600;
}
.actions {
  padding: 12px;
  display: flex;
  gap: 8px;
  border-top: 1px solid #ebeef5;
}
</style>
