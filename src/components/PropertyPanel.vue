<template>
  <div class="property-panel">
    <div class="title">工艺信息</div>
    <div class="panel-body">
      <el-collapse v-model="activeNames">
        <el-collapse-item title="实体信息" name="entity">
          <div class="entity-list" v-if="entityList.length > 0">
            <div
              v-for="entity in entityList"
              :key="entity.id"
              class="entity-item"
              :class="{ active: selectedEntityId === entity.id }"
              @click="selectEntityItem(entity)"
            >
              <div class="entity-item-main">
                <span class="entity-type" :class="entity.type">{{ entity.typeLabel }}</span>
                <span class="entity-name">{{ entity.displayName }}</span>
              </div>
              <span class="entity-summary">{{ entity.summary }}</span>
            </div>
          </div>
          <div v-else class="empty-state">
            <span>暂无模型或文字</span>
          </div>

          <div v-if="selectedEntity" class="entity-properties">
            <div class="properties-title">{{ selectedEntityName }} 属性</div>

            <div class="row">
              <span>类型</span>
              <el-input size="mini" :value="selectedEntityTypeLabel" disabled></el-input>
            </div>

            <template v-if="isTextEntity">
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
            </template>

            <template v-else>
              <div class="row">
                <span>资源</span>
                <el-input size="mini" :value="selectedModelResource" disabled></el-input>
              </div>
              <div class="row">
                <span>布尔</span>
                <el-input size="mini" :value="selectedModelBoolean" disabled></el-input>
              </div>
              <div class="row">
                <span>颜色</span>
                <el-input size="mini" :value="selectedModelColor" disabled></el-input>
              </div>
            </template>

            <div class="properties-subtitle">变换</div>
            <div class="row">
              <span>位置</span>
              <div class="axis-inputs">
                <editor-input-number
                  v-model="transformForm.position.x"
                  :step="0.1"
                  size="mini"
                  @change="updateSelectedEntityTransform"
                ></editor-input-number>
                <editor-input-number
                  v-model="transformForm.position.y"
                  :step="0.1"
                  size="mini"
                  @change="updateSelectedEntityTransform"
                ></editor-input-number>
                <editor-input-number
                  v-model="transformForm.position.z"
                  :step="0.1"
                  size="mini"
                  @change="updateSelectedEntityTransform"
                ></editor-input-number>
              </div>
            </div>
            <div class="row">
              <span>旋转(弧度)</span>
              <div class="axis-inputs">
                <editor-input-number
                  v-model="transformForm.rotation.x"
                  :step="0.1"
                  size="mini"
                  @change="updateSelectedEntityTransform"
                ></editor-input-number>
                <editor-input-number
                  v-model="transformForm.rotation.y"
                  :step="0.1"
                  size="mini"
                  @change="updateSelectedEntityTransform"
                ></editor-input-number>
                <editor-input-number
                  v-model="transformForm.rotation.z"
                  :step="0.1"
                  size="mini"
                  @change="updateSelectedEntityTransform"
                ></editor-input-number>
              </div>
            </div>
            <div class="row">
              <span>缩放</span>
              <div class="axis-inputs">
                <editor-input-number
                  v-model="transformForm.scale.x"
                  :min="0.01"
                  :step="0.1"
                  size="mini"
                  @change="updateSelectedEntityTransform"
                ></editor-input-number>
                <editor-input-number
                  v-model="transformForm.scale.y"
                  :min="0.01"
                  :step="0.1"
                  size="mini"
                  @change="updateSelectedEntityTransform"
                ></editor-input-number>
                <editor-input-number
                  v-model="transformForm.scale.z"
                  :min="0.01"
                  :step="0.1"
                  size="mini"
                  @change="updateSelectedEntityTransform"
                ></editor-input-number>
              </div>
            </div>

            <div class="text-actions" v-if="isTextEntity">
              <el-button size="mini" @click="deleteSelectedText" type="danger">删除文字</el-button>
            </div>
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
      <div class="value">¥{{ price }}</div>
    </div>
    <div class="actions">
      <el-button type="default">设计交流</el-button>
      <el-button type="primary">设计下单</el-button>
    </div>
  </div>
