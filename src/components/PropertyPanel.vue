<template>
  <div class="property-panel">
    <div class="title">工艺信息</div>
    <el-collapse v-model="activeNames">
      <!-- 文字属性面板 -->
      <el-collapse-item v-if="selectedTextObject" title="文字属性" name="text">
        <div class="row">
          <span>文字内容</span>
          <el-input 
            size="mini" 
            v-model="textForm.content" 
            @change="updateTextContent"
            placeholder="输入文字内容"
          ></el-input>
        </div>
        <div class="row">
          <span>文字颜色</span>
          <el-color-picker 
            v-model="textForm.color" 
            size="small"
            @change="updateTextColor"
          ></el-color-picker>
        </div>
        <div class="row">
          <span>雕刻模式</span>
          <el-select 
            v-model="textForm.mode" 
            size="mini"
            @change="updateTextMode"
          >
            <el-option label="凸起" value="raised"></el-option>
            <el-option label="内嵌" value="engraved"></el-option>
          </el-select>
        </div>
        <div class="row">
          <span>字体</span>
          <el-select 
            v-model="textForm.font" 
            size="mini"
            @change="updateTextFont"
          >
            <el-option label="Helvetiker" value="helvetiker"></el-option>
            <el-option label="Helvetiker Bold" value="helvetiker_bold"></el-option>
            <el-option label="Optimer" value="optimer"></el-option>
            <el-option label="Optimer Bold" value="optimer_bold"></el-option>
          </el-select>
        </div>
        <div class="row">
          <span>大小</span>
          <el-input-number 
            v-model="textForm.size" 
            :min="0.1" 
            :max="10" 
            :step="0.1"
            size="mini"
            @change="updateTextSize"
          ></el-input-number>
        </div>
        <div class="row">
          <span>厚度</span>
          <el-input-number 
            v-model="textForm.thickness" 
            :min="0.01" 
            :max="2" 
            :step="0.01"
            size="mini"
            @change="updateTextThickness"
          ></el-input-number>
        </div>
        <div class="text-actions">
          <el-button size="mini" @click="deleteSelectedText" type="danger">删除文字</el-button>
          <el-button size="mini" @click="duplicateText">复制文字</el-button>
        </div>
      </el-collapse-item>
      
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
import { ref, computed, watch, inject } from 'vue'
export default {
  name: 'PropertyPanel',
  props: {
    selectedTextObject: {
      type: Object,
      default: null
    }
  },
  emits: [
    'updateTextContent',
    'updateTextColor', 
    'updateTextMode',
    'updateTextFont',
    'updateTextSize',
    'updateTextThickness',
    'deleteSelectedText',
    'duplicateText'
  ],
  setup(props, { emit }) {
    const activeNames = ref(['base', 'color', 'design'])
    
    // 基本表单
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
    
    // 文字表单
    const textForm = ref({
      content: '',
      color: '#333333',
      mode: 'raised',
      font: 'helvetiker',
      size: 1,
      thickness: 0.1
    })
    
    // 监听选中的文字对象变化
    watch(() => props.selectedTextObject, (newTextObject) => {
      if (newTextObject) {
        // 更新文字表单数据
        textForm.value = {
          content: newTextObject.content || '',
          color: '#' + newTextObject.material.color.getHexString(),
          mode: newTextObject.mode || 'raised',
          font: newTextObject.config.font || 'helvetiker',
          size: newTextObject.config.size || 1,
          thickness: newTextObject.config.thickness || 0.1
        }
        
        // 确保文字属性面板展开
        if (!activeNames.value.includes('text')) {
          activeNames.value.unshift('text')
        }
      } else {
        // 移除文字属性面板
        const textIndex = activeNames.value.indexOf('text')
        if (textIndex !== -1) {
          activeNames.value.splice(textIndex, 1)
        }
      }
    }, { immediate: true })
    
    const price = computed(() =>
      (Math.round(form.value.thickness * 128 * form.value.scale * 100) / 100).toFixed(2)
    )
    
    // 文字属性更新方法
    const updateTextContent = () => {
      if (props.selectedTextObject) {
        emit('updateTextContent', props.selectedTextObject.id, textForm.value.content)
      }
    }
    
    const updateTextColor = () => {
      if (props.selectedTextObject) {
        emit('updateTextColor', props.selectedTextObject.id, textForm.value.color)
      }
    }
    
    const updateTextMode = () => {
      if (props.selectedTextObject) {
        emit('updateTextMode', props.selectedTextObject.id, textForm.value.mode)
      }
    }
    
    const updateTextFont = () => {
      if (props.selectedTextObject) {
        emit('updateTextFont', props.selectedTextObject.id, textForm.value.font)
      }
    }
    
    const updateTextSize = () => {
      if (props.selectedTextObject) {
        emit('updateTextSize', props.selectedTextObject.id, textForm.value.size)
      }
    }
    
    const updateTextThickness = () => {
      if (props.selectedTextObject) {
        emit('updateTextThickness', props.selectedTextObject.id, textForm.value.thickness)
      }
    }
    
    const deleteSelectedText = () => {
      if (props.selectedTextObject) {
        emit('deleteSelectedText')
      }
    }
    
    const duplicateText = () => {
      if (props.selectedTextObject) {
        emit('duplicateText')
      }
    }
    
    return { 
      activeNames, 
      form, 
      textForm,
      price,
      updateTextContent,
      updateTextColor,
      updateTextMode,
      updateTextFont,
      updateTextSize,
      updateTextThickness,
      deleteSelectedText,
      duplicateText
    }
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

.text-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed #ebeef5;
}
</style>
