<template>
  <div class="viewport" ref="container">
    <!-- 浮动 UI -->
    <context-menu @select="handleContextMenuSelect" />
    <color-picker @confirm="handleColorConfirm" />
    <edit-menu
      @modeChange="handleTransformModeChange"
      @duplicate="handleDuplicate"
      @delete="handleDelete"
    />
    <floating-tooltip />
  </div>
</template>

<script>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { EditorCore, TransformCommand } from '../core';
import { EntityEvent } from '../types/events';
import config2 from '../../config/config2';
import { useEditorStore } from '../store';
import { ContextMenu, ColorPicker, EditMenu, FloatingTooltip } from './floating';

export default {
  name: 'WorkspaceViewport',
  components: {
    ContextMenu,
    ColorPicker,
    EditMenu,
    FloatingTooltip,
  },
  props: {
    currentTool: {
      type: String,
      default: 'base',
    },
  },
  emits: [
    'textCreated',
    'textSelected',
    'textDeselected',
    'textDeleted',
    'objectSelected',
    'objectDeselected',
  ],
  setup(props, { emit, expose }) {
    const container = ref(null);
    const store = useEditorStore();
    let core = null;

    let selectedObject = null;
    let transformMode = 'translate';
    let transformBefore = null;
    let lastTransformPayload = null;

    const snapshotTransform = (object) => {
      if (!object) return null;
      return {
        position: [object.position.x, object.position.y, object.position.z],
        rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
        rotationOrder: object.rotation.order,
        scale: [object.scale.x, object.scale.y, object.scale.z],
      };
    };

    const isSameTransform = (a, b) => {
      if (!a || !b) return false;
      return (
        a.rotationOrder === b.rotationOrder &&
        a.position?.every((v, i) => v === b.position[i]) &&
        a.rotation?.every((v, i) => v === b.rotation[i]) &&
        a.scale?.every((v, i) => v === b.scale[i])
      );
    };

    // 初始化
    const initCore = async () => {
      core = new EditorCore(container.value);

      bindViewerEvents();
      core.load?.(config2);
      store.setHistorySnapshot?.(core.getHistorySnapshot?.());

      core.initTextSystem?.();
      core.initObjectSelection?.();

      store.setWorkspaceRef({ value: getExposedMethods() });

      store.setViewMode(store.state.viewMode, { force: true }).catch((err) => {
        console.error('Failed to sync viewMode:', err);
      });

      if (import.meta.env.DEV) {
        window.editorCore = core;
      }
    };

    // 事件绑定
    const bindViewerEvents = () => {
      const emitter = core.emitter;

      emitter.on('contextmenu', ({ x, y, target, targetType }) => {
        store.showContextMenu({ x, y, target, targetType });
      });

      emitter.on('modelLoaded', ({ modelId, model }) => {
        if (!model) return;
        if (modelId === 'default') {
          model.name = 'DefaultModel';
          console.log('Default model loaded: shiba.glb');
          return;
        }
        if (modelId === 'objModel') {
          model.name = 'ObjModel';
          model.position.x = 0.15;
          console.log('OBJ model loaded (x=0.15)');
          return;
        }
        if (modelId === 'stlModel') {
          model.name = 'StlModel';
          model.position.x = -0.15;
          console.log('STL model loaded (x=-0.15)');
        }
      });

      emitter.on('click', ({ target }) => {
        if (!target) {
          store.hideAllFloatingUI();
        }
      });

      emitter.on('select', ({ target, targetType }) => {
        if (targetType === 'object') {
          const rect = container.value.getBoundingClientRect();
          store.showEditMenu({
            x: rect.left + rect.width / 2,
            y: rect.top + 60,
            target,
          });
        }
      });

      emitter.on('deselect', () => {
        store.hideEditMenu();
      });

      emitter.on('documentCleared', () => {
        store.resetEntities();
      });

      emitter.on(EntityEvent.addEntity, (payload) => {
        store.syncEntityAdded(payload);
      });

      emitter.on(EntityEvent.updateEntity, (payload) => {
        store.syncEntityUpdated(payload);
      });

      emitter.on(EntityEvent.delEntity, (payload) => {
        store.syncEntityRemoved(payload);
      });

      emitter.on('historyChanged', (snapshot) => {
        store.setHistorySnapshot(snapshot);
      });

      emitter.on('textCreated', ({ textObject }) => {
        emit('textCreated', textObject);
      });

      emitter.on('textSelected', ({ textObject }) => {
        store.selectText(textObject);
        emit('textSelected', textObject);
      });

      emitter.on('textDeselected', ({ textObject }) => {
        store.deselectText();
        emit('textDeselected', textObject);
      });

      emitter.on('textDeleted', ({ id, textObject }) => {
        emit('textDeleted', { id, textObject });
      });

      emitter.on('objectSelected', ({ object }) => {
        selectedObject = object;
        store.selectObject(object);
        emit('objectSelected', object);
      });

      emitter.on('objectDeselected', ({ object }) => {
        if (selectedObject?.uuid === object?.uuid) {
          selectedObject = null;
        }
        store.deselectObject();
        emit('objectDeselected', object);
      });

      emitter.on('objectSelectionCleared', () => {
        selectedObject = null;
        store.deselectObject();
      });

      emitter.on('objectTransformed', (data) => {
        lastTransformPayload = data;
      });

      emitter.on('transformModeChanged', ({ mode }) => {
        transformMode = mode;
      });

      emitter.on('objectDragging', ({ isDragging }) => {
        if (store.isHistoryApplying()) return;
        if (!selectedObject) return;

        if (isDragging) {
          transformBefore = snapshotTransform(selectedObject);
          return;
        }

        if (!transformBefore) return;
        const before = transformBefore;
        const after = snapshotTransform(selectedObject);
        if (isSameTransform(before, after)) {
          transformBefore = null;
          lastTransformPayload = null;
          return;
        }

        const entityKey =
          lastTransformPayload?.object?.userData?.entityKey || selectedObject?.userData?.entityKey;
        const name = selectedObject?.name ? ` ${selectedObject.name}` : '';
        transformBefore = null;
        const description = `变换${name} (${transformMode})`;

        if (entityKey) {
          store
            .updateEntity(
              entityKey,
              {
                position: after?.position || [0, 0, 0],
                rotation: after?.rotation || [0, 0, 0],
                scale: after?.scale || [1, 1, 1],
              },
              { description }
            )
            .catch((err) => {
              console.error('更新实体变换失败:', err);
            });
        } else {
          store
            .executeCommand(
              new TransformCommand(selectedObject, before, after, {
                description,
                document: core?.document,
              })
            )
            .catch((err) => {
              console.error('记录变换失败:', err);
            });
        }
        lastTransformPayload = null;
      });

      emitter.on('hover', ({ target, event }) => {
        if (target?.name) {
          store.showTooltip({
            x: event.clientX,
            y: event.clientY,
            content: target.name,
          });
        }
      });

      emitter.on('hoverEnd', () => {
        store.hideTooltip();
      });

      emitter.on('deleteRequest', ({ target }) => {
        handleDelete(target);
      });

      emitter.on('escape', () => {
        store.hideAllFloatingUI();
      });
    };

    // 右键菜单处理
    const handleContextMenuSelect = ({ key, target }) => {
      switch (key) {
        case 'editText':
          if (target?.userData?.textId) {
            core?.selectText?.(target.userData.textId);
          }
          break;

        case 'changeColor': {
          const currentColor = target?.material?.color?.getHexString?.() || 'ffffff';
          store.showColorPicker({
            x: store.state.contextMenu.x,
            y: store.state.contextMenu.y + 10,
            target,
            currentColor: '#' + currentColor,
          });
          break;
        }

        case 'duplicate':
          handleDuplicate(target);
          break;

        case 'delete':
          handleDelete(target);
          break;

        case 'addText':
          store
            .setViewMode('construct')
            .then(() => core?.enableTextMode?.())
            .catch((err) => console.error('进入编辑态失败', err));
          break;

        case 'select':
          core?.selectObject?.(target);
          break;

        case 'hide':
          core?.setObjectVisible?.(target, false);
          break;

        case 'resetView':
          core?.resetView?.();
          break;
      }
    };

    // 颜色选择处理
    const handleColorConfirm = ({ color, target }) => {
      if (!target) return;

      if (target.userData?.isText) {
        const textId = target.userData.textId;
        store.updateEntity(textId, { color }, { description: '更新文字颜色' }).catch((err) => {
          console.error('更新文字颜色失败:', err);
        });
        return;
      }

      const entityKey = target.userData?.entityKey;
      if (entityKey) {
        store.updateEntity(entityKey, { color }, { description: '更新对象颜色' }).catch((err) => {
          console.error('更新对象颜色失败:', err);
        });
        return;
      }

      core?.setObjectColor?.(target, color);
    };

    // 编辑菜单处理
    const handleTransformModeChange = ({ mode }) => {
      core?.setTransformMode?.(mode);
    };

    const handleDuplicate = (target) => {
      console.log('复制对象:', target?.name);
    };

    const handleDelete = (target) => {
      if (!target) return;

      if (target.userData?.isText) {
        const textId = target.userData.textId;
        store.delEntity(textId, { description: '删除文字' }).catch((err) => {
          console.error('删除文字失败:', err);
        });
      } else {
        const entityKey = target?.userData?.entityKey;
        if (entityKey) {
          store.delEntity(entityKey).catch((err) => {
            console.error('删除实体失败:', err);
          });
        } else {
          core?.removeMesh?.(target);
        }
      }

      store.hideEditMenu();
    };

    // 工具切换
    watch(
      () => props.currentTool,
      (newTool, oldTool) => {
        if (!core) return;

        if (newTool === 'text') {
          store
            .setViewMode('construct')
            .then(() => core?.enableTextMode?.())
            .catch((err) => console.error('进入编辑态失败', err));
        } else if (oldTool === 'text') {
          core?.disableTextMode?.();
        }
      }
    );

    // 暴露方法
    const getExposedMethods = () => ({
      getCore: () => core,
    });

    expose(getExposedMethods());

    // 生命周期
    onMounted(() => {
      initCore();
    });

    onBeforeUnmount(() => {
      if (core) {
        core.dispose();
        core = null;
      }
    });

    return {
      container,
      handleContextMenuSelect,
      handleColorConfirm,
      handleTransformModeChange,
      handleDuplicate,
      handleDelete,
    };
  },
};
</script>

<style scoped>
.viewport {
  width: 100%;
  height: 100%;
  position: relative;
  background: #f7f8fa;
  overflow: hidden;
}

.viewport :deep(canvas) {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