</template>

<script>
import { computed, reactive, ref, watch } from 'vue';
import { useEditorStore } from '../store';
import EditorInputNumber from './common/SmartInputNumber.vue';

const createTransformForm = () => ({
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
});

const resetTransformForm = (target) => {
  target.position.x = 0;
  target.position.y = 0;
  target.position.z = 0;
  target.rotation.x = 0;
  target.rotation.y = 0;
  target.rotation.z = 0;
  target.scale.x = 1;
  target.scale.y = 1;
  target.scale.z = 1;
};

const applyTransformToAxisForm = (formTarget, transform) => {
  if (!formTarget || !transform) return;
  const [px = 0, py = 0, pz = 0] = transform.position || [];
  const [rx = 0, ry = 0, rz = 0] = transform.rotation || [];
  const [sx = 1, sy = 1, sz = 1] = transform.scale || [];
  formTarget.position.x = px;
  formTarget.position.y = py;
  formTarget.position.z = pz;
  formTarget.rotation.x = rx;
  formTarget.rotation.y = ry;
  formTarget.rotation.z = rz;
  formTarget.scale.x = sx;
  formTarget.scale.y = sy;
  formTarget.scale.z = sz;
};

const normalizeColorValue = (value, fallback = '#333333') => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `#${Math.max(0, value).toString(16).padStart(6, '0').slice(-6)}`;
  }
  if (typeof value === 'string' && value.trim()) {
    return value.startsWith('#') ? value : `#${value.replace(/^#/, '')}`;
  }
  return fallback;
};

const resolveResourceLabel = (resource) => {
  if (typeof resource === 'string' && resource) {
    const segments = resource.split(/[\\/]/).filter(Boolean);
    return segments[segments.length - 1] || resource;
  }
  if (resource) return 'Binary asset';
  return '-';
};

const toVector3 = (value, fallback) => {
  if (!Array.isArray(value)) return [...fallback];
  const [x = fallback[0], y = fallback[1], z = fallback[2]] = value;
  return [x, y, z];
};

const buildTransformFromEntity = (entity) => {
  if (!entity || typeof entity !== 'object') return null;
  const transform = entity.transform && typeof entity.transform === 'object' ? entity.transform : {};
  const rotationSource = Array.isArray(entity.rotation)
    ? entity.rotation
    : Array.isArray(entity.rotate)
      ? entity.rotate
      : transform.rotation;
  return {
    position: toVector3(entity.position || transform.position, [0, 0, 0]),
    rotation: toVector3(rotationSource, [0, 0, 0]),
    scale: toVector3(entity.scale || transform.scale, [1, 1, 1]),
  };
};

