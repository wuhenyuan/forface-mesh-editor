import * as THREE from 'three';
import type { ObjectSelectionManager } from '../../objectSelection';
import type { SurfaceTextManager } from '../../surfaceText';
import type { ViewerEventBus } from './types';

type OutlineHelpers = {
  setOutlineSelection?: (object: THREE.Object3D) => void;
  clearOutlineSelection?: () => void;
};

type ObjectSelectionEventBindings = {
  manager: ObjectSelectionManager;
  events: ViewerEventBus;
  outlineHelpers?: OutlineHelpers | null;
  setControlsEnabled: (enabled: boolean) => void;
  getSelectedTextId: () => string | null;
  getTextManager: () => SurfaceTextManager | null;
};

function isManagedTextId(textManager: SurfaceTextManager | null, textId: string | null) {
  if (!textManager || !textId) return false;
  if (textManager.textObjects?.has?.(textId)) {
    return true;
  }
  const textObjects = textManager.getAllTextObjects?.() || [];
  return textObjects.some((item) => item?.id === textId);
}

export function resolveTextIdFromObject(target: THREE.Object3D | null) {
  if (!target) return null;

  const candidates: string[] = [];
  const pushCandidate = (value: unknown) => {
    if (typeof value !== 'string' || !value || candidates.includes(value)) return;
    candidates.push(value);
  };

  pushCandidate(target.userData?.entityKey);
  pushCandidate(target.userData?.textId);

  target.traverse?.((child: THREE.Object3D) => {
    pushCandidate(child.userData?.entityKey);
    pushCandidate(child.userData?.textId);
  });

  return candidates[0] || null;
}

export function bindObjectSelectionManagerEvents(bindings: ObjectSelectionEventBindings) {
  const { manager, events, outlineHelpers, setControlsEnabled, getSelectedTextId, getTextManager } =
    bindings;

  manager.on('objectSelected', (object: THREE.Object3D) => {
    const textManager = getTextManager();
    const textId = resolveTextIdFromObject(object);
    const activeTextId =
      textManager?.getSelectedTextObject?.()?.id || getSelectedTextId();

    const resolvedTextId = isManagedTextId(textManager, textId) ? textId : null;

    if (resolvedTextId && activeTextId !== resolvedTextId) {
      textManager?.selectText?.(resolvedTextId, { syncEntitySelection: false });
    } else if (!resolvedTextId && activeTextId) {
      textManager?.deselectText?.(true, { syncEntitySelection: false });
    }

    events.emit('objectSelected', { object });
    outlineHelpers?.setOutlineSelection?.(object);
  });

  manager.on('objectDeselected', (object: THREE.Object3D) => {
    events.emit('objectDeselected', { object });
    outlineHelpers?.clearOutlineSelection?.();
  });

  manager.on('selectionCleared', () => {
    events.emit('objectSelectionCleared');
    outlineHelpers?.clearOutlineSelection?.();
  });

  manager.on('draggingChanged', (isDragging: boolean) => {
    setControlsEnabled(!isDragging);
    events.emit('objectDragging', { isDragging });
  });

  manager.on('objectTransformed', (payload) => {
    events.emit('objectTransformed', payload);
  });
  manager.on('transformModeChanged', (mode) => {
    events.emit('transformModeChanged', { mode });
  });
  manager.on('transform:start', (payload) => {
    events.emit('transform:start', payload);
  });
  manager.on('transform:preview', (payload) => {
    events.emit('transform:preview', payload);
  });
  manager.on('transform:commit', (payload) => {
    events.emit('transform:commit', payload);
  });
  manager.on('transform:cancel', (payload) => {
    events.emit('transform:cancel', payload);
  });
  manager.on('bbox:updated', (payload) => {
    events.emit('bbox:updated', payload);
  });
}

export function disableObjectSelectorNativeClick(manager: ObjectSelectionManager | null) {
  const objectSelectionManager = manager as {
    objectSelector?: {
      domElement?: HTMLElement;
      handleClick?: (mouseEvent: MouseEvent) => void;
    };
  } | null;

  const objectSelector = objectSelectionManager?.objectSelector;
  const domElement = objectSelector?.domElement;
  const handleClick = objectSelector?.handleClick;
  if (domElement && typeof handleClick === 'function') {
    domElement.removeEventListener('click', handleClick);
  }
}
