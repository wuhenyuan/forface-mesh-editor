import * as THREE from 'three';
import type { ObjectSelectionManager } from '../../objectSelection';
import type { SurfaceTextManager } from '../../surfaceText';
import type { SurfaceTextSelectionBridge } from '../../surfaceText/runtime/types';
import type {
  AddMeshOptions,
  EditorTextObject,
  EditorViewerMesh,
  ViewerEventBus,
} from './types';

type TextSelectionBridgeOptions = {
  addMesh: (mesh: EditorViewerMesh, options?: AddMeshOptions) => THREE.Object3D | void;
  removeMesh: (mesh: EditorViewerMesh) => void;
  ensureObjectSelection: () => ObjectSelectionManager | null;
  enableObjectSelection: () => void;
  isObjectSelectionEnabled: () => boolean;
  getObjectSelectionManager: () => ObjectSelectionManager | null;
};

type TextSystemEventBindings = {
  manager: SurfaceTextManager;
  textObjects: EditorTextObject[];
  events: ViewerEventBus;
  getSelectedTextId: () => string | null;
  setSelectedTextId: (textId: string | null) => void;
  setTextModeEnabled: (enabled: boolean) => void;
  setControlsEnabled: (enabled: boolean) => void;
};

type TextTransformControlsLike = {
  on?: (eventName: string, callback: (isDragging: boolean) => void) => void;
  addEventListener?: (eventName: string, callback: (event: { value: boolean }) => void) => void;
  controls?: {
    addEventListener?: (
      eventName: string,
      callback: (event: { value: boolean }) => void
    ) => void;
  };
};

export function collectTextTargetMeshes(root: THREE.Object3D | null | undefined) {
  const meshes: THREE.Mesh[] = [];

  root?.traverse?.((object: THREE.Object3D) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (mesh.userData?.isHelper) return;
    if (mesh.userData?.isTextObject) return;
    meshes.push(mesh);
  });

  return meshes;
}

export function createSurfaceTextSelectionBridge(
  options: TextSelectionBridgeOptions
): SurfaceTextSelectionBridge {
  const {
    addMesh,
    removeMesh,
    ensureObjectSelection,
    enableObjectSelection,
    isObjectSelectionEnabled,
    getObjectSelectionManager,
  } = options;

  return {
    addEntityObject: (entityObject: THREE.Object3D) => {
      addMesh(entityObject as EditorViewerMesh, {
        selectable: true,
        castShadow: false,
        receiveShadow: false,
      });
    },
    removeEntityObject: (entityObject: THREE.Object3D | null) => {
      if (!entityObject) return;
      removeMesh(entityObject as EditorViewerMesh);
    },
    selectEntityObject: (entityObject: THREE.Object3D | null) => {
      if (!entityObject) return;
      ensureObjectSelection();
      if (!isObjectSelectionEnabled()) {
        enableObjectSelection();
      }
      getObjectSelectionManager()?.selectObject?.(entityObject);
    },
    clearEntitySelection: () => {
      getObjectSelectionManager()?.clearSelection?.();
    },
    refreshEntityObjectSession: (entityObject: THREE.Object3D | null) => {
      const objectSelectionManager = getObjectSelectionManager();
      if (!entityObject || !objectSelectionManager) return;
      if (objectSelectionManager.getSelectedObject?.() !== entityObject) return;
      objectSelectionManager.beginTransformSession?.([entityObject]);
    },
  };
}

export function bindTextSystemEvents(bindings: TextSystemEventBindings) {
  const {
    manager,
    textObjects,
    events,
    getSelectedTextId,
    setSelectedTextId,
    setTextModeEnabled,
    setControlsEnabled,
  } = bindings;

  manager.on('textCreated', (textObject: EditorTextObject) => {
    textObjects.push(textObject);
    events.emit('textCreated', { textObject });
  });

  manager.on('textSelected', (textObject: EditorTextObject) => {
    setSelectedTextId(textObject?.id || null);
    events.emit('textSelected', { textObject });
  });

  manager.on('textDeselected', (textObject: EditorTextObject) => {
    setSelectedTextId(null);
    events.emit('textDeselected', { textObject });
  });

  manager.on('textDeleted', ({ id, textObject }: { id?: string; textObject?: EditorTextObject }) => {
    const index = textObjects.findIndex((object) => object.id === id);
    if (index !== -1) {
      textObjects.splice(index, 1);
    }

    if (id && getSelectedTextId() === id) {
      setSelectedTextId(null);
    }

    events.emit('textDeleted', { id, textObject });
  });

  manager.on('textContentUpdated', (payload) => {
    events.emit('textContentUpdated', payload);
  });
  manager.on('textConfigUpdated', (payload) => {
    events.emit('textConfigUpdated', payload);
  });
  manager.on('textColorUpdated', (payload) => {
    events.emit('textColorUpdated', payload);
  });
  manager.on('textModeChanged', (payload) => {
    events.emit('textModeChanged', payload);
  });
  manager.on('textModeEnabled', () => {
    setTextModeEnabled(true);
    events.emit('textModeEnabled');
  });
  manager.on('textModeDisabled', () => {
    setTextModeEnabled(false);
    events.emit('textModeDisabled');
  });
  manager.on('booleanProgress', (payload) => {
    events.emit('booleanProgress', payload);
  });
  manager.on('booleanError', (payload) => {
    events.emit('booleanError', payload);
  });

  bindTextTransformDragging(manager, setControlsEnabled);
}

function bindTextTransformDragging(
  manager: SurfaceTextManager,
  setControlsEnabled: (enabled: boolean) => void
) {
  const transformControls = manager.transformControls as TextTransformControlsLike | null;
  if (!transformControls) return;

  if (typeof transformControls.on === 'function') {
    transformControls.on('dragging-changed', (isDragging) => {
      setControlsEnabled(!isDragging);
    });
    return;
  }

  if (typeof transformControls.addEventListener === 'function') {
    transformControls.addEventListener('dragging-changed', (event) => {
      setControlsEnabled(!event.value);
    });
    return;
  }

  transformControls.controls?.addEventListener?.('dragging-changed', (event) => {
    setControlsEnabled(!event.value);
  });
}
