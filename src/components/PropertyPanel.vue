<template>
  <div class="property-panel">
    <div class="title">工艺信息</div>
    <div class="panel-body">
      <el-collapse v-model="activeNames">
        <!-- 文字列表面板 -->
        <el-collapse-item title="文字属性" name="text">
          <div class="text-list" v-if="textList.length > 0">
            <div
              v-for="text in textList"
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
            <div class="properties-title">{{ selectedTextName }} 属性</div>
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
              <el-select v-model="textForm.mode" size="mini" @change="updateTextMode">
                <el-option label="凸起" value="raised"></el-option>
                <el-option label="内嵌" value="engraved"></el-option>
              </el-select>
            </div>

            <!-- 圆柱面特有属性 -->
            <div v-if="isOnCylinder" class="cylinder-properties">
              <div class="properties-subtitle">圆柱面属性</div>
              <div class="row">
                <span>环绕方向</span>
                <el-select v-model="textForm.direction" size="mini" @change="updateTextDirection">
                  <el-option label="顺时针" :value="1"></el-option>
                  <el-option label="逆时针" :value="-1"></el-option>
                </el-select>
              </div>
              <div class="row">
                <span>字符间距</span>
                <editor-input-number
                  v-model="textForm.letterSpacing"
                  :min="0"
                  :max="2"
                  :step="0.1"
                  size="mini"
                  @change="updateLetterSpacing"
                ></editor-input-number>
              </div>
              <div class="row">
                <span>弯曲强度</span>
                <editor-input-number
                  v-model="textForm.curvingStrength"
                  :min="0"
                  :max="2"
                  :step="0.1"
                  size="mini"
                  @change="updateCurvingStrength"
                ></editor-input-number>
              </div>
              <div class="row">
                <span>起始角度</span>
                <editor-input-number
                  v-model="textForm.startAngle"
                  :min="-180"
                  :max="180"
                  :step="5"
                  size="mini"
                  @change="updateStartAngle"
                ></editor-input-number>
              </div>
            </div>

            <div class="row">
              <span>字体</span>
              <el-select v-model="textForm.font" size="mini" @change="updateTextFont">
                <el-option label="Helvetiker" value="helvetiker"></el-option>
                <el-option label="Helvetiker Bold" value="helvetiker_bold"></el-option>
              </el-select>
            </div>
            <div class="row">
              <span>大小</span>
              <editor-input-number
                v-model="textForm.size"
                :min="0.1"
                :max="10"
                :step="0.1"
                size="mini"
                @change="updateTextSize"
              ></editor-input-number>
            </div>
            <div class="row">
              <span>厚度</span>
              <editor-input-number
                v-model="textForm.thickness"
                :min="0.01"
                :max="2"
                :step="0.01"
                size="mini"
                @change="updateTextThickness"
              ></editor-input-number>
            </div>
            <div class="properties-subtitle">变换</div>
            <div class="row">
              <span>位置</span>
              <div class="axis-inputs">
                <editor-input-number
                  v-model="textForm.position.x"
                  :step="0.1"
                  size="mini"
                  @change="updateTextTransform"
                ></editor-input-number>
                <editor-input-number
                  v-model="textForm.position.y"
                  :step="0.1"
                  size="mini"
                  @change="updateTextTransform"
                ></editor-input-number>
                <editor-input-number
                  v-model="textForm.position.z"
                  :step="0.1"
                  size="mini"
                  @change="updateTextTransform"
                ></editor-input-number>
              </div>
            </div>
            <div class="row">
              <span>旋转(弧度)</span>
              <div class="axis-inputs">
                <editor-input-number
                  v-model="textForm.rotation.x"
                  :step="0.1"
                  size="mini"
                  @change="updateTextTransform"
                ></editor-input-number>
                <editor-input-number
                  v-model="textForm.rotation.y"
                  :step="0.1"
                  size="mini"
                  @change="updateTextTransform"
                ></editor-input-number>
                <editor-input-number
                  v-model="textForm.rotation.z"
                  :step="0.1"
                  size="mini"
                  @change="updateTextTransform"
                ></editor-input-number>
              </div>
            </div>
            <div class="row">
              <span>缩放</span>
              <div class="axis-inputs">
                <editor-input-number
                  v-model="textForm.scale.x"
                  :min="0.01"
                  :step="0.1"
                  size="mini"
                  @change="updateTextTransform"
                ></editor-input-number>
                <editor-input-number
                  v-model="textForm.scale.y"
                  :min="0.01"
                  :step="0.1"
                  size="mini"
                  @change="updateTextTransform"
                ></editor-input-number>
                <editor-input-number
                  v-model="textForm.scale.z"
                  :min="0.01"
                  :step="0.1"
                  size="mini"
                  @change="updateTextTransform"
                ></editor-input-number>
              </div>
            </div>
            <div class="text-actions">
              <el-button size="mini" @click="deleteSelectedText" type="danger">删除文字</el-button>
            </div>
          </div>
        </el-collapse-item>

        <el-collapse-item title="对象变换" name="object">
          <div v-if="selectedObject" class="object-properties">
            <div class="row">
              <span>位置</span>
              <div class="axis-inputs">
                <editor-input-number
                  v-model="objectForm.position.x"
                  :step="0.1"
                  size="mini"
                  @change="updateObjectTransform"
                ></editor-input-number>
                <editor-input-number
                  v-model="objectForm.position.y"
                  :step="0.1"
                  size="mini"
                  @change="updateObjectTransform"
                ></editor-input-number>
                <editor-input-number
                  v-model="objectForm.position.z"
                  :step="0.1"
                  size="mini"
                  @change="updateObjectTransform"
                ></editor-input-number>
              </div>
            </div>
            <div class="row">
              <span>旋转(弧度)</span>
              <div class="axis-inputs">
                <editor-input-number
                  v-model="objectForm.rotation.x"
                  :step="0.1"
                  size="mini"
                  @change="updateObjectTransform"
                ></editor-input-number>
                <editor-input-number
                  v-model="objectForm.rotation.y"
                  :step="0.1"
                  size="mini"
                  @change="updateObjectTransform"
                ></editor-input-number>
                <editor-input-number
                  v-model="objectForm.rotation.z"
                  :step="0.1"
                  size="mini"
                  @change="updateObjectTransform"
                ></editor-input-number>
              </div>
            </div>
            <div class="row">
              <span>缩放</span>
              <div class="axis-inputs">
                <editor-input-number
                  v-model="objectForm.scale.x"
                  :min="0.01"
                  :step="0.1"
                  size="mini"
                  @change="updateObjectTransform"
                ></editor-input-number>
                <editor-input-number
                  v-model="objectForm.scale.y"
                  :min="0.01"
                  :step="0.1"
                  size="mini"
                  @change="updateObjectTransform"
                ></editor-input-number>
                <editor-input-number
                  v-model="objectForm.scale.z"
                  :min="0.01"
                  :step="0.1"
                  size="mini"
                  @change="updateObjectTransform"
                ></editor-input-number>
              </div>
            </div>
          </div>
          <div v-else class="empty-text">
            <span>未选中对象</span>
          </div>
        </el-collapse-item>

        <el-collapse-item title="基本尺寸" name="base">
          <div class="row">
            <span>体积</span>
            <el-input size="mini" v-model="form.volume" disabled></el-input>
          </div>
          <div class="row">
            <span>外形尺寸</span>
            <el-input size="mini" v-model="form.size" disabled></el-input>
          </div>
        </el-collapse-item>

        <el-collapse-item title="颜色" name="color">
          <div class="colors">
            <el-color-picker v-model="form.color" size="small"></el-color-picker>
            <el-color-picker v-model="form.color2" size="small"></el-color-picker>
            <el-color-picker v-model="form.color3" size="small"></el-color-picker>
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
import { ref, computed, watch, reactive } from 'vue';
import { useEditorStore } from '../store';
import EditorInputNumber from './common/SmartInputNumber.vue';