export default {
  name: 'PropertyPanel',
  components: {
    'editor-input-number': EditorInputNumber,
  },
  setup() {
    const store = useEditorStore();
    const activeNames = ref(['entity', 'base', 'color']);

    const selectedEntityId = computed(() => store.selectedEntityId?.() || null);
    const selectedObjectTransform = computed(() => store.state.selectedObjectTransform);
    const entityList = computed(() => store.getEntityList?.() || []);
    const selectedEntity = computed(() => store.selectedEntity?.() || null);
    const selectedEntityName = computed(() => selectedEntity.value?.displayName || '');
    const selectedEntityTypeLabel = computed(
      () => selectedEntity.value?.typeLabel || selectedEntity.value?.type || '-'
    );
    const isTextEntity = computed(() => selectedEntity.value?.type === 'text');
    const isOnCylinder = computed(() => store.isSelectedTextOnCylinder());
    const selectedModelResource = computed(() =>
      resolveResourceLabel(selectedEntity.value?.resource)
    );
    const selectedModelBoolean = computed(() => {
      const booleanValue = selectedEntity.value?.boolean;
      return typeof booleanValue === 'string' && booleanValue ? booleanValue : '-';
    });
    const selectedModelColor = computed(() => normalizeColorValue(selectedEntity.value?.color, '-'));

    const form = reactive({
      volume: '36531.36mm³',
      size: '120×120×180.00mm',
      color: '#409eff',
      color2: '#67c23a',
      color3: '#e6a23c',
    });

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
    });

    const transformForm = reactive(createTransformForm());

    const resetTextForm = () => {
      textForm.content = '';
      textForm.color = '#333333';
      textForm.mode = 'raised';
      textForm.font = 'helvetiker';
      textForm.size = 1;
      textForm.thickness = 0.1;
      textForm.direction = 1;
      textForm.letterSpacing = 0.1;
      textForm.curvingStrength = 1.0;
      textForm.startAngle = 0;
    };

    const price = computed(() => '128.00');

    watch(
      selectedEntity,
      (entity) => {
        if (!entity) {
          resetTextForm();
          resetTransformForm(transformForm);
          return;
        }

        if (entity.type === 'text') {
          textForm.content = typeof entity.content === 'string' ? entity.content : '';
          textForm.color = normalizeColorValue(entity.color, '#333333');
          textForm.mode = entity.textType || 'raised';
          textForm.font = typeof entity.resource === 'string' ? entity.resource : 'helvetiker';
          textForm.size = entity.size || 1;
          textForm.thickness = entity.depth || 0.1;
          textForm.direction = entity.direction || 1;
          textForm.letterSpacing = entity.letterSpacing || 0.1;
          textForm.curvingStrength = entity.curvingStrength || 1.0;
          textForm.startAngle = entity.startAngle || 0;
        } else {
          resetTextForm();
        }
      },
      { immediate: true, deep: true }
    );

    watch(
      [selectedEntity, selectedObjectTransform],
      ([entity, runtimeTransform]) => {
        const nextTransform = runtimeTransform || buildTransformFromEntity(entity);
        if (!nextTransform) {
          resetTransformForm(transformForm);
          return;
        }
        applyTransformToAxisForm(transformForm, nextTransform);
      },
      { immediate: true, deep: true }
    );

    const getCore = () => store.getCore?.() || store.state.workspaceRef?.value?.getCore?.();

    const selectEntityItem = (entity) => {
      if (!entity?.id) return;

      const core = getCore();
      if (!core) return;

      if (entity.type === 'text') {
        core.selectText?.(entity.id);
        return;
      }

      const target = core.getModelById?.(entity.id);
      if (target) {
        core.selectObject?.(target);
      }
    };

    const deleteSelectedText = () => {
      const id = isTextEntity.value ? selectedEntityId.value : null;
      if (!id) return;
      store.delEntity(id, { description: '删除文字' }).catch((err) => {
        console.error('删除文字失败:', err);
      });
    };

    const updateTextContent = () => {
      const id = isTextEntity.value ? selectedEntityId.value : null;
      if (!id) return;
      store.updateEntity(id, { content: textForm.content }, { description: '更新文字内容' }).catch((err) => {
        console.error('更新文字内容失败:', err);
      });
    };

    const updateTextColor = () => {
      const id = isTextEntity.value ? selectedEntityId.value : null;
      if (!id) return;
      store.updateEntity(id, { color: textForm.color }, { description: '更新文字颜色' }).catch((err) => {
        console.error('更新文字颜色失败:', err);
      });
    };

    const updateTextMode = () => {
      const id = isTextEntity.value ? selectedEntityId.value : null;
      if (!id) return;
      store.updateEntity(id, { textType: textForm.mode }, { description: '更新文字模式' }).catch((err) => {
        console.error('切换文字模式失败:', err);
      });
    };

    const updateTextFont = () => {
      const id = isTextEntity.value ? selectedEntityId.value : null;
      if (!id) return;
      store.updateEntity(id, { resource: textForm.font }, { description: '更新文字配置' }).catch((err) => {
        console.error('更新文字配置失败:', err);
      });
    };

    const updateTextSize = () => {
      const id = isTextEntity.value ? selectedEntityId.value : null;
      if (!id) return;
      store.updateEntity(id, { size: textForm.size }, { description: '更新文字配置' }).catch((err) => {
        console.error('更新文字配置失败:', err);
      });
    };

    const updateTextThickness = () => {
      const id = isTextEntity.value ? selectedEntityId.value : null;
      if (!id) return;
      store.updateEntity(id, { depth: textForm.thickness }, { description: '更新文字配置' }).catch((err) => {
        console.error('更新文字配置失败:', err);
      });
    };

    const updateTextDirection = () => {
      const id = isTextEntity.value ? selectedEntityId.value : null;
      if (!id) return;
      store.updateEntity(id, { direction: textForm.direction }, { description: '更新文字配置' }).catch((err) => {
        console.error('更新文字配置失败:', err);
      });
    };

    const updateLetterSpacing = () => {
      const id = isTextEntity.value ? selectedEntityId.value : null;
      if (!id) return;
      store
        .updateEntity(id, { letterSpacing: textForm.letterSpacing }, { description: '更新文字配置' })
        .catch((err) => {
          console.error('更新文字配置失败:', err);
        });
    };

    const updateCurvingStrength = () => {
      const id = isTextEntity.value ? selectedEntityId.value : null;
      if (!id) return;
      store
        .updateEntity(id, { curvingStrength: textForm.curvingStrength }, { description: '更新文字配置' })
        .catch((err) => {
          console.error('更新文字配置失败:', err);
        });
    };

    const updateStartAngle = () => {
      const id = isTextEntity.value ? selectedEntityId.value : null;
      if (!id) return;
      store.updateEntity(id, { startAngle: textForm.startAngle }, { description: '更新文字配置' }).catch((err) => {
        console.error('更新文字配置失败:', err);
      });
    };

    const updateSelectedEntityTransform = () => {
      const entityId = selectedEntityId.value;
      if (!entityId) return;
      const transformPayload = {
        position: [transformForm.position.x, transformForm.position.y, transformForm.position.z],
        rotation: [transformForm.rotation.x, transformForm.rotation.y, transformForm.rotation.z],
        scale: [transformForm.scale.x, transformForm.scale.y, transformForm.scale.z],
      };
      store.updateEntity(entityId, transformPayload, { description: '更新实体变换' }).catch((err) => {
        console.error('更新实体变换失败:', err);
      });
    };

    return {
      activeNames,
      entityList,
      selectedEntity,
      selectedEntityId,
      selectedEntityName,
      selectedEntityTypeLabel,
      selectedModelResource,
      selectedModelBoolean,
      selectedModelColor,
      isTextEntity,
      isOnCylinder,
      form,
      textForm,
      transformForm,
      price,
      selectEntityItem,
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
      updateSelectedEntityTransform,
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

.entity-list {
  margin-bottom: 12px;
}

.entity-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px;
  margin-bottom: 6px;
  background: #f5f7fa;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.entity-item:hover {
  background: #eef5ff;
  border-color: #c6e2ff;
}

.entity-item.active {
  background: #e6f0ff;
  border-color: #409eff;
}

.entity-item-main {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.entity-type {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  color: #409eff;
  background: #ecf5ff;
}

.entity-type.model {
  color: #67c23a;
  background: #f0f9eb;
}

.entity-name {
  font-weight: 600;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entity-summary {
  color: #909399;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-state {
  padding: 20px;
  text-align: center;
  color: #909399;
  font-size: 12px;
}

.entity-properties {
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
