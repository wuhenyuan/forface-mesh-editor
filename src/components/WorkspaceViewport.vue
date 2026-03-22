<template>
  <div class="viewport" ref="container">
    <!-- Floating UI -->
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
    config: {
      type: Object,
      default: null,
    },
    originPath: {
      type: String,
      default: '',
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
    let transformMode = 'translate';

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
      if (!a || !b) return true;
      return (
        a.rotationOrder === b.rotationOrder &&
        a.position?.every((v, i) => v === b.position[i]) &&
        a.rotation?.every((v, i) => v === b.rotation[i]) &&
        a.scale?.every((v, i) => v === b.scale[i])
      );
    };

    const getSelectedRuntimeObject = () => store.selectedRuntimeObject?.() || null;

    const syncSelectedTransformToStore = () => {
      const selectedObject = getSelectedRuntimeObject();
      if (!selectedObject) {
        store.clearSelectedObjectTransform?.();
        return;
      }
      store.syncSelectedObjectTransformFromObject?.(selectedObject);
    };

    const getPrimarySnapshot = (snapshots = []) => {
      if (!Array.isArray(snapshots) || snapshots.length === 0) return null;
      const selectedObject = getSelectedRuntimeObject();
      const entityKey = selectedObject?.userData?.entityKey;
      if (entityKey) {
        const matched = snapshots.find((item) => item?.id === entityKey);
        if (matched) return matched;
      }
      return snapshots[0];
    };

    const toCommandState = (snapshot, fallbackObject) => {
      if (!snapshot) return snapshotTransform(fallbackObject);
      return {
        position: [...(snapshot.position || [0, 0, 0])],
        rotation: [...(snapshot.rotation || [0, 0, 0])],
        rotationOrder: fallbackObject?.rotation?.order || 'XYZ',
        scale: [...(snapshot.scale || [1, 1, 1])],
      };
    };

    const isEditableElement = (target) => {
      if (!target || typeof target !== 'object') return false;
      const element = target;
      if (element.isContentEditable) return true;
      const tagName = String(element.tagName || '').toLowerCase();
      return tagName === 'input' || tagName === 'textarea' || tagName === 'select';
    };

    const handleTransformShortcut = (event) => {
      if (!event || event.defaultPrevented) return;
      if (event.isComposing || event.keyCode === 229) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isEditableElement(event.target)) return;

      const key = String(event.key || '').toLowerCase();
      if (key === 'w') {
        core?.setTransformMode?.('translate');
        event.preventDefault();
        return;
      }

      if (key === 'e') {
        core?.setTransformMode?.('rotate');
        event.preventDefault();
        return;
      }

      if (key === 'r') {
        core?.setTransformMode?.('scale');
        event.preventDefault();
      }
    };

    const buildConfigFromOriginPath = (path) => ({
      feature: [
        {
          id: 'originModel',
          type: 'model',
          url: path,
          position: [0, 0, 0],
          scale: [1, 1, 1],
          rotation: [0, 0, 0],
          boolean: 'union',
          meta: {
            type: 'origin',
          },
        },
      ],
    });

    const getLoadConfig = (config, originPath) => {
      if (config && typeof config === 'object') return config;
      if (typeof originPath === 'string' && originPath)
        return buildConfigFromOriginPath(originPath);
      return null;
    };

    const loadFromProps = (config, originPath) => {
      if (!core) return;
      const next = getLoadConfig(config, originPath);
      if (!next) return;
      core.load?.(next);
      store.setHistorySnapshot?.(core.getHistorySnapshot?.());
    };

    const initCore = async () => {
      core = new EditorCore(container.value);

      bindViewerEvents();
      loadFromProps(props.config, props.originPath);

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
        syncSelectedTransformToStore();
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
        store.deselectText(textObject);
        emit('textDeselected', textObject);
      });

      emitter.on('textDeleted', ({ id, textObject }) => {
        emit('textDeleted', { id, textObject });
      });

      emitter.on('objectSelected', ({ object }) => {
        store.selectObject(object);
        syncSelectedTransformToStore();
        emit('objectSelected', object);
      });

      emitter.on('objectDeselected', ({ object }) => {
        store.deselectObject(object);
        store.clearSelectedObjectTransform?.();
        emit('objectDeselected', object);
      });

      emitter.on('objectSelectionCleared', () => {
        store.deselectObject();
        store.clearSelectedObjectTransform?.();
      });

      emitter.on('transformModeChanged', ({ mode }) => {
        transformMode = mode;
      });

      emitter.on('transform:start', ({ mode }) => {
        transformMode = mode || transformMode;
      });

      emitter.on('transform:preview', (payload) => {
        const current = getPrimarySnapshot(payload?.targets);
        if (!current) return;
        store.setSelectedObjectTransform?.({
          position: [...(current.position || [0, 0, 0])],
          rotation: [...(current.rotation || [0, 0, 0])],
          scale: [...(current.scale || [1, 1, 1])],
        });
      });

      emitter.on('transform:commit', (payload) => {
        if (store.isHistoryApplying()) return;

        const afterSnapshot = getPrimarySnapshot(payload?.after);
        if (!afterSnapshot) return;

        const selectedObject = getSelectedRuntimeObject();
        const beforeSnapshot = getPrimarySnapshot(payload?.before);
        const beforeState = toCommandState(beforeSnapshot, selectedObject);
        const afterState = toCommandState(afterSnapshot, selectedObject);

        if (isSameTransform(beforeState, afterState)) {
          syncSelectedTransformToStore();
          return;
        }

        const entityKey = afterSnapshot?.id || selectedObject?.userData?.entityKey;
        const name = selectedObject?.name ? ` ${selectedObject.name}` : '';
        const description = `Transform${name} (${payload?.mode || transformMode})`;

        if (entityKey) {
          store
            .updateEntity(
              entityKey,
              {
                position: afterState?.position || [0, 0, 0],
                rotation: afterState?.rotation || [0, 0, 0],
                scale: afterState?.scale || [1, 1, 1],
              },
              { description }
            )
            .catch((err) => {
              console.error('Failed to update entity transform:', err);
            });
        } else if (selectedObject) {
          store
            .executeCommand(
              new TransformCommand(selectedObject, beforeState, afterState, {
                description,
                document: core?.document,
              })
            )
            .catch((err) => {
              console.error('Failed to record transform command:', err);
            });
        }

      });

      emitter.on('transform:cancel', () => {
        syncSelectedTransformToStore();
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

      emitter.on('keydown', ({ event }) => {
        handleTransformShortcut(event);
      });

      emitter.on('escape', () => {
        core?.documentVisual?.getObjectSelectionManager?.()?.cancelCurrentTransform?.();
        store.hideAllFloatingUI();
      });
    };

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
            .catch((err) => console.error('Failed to enter construct mode:', err));
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

    const handleColorConfirm = ({ color, target }) => {
      if (!target) return;

      if (target.userData?.isText) {
        const textId = target.userData.textId;
        store.updateEntity(textId, { color }, { description: 'Update text color' }).catch((err) => {
          console.error('Failed to update text color:', err);
        });
        return;
      }

      const entityKey = target.userData?.entityKey;
      if (entityKey) {
        store.updateEntity(entityKey, { color }, { description: 'Update object color' }).catch((err) => {
          console.error('Failed to update object color:', err);
        });
        return;
      }

      core?.setObjectColor?.(target, color);
    };

    const handleTransformModeChange = ({ mode }) => {
      core?.setTransformMode?.(mode);
    };

    const handleDuplicate = (target) => {
      console.log('Duplicate object:', target?.name);
    };

    const handleDelete = (target) => {
      if (!target) return;

      if (target.userData?.isText) {
        const textId = target.userData.textId;
        store.delEntity(textId, { description: 'Delete text' }).catch((err) => {
          console.error('Failed to delete text:', err);
        });
      } else {
        const entityKey = target?.userData?.entityKey;
        if (entityKey) {
          store.delEntity(entityKey).catch((err) => {
            console.error('Failed to delete entity:', err);
          });
        } else {
          core?.removeMesh?.(target);
        }
      }

      store.hideEditMenu();
    };

    watch(
      () => props.currentTool,
      (newTool, oldTool) => {
        if (!core) return;

        if (newTool === 'text') {
          store
            .setViewMode('construct')
            .then(() => core?.enableTextMode?.())
            .catch((err) => console.error('Failed to enter construct mode:', err));
        } else if (oldTool === 'text') {
          core?.disableTextMode?.();
        }
      }
    );

    watch(
      () => [props.config, props.originPath],
      ([nextConfig, nextOriginPath]) => {
        loadFromProps(nextConfig, nextOriginPath);
      }
    );

    const getExposedMethods = () => ({
      getCore: () => core,
    });

    expose(getExposedMethods());

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