export default {
  name: 'PropertyPanel',
  components: {
    'editor-input-number': EditorInputNumber,
  },
  setup() {
    const store = useEditorStore();
    const activeNames = ref(['text', 'object', 'base', 'color']);

    // 从 store 获取数据
    const selectedTextObject = computed(() => store.state.selectedTextObject);
    const selectedObject = computed(() => store.state.selectedObject);
    const selectedObjectTransform = computed(() => store.state.selectedObjectTransform);
    const textList = computed(() => store.getTextList());
    const selectedTextName = computed(() => store.selectedTextName());
    const isOnCylinder = computed(() => store.isSelectedTextOnCylinder());

    // 基本表单
    const form = reactive({
      volume: '36531.36mm³',
      size: '120×120×180.00mm',
      color: '#409eff',
      color2: '#67c23a',
      color3: '#e6a23c',
    });

    // 文字表单
    const textForm = reactive({
      content: '',
      color: '#333333',
      mode: 'raised',
      font: 'helvetiker',
      size: 1,
      thickness: 0.1,
      direction: 1,
      letterSpacing: 0.1,
      curvingStrength: 1.0,
      startAngle: 0,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    });

    const objectForm = reactive({
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    });

    const price = computed(() => '128.00');

    // 同步选中文字到表单
    watch(
      selectedTextObject,
      (obj) => {
        if (obj) {
          textForm.content = obj.content || '';
          textForm.color = '#' + (obj.material?.color?.getHexString?.() || '333333');
          textForm.mode = obj.mode || 'raised';
          textForm.font = obj.config?.font || 'helvetiker';
          textForm.size = obj.config?.size || 1;
          textForm.thickness = obj.config?.thickness || 0.1;
          textForm.direction = obj.config?.direction || 1;
          textForm.letterSpacing = obj.config?.letterSpacing || 0.1;
          textForm.curvingStrength = obj.config?.curvingStrength || 1.0;
          textForm.startAngle = obj.config?.startAngle || 0;
          const transformTarget = obj.entityObject || obj.mesh;
          if (transformTarget) {
            textForm.position.x = transformTarget.position.x;
            textForm.position.y = transformTarget.position.y;
            textForm.position.z = transformTarget.position.z;
            textForm.rotation.x = transformTarget.rotation.x;
            textForm.rotation.y = transformTarget.rotation.y;
            textForm.rotation.z = transformTarget.rotation.z;
            textForm.scale.x = transformTarget.scale.x;
            textForm.scale.y = transformTarget.scale.y;
            textForm.scale.z = transformTarget.scale.z;
          }
        }
      },
      { immediate: true }
    );

    watch(
      selectedObject,
      (obj) => {
        if (!obj) {
          objectForm.position.x = 0;
          objectForm.position.y = 0;
          objectForm.position.z = 0;
          objectForm.rotation.x = 0;
          objectForm.rotation.y = 0;
          objectForm.rotation.z = 0;
          objectForm.scale.x = 1;
          objectForm.scale.y = 1;
          objectForm.scale.z = 1;
          return;
        }
        objectForm.position.x = obj.position.x;
        objectForm.position.y = obj.position.y;
        objectForm.position.z = obj.position.z;
        objectForm.rotation.x = obj.rotation.x;
        objectForm.rotation.y = obj.rotation.y;
        objectForm.rotation.z = obj.rotation.z;
        objectForm.scale.x = obj.scale.x;
        objectForm.scale.y = obj.scale.y;
        objectForm.scale.z = obj.scale.z;
      },
      { immediate: true }
    );

    watch(
      selectedObjectTransform,
      (transform) => {
        if (!transform) return;
        const [px = 0, py = 0, pz = 0] = transform.position || [];
        const [rx = 0, ry = 0, rz = 0] = transform.rotation || [];
        const [sx = 1, sy = 1, sz = 1] = transform.scale || [];
        objectForm.position.x = px;
        objectForm.position.y = py;
        objectForm.position.z = pz;
        objectForm.rotation.x = rx;
        objectForm.rotation.y = ry;
        objectForm.rotation.z = rz;
        objectForm.scale.x = sx;
        objectForm.scale.y = sy;
        objectForm.scale.z = sz;
      },
      { immediate: true, deep: true }
    );

    // 获取 core 引用
    const getCore = () => store.getCore?.() || store.state.workspaceRef?.value?.getCore?.();

    // 选择文字
    const selectTextItem = (text) => {
      getCore()?.selectText?.(text.id);
    };

    // 删除文字
    const deleteTextItem = (textId) => {
      store.delEntity(textId, { description: '删除文字' }).catch((err) => {
        console.error('删除文字失败:', err);
      });
    };

    const deleteSelectedText = () => {
      const id = selectedTextObject.value?.id;
      if (!id) return;
      store.delEntity(id, { description: '删除文字' }).catch((err) => {
        console.error('删除文字失败:', err);
      });
    };

    // 更新方法
    const updateTextContent = () => {
      if (selectedTextObject.value) {
        store
          .updateEntity(
            selectedTextObject.value.id,
            { content: textForm.content },
            { description: '更新文字内容' }
          )
          .catch((err) => {
            console.error('更新文字内容失败:', err);
          });
      }
    };

    const updateTextColor = () => {
      if (selectedTextObject.value) {
        store
          .updateEntity(
            selectedTextObject.value.id,
            { color: textForm.color },
            { description: '更新文字颜色' }
          )
          .catch((err) => {
            console.error('更新文字颜色失败:', err);
          });
      }
    };

    const updateTextMode = () => {
      if (selectedTextObject.value) {
        store
          .updateEntity(
            selectedTextObject.value.id,
            { textType: textForm.mode },
            { description: '更新文字模式' }
          )
          .catch((err) => {
            console.error('切换文字模式失败:', err);
          });
      }
    };

    const updateTextFont = () => {
      if (selectedTextObject.value) {
        store
          .updateEntity(
            selectedTextObject.value.id,
            { resource: textForm.font },
            { description: '更新文字配置' }
          )
          .catch((err) => {
            console.error('更新文字配置失败:', err);
          });
      }
    };

    const updateTextSize = () => {
      if (selectedTextObject.value) {
        store
          .updateEntity(
            selectedTextObject.value.id,
            { size: textForm.size },
            { description: '更新文字配置' }
          )
          .catch((err) => {
            console.error('更新文字配置失败:', err);
          });
      }
    };

    const updateTextThickness = () => {
      if (selectedTextObject.value) {
        store
          .updateEntity(
            selectedTextObject.value.id,
            { depth: textForm.thickness },
            { description: '更新文字配置' }
          )
          .catch((err) => {
            console.error('更新文字配置失败:', err);
          });
      }
    };

    const updateTextDirection = () => {
      if (selectedTextObject.value) {
        store
          .updateEntity(
            selectedTextObject.value.id,
            { direction: textForm.direction },
            { description: '更新文字配置' }
          )
          .catch((err) => {
            console.error('更新文字配置失败:', err);
          });
      }
    };

    const updateLetterSpacing = () => {
      if (selectedTextObject.value) {
        store
          .updateEntity(
            selectedTextObject.value.id,
            { letterSpacing: textForm.letterSpacing },
            { description: '更新文字配置' }
          )
          .catch((err) => {
            console.error('更新文字配置失败:', err);
          });
      }
    };

    const updateCurvingStrength = () => {
      if (selectedTextObject.value) {
        store
          .updateEntity(
            selectedTextObject.value.id,
            { curvingStrength: textForm.curvingStrength },
            { description: '更新文字配置' }
          )
          .catch((err) => {
            console.error('更新文字配置失败:', err);
          });
      }
    };

    const updateStartAngle = () => {
      if (selectedTextObject.value) {
        store
          .updateEntity(
            selectedTextObject.value.id,
            { startAngle: textForm.startAngle },
            { description: '更新文字配置' }
          )
          .catch((err) => {
            console.error('更新文字配置失败:', err);
          });
      }
    };

    const updateTextTransform = () => {
      const textId = selectedTextObject.value?.id;
      if (!textId) return;
      store
        .updateEntity(
          textId,
          {
            position: [textForm.position.x, textForm.position.y, textForm.position.z],
            rotation: [textForm.rotation.x, textForm.rotation.y, textForm.rotation.z],
            scale: [textForm.scale.x, textForm.scale.y, textForm.scale.z],
          },
          { description: '更新文字变换' }
        )
        .catch((err) => {
          console.error('更新文字变换失败:', err);
        });
    };

    const updateObjectTransform = () => {
      const obj = selectedObject.value;
      const entityKey = obj?.userData?.entityKey;
      if (!entityKey) return;
      const transformPayload = {
        position: [objectForm.position.x, objectForm.position.y, objectForm.position.z],
        rotation: [objectForm.rotation.x, objectForm.rotation.y, objectForm.rotation.z],
        scale: [objectForm.scale.x, objectForm.scale.y, objectForm.scale.z],
      };
      store.setSelectedObjectTransform?.(transformPayload);
      store
        .updateEntity(
          entityKey,
          transformPayload,
          { description: '更新对象变换' }
        )
        .catch((err) => {
          console.error('更新对象变换失败:', err);
        });
    };

    return {
      activeNames,
      form,
      textForm,
      price,
      selectedTextObject,
      selectedObject,
      textList,
      selectedTextName,
      isOnCylinder,
      selectTextItem,
      deleteTextItem,
      deleteSelectedText,
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
      updateTextTransform,
      updateObjectTransform,
      objectForm,
    };
  },
};
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
  grid-template-columns: 80px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  padding: 6px 0;
}
.axis-inputs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  min-width: 0;
}
.axis-inputs :deep(.el-input-number) {
  width: 100%;
  min-width: 0;
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

/* 文字列表 */
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

/* 文字属性 */
.text-properties {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed #ebeef5;
}
.properties-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
  color: #303133;
}
.properties-subtitle {
  font-size: 12px;
  color: #909399;
  margin-bottom: 8px;
  font-weight: 500;
}
.cylinder-properties {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed #e4e7ed;
}
.text-actions {
  display: flex;
  gap: 6px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed #ebeef5;
}
</style>
