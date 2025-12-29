<template>
  <div class="property-panel">
    <div class="title">工艺信息</div>
    <div class="panel-body">
      <el-collapse v-model="activeNames">
      
      <!-- 文字列表面板 - 常驻显示 -->
      <el-collapse-item title="文字属性" name="text">
        <div class="text-list" v-if="textList.length > 0">
          <div 
            v-for="(text, index) in textList" 
            :key="text.id"
            class="text-item"
            :class="{ active: selectedTextObject && selectedTextObject.id === text.id }"
            @click="selectTextItem(text)"
          >
            <span class="text-name">{{ text.displayName }}</span>
            <span class="text-content">{{ text.content }}</span>
            <el-button 
              type="text" 
              size="mini" 
              icon="el-icon-delete"
              @click.stop="deleteTextItem(text.id)"
            ></el-button>
          </div>
        </div>
        <div v-else class="empty-text">
          <span>暂无文字，点击模型表面添加</span>
        </div>
        
        <!-- 选中文字的属性编辑 -->
        <div v-if="selectedTextObject" class="text-properties">
          <div class="properties-title">{{ currentTextDisplayName }} 属性</div>
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
          
          <!-- 圆柱面特有属性 -->
          <div v-if="isSelectedTextOnCylinder" class="cylinder-properties">
            <div class="properties-subtitle">圆柱面属性</div>
            <div class="row">
              <span>环绕方向</span>
              <el-select 
                v-model="textForm.direction" 
                size="mini"
                @change="updateTextDirection"
              >
                <el-option label="顺时针" :value="1"></el-option>
                <el-option label="逆时针" :value="-1"></el-option>
              </el-select>
            </div>
            <div class="row">
              <span>字符间距</span>
              <el-input-number 
                v-model="textForm.letterSpacing" 
                :min="0" 
                :max="2" 
                :step="0.1"
                size="mini"
                @change="updateLetterSpacing"
              ></el-input-number>
            </div>
            <div class="row">
              <span>弯曲强度</span>
              <el-input-number 
                v-model="textForm.curvingStrength" 
                :min="0" 
                :max="2" 
                :step="0.1"
                size="mini"
                @change="updateCurvingStrength"
              ></el-input-number>
            </div>
            <div class="row">
              <span>起始角度</span>
              <el-input-number 
                v-model="textForm.startAngle" 
                :min="-180" 
                :max="180" 
                :step="5"
                size="mini"
                @change="updateStartAngle"
              ></el-input-number>
            </div>
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
    </div>
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
import { ref, computed, watch } from 'vue'
export default {
  name: 'PropertyPanel',
  props: {
    selectedTextObject: {
      type: Object,
      default: null
    },
    textList: {
      type: Array,
      default: () => []
    }
  },
  emits: [
    'updateTextContent',
    'updateTextColor', 
    'updateTextMode',
    'updateTextFont',
    'updateTextSize',
    'updateTextThickness',
    'updateTextDirection',
    'updateLetterSpacing',
    'updateCurvingStrength',
    'updateStartAngle',
    'deleteSelectedText',
    'deleteText',
    'selectText',
    'duplicateText'
  ],
  setup(props, { emit }) {
    const activeNames = ref(['text', 'base', 'color', 'design'])
    
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
      thickness: 0.1,
      // 圆柱面特有属性
      direction: 1,
      letterSpacing: 0.1,
      curvingStrength: 1.0,
      startAngle: 0
    })
    
    // 检查选中文字是否在圆柱面上
    const isSelectedTextOnCylinder = computed(() => {
      return props.selectedTextObject && 
             props.selectedTextObject.mesh &&
             props.selectedTextObject.mesh.userData.surfaceType === 'cylinder'
    })
    
    // 当前选中文字的显示名称
    const currentTextDisplayName = computed(() => {
      if (!props.selectedTextObject) return ''
      const textItem = props.textList.find(t => t.id === props.selectedTextObject.id)
      return textItem ? textItem.displayName : '文字'
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
          thickness: newTextObject.config.thickness || 0.1,
          // 圆柱面特有属性
          direction: newTextObject.config.direction || 1,
          letterSpacing: newTextObject.config.letterSpacing || 0.1,
          curvingStrength: newTextObject.config.curvingStrength || 1.0,
          startAngle: newTextObject.config.startAngle || 0
        }
      }
    }, { immediate: true })
    
    const price = computed(() =>
      (Math.round(form.value.thickness * 128 * form.value.scale * 100) / 100).toFixed(2)
    )
    
    // 选择文字项
    const selectTextItem = (text) => {
      emit('selectText', text.id)
    }
    
    // 删除文字项
    const deleteTextItem = (textId) => {
      emit('deleteText', textId)
    }
    
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
    
    // 圆柱面特有属性更新方法
    const updateTextDirection = () => {
      if (props.selectedTextObject) {
        emit('updateTextDirection', props.selectedTextObject.id, textForm.value.direction)
      }
    }
    
    const updateLetterSpacing = () => {
      if (props.selectedTextObject) {
        emit('updateLetterSpacing', props.selectedTextObject.id, textForm.value.letterSpacing)
      }
    }
    
    const updateCurvingStrength = () => {
      if (props.selectedTextObject) {
        emit('updateCurvingStrength', props.selectedTextObject.id, textForm.value.curvingStrength)
      }
    }
    
    const updateStartAngle = () => {
      if (props.selectedTextObject) {
        emit('updateStartAngle', props.selectedTextObject.id, textForm.value.startAngle)
      }
    }
    
    return { 
      activeNames, 
      form, 
      textForm,
      price,
      currentTextDisplayName,
      isSelectedTextOnCylinder,
      selectTextItem,
      deleteTextItem,
      updateTextContent,
      updateTextColor,
      updateTextMode,
      updateTextFont,
      updateTextSize,
      updateTextThickness,
      updateTextDirection,
      updateLetterSpacing,
      updateCurvingStrength,
      updateStartAngle,
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
  overflow: hidden;
}
.panel-body {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
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

/* 文字列表样式 */
.text-list {
  margin-bottom: 12px;
}

.text-item {
  display: flex;
  align-items: center;
  padding: 8px 10px;
  margin-bottom: 4px;
  background: #f5f7fa;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.text-item:hover {
  background: #e6f0ff;
}

.text-item.active {
  background: #409eff;
  color: #fff;
}

.text-item.active .text-content {
  color: rgba(255, 255, 255, 0.8);
}

.text-name {
  font-weight: 500;
  margin-right: 8px;
  flex-shrink: 0;
}

.text-content {
  flex: 1;
  color: #909399;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-text {
  padding: 20px;
  text-align: center;
  color: #909399;
  font-size: 12px;
}

/* 文字属性编辑区域 */
.text-properties {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed #ebeef5;
}

.properties-title {
  font-weight: 500;
  margin-bottom: 10px;
  color: #409eff;
}

.text-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed #ebeef5;
}

/* 圆柱面属性样式 */
.cylinder-properties {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed #e4e7ed;
}

.properties-subtitle {
  font-size: 12px;
  color: #909399;
  margin-bottom: 8px;
  font-weight: 500;
}

.properties-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
  color: #303133;
}
</style>
