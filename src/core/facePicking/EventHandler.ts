type ModifierState = {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
};

type MousePoint = {
  x: number;
  y: number;
};

type MouseState = {
  isDown: boolean;
  lastPosition: MousePoint;
  dragThreshold: number;
  isDragging: boolean;
};

type MousePositionInfo = {
  client: MousePoint;
  offset: MousePoint;
  normalized: MousePoint;
  rect: DOMRect;
};

type FacePickerLike = {
  emit: (eventName: string, ...args: CoreValue[]) => void;
  handleMouseMove?: (event: MouseEvent) => void;
  handleClick?: (event: MouseEvent) => void;
  handleKeyDown?: (event: KeyboardEvent) => void;
  clearSelection?: () => void;
  undo?: () => boolean;
  redo?: () => boolean;
  getSelectedFaces?: () => CoreValue[];
  getSelectionStats?: () => CoreValue;
  getHighlightStats?: () => CoreValue;
};

type EventHandlerState = {
  isEnabled: boolean;
  mouseState: MouseState;
  keyState: ModifierState;
  throttleDelay: number;
};

export class EventHandler {
  facePicker: FacePickerLike;
  domElement: HTMLElement;
  isEnabled: boolean;
  mouseState: MouseState;
  keyState: ModifierState;
  throttleDelay: number;
  lastMouseMoveTime: number;

  constructor(facePicker: FacePickerLike, domElement: HTMLElement) {
    this.facePicker = facePicker;
    this.domElement = domElement;

    this.isEnabled = false;
    this.mouseState = {
      isDown: false,
      lastPosition: { x: 0, y: 0 },
      dragThreshold: 5,
      isDragging: false,
    };
    this.keyState = {
      ctrl: false,
      shift: false,
      alt: false,
    };
    this.throttleDelay = 16;
    this.lastMouseMoveTime = 0;

    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleClick = this.handleClick.bind(this);
    this.handleDoubleClick = this.handleDoubleClick.bind(this);
    this.handleContextMenu = this.handleContextMenu.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    this.handleWheel = this.handleWheel.bind(this);
    this.handleResize = this.handleResize.bind(this);
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
  }

  enable() {
    if (this.isEnabled) return;
    this.isEnabled = true;

    this.domElement.addEventListener('mousedown', this.handleMouseDown);
    this.domElement.addEventListener('mouseup', this.handleMouseUp);
    this.domElement.addEventListener('mousemove', this.handleMouseMove);
    this.domElement.addEventListener('click', this.handleClick);
    this.domElement.addEventListener('dblclick', this.handleDoubleClick);
    this.domElement.addEventListener('contextmenu', this.handleContextMenu);
    this.domElement.addEventListener('wheel', this.handleWheel, { passive: false });

    document.addEventListener('keydown', this.handleKeyDown);
    document.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('resize', this.handleResize);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);

    this.domElement.style.cursor = 'crosshair';
    this.domElement.tabIndex = 0;
  }

  disable() {
    if (!this.isEnabled) return;
    this.isEnabled = false;

    this.domElement.removeEventListener('mousedown', this.handleMouseDown);
    this.domElement.removeEventListener('mouseup', this.handleMouseUp);
    this.domElement.removeEventListener('mousemove', this.handleMouseMove);
    this.domElement.removeEventListener('click', this.handleClick);
    this.domElement.removeEventListener('dblclick', this.handleDoubleClick);
    this.domElement.removeEventListener('contextmenu', this.handleContextMenu);
    this.domElement.removeEventListener('wheel', this.handleWheel);

    document.removeEventListener('keydown', this.handleKeyDown);
    document.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('resize', this.handleResize);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);

    this.domElement.style.cursor = 'default';
    this.resetState();
  }

  handleMouseDown(event: MouseEvent) {
    if (!this.isEnabled) return;

    this.mouseState.isDown = true;
    this.mouseState.lastPosition = { x: event.clientX, y: event.clientY };
    this.mouseState.isDragging = false;
    this.domElement.focus();

    this.facePicker.emit('mouseDown', {
      event,
      position: this.getMousePosition(event),
      button: event.button,
      modifiers: this.getModifierState(),
    });
  }

  handleMouseUp(event: MouseEvent) {
    if (!this.isEnabled) return;

    this.mouseState.isDown = false;
    this.facePicker.emit('mouseUp', {
      event,
      position: this.getMousePosition(event),
      button: event.button,
      modifiers: this.getModifierState(),
      wasDragging: this.mouseState.isDragging,
    });

    this.mouseState.isDragging = false;
  }

  handleMouseMove(event: MouseEvent) {
    if (!this.isEnabled) return;

    const now = Date.now();
    if (now - this.lastMouseMoveTime < this.throttleDelay) return;
    this.lastMouseMoveTime = now;

    const currentPosition: MousePoint = { x: event.clientX, y: event.clientY };

    if (this.mouseState.isDown && !this.mouseState.isDragging) {
      const deltaX = Math.abs(currentPosition.x - this.mouseState.lastPosition.x);
      const deltaY = Math.abs(currentPosition.y - this.mouseState.lastPosition.y);

      if (deltaX > this.mouseState.dragThreshold || deltaY > this.mouseState.dragThreshold) {
        this.mouseState.isDragging = true;
        this.facePicker.emit('dragStart', {
          event,
          startPosition: this.mouseState.lastPosition,
          currentPosition,
        });
      }
    }

    if (this.mouseState.isDragging) {
      this.facePicker.emit('drag', {
        event,
        startPosition: this.mouseState.lastPosition,
        currentPosition,
        delta: {
          x: currentPosition.x - this.mouseState.lastPosition.x,
          y: currentPosition.y - this.mouseState.lastPosition.y,
        },
      });
      return;
    }

    this.facePicker.handleMouseMove?.(event);
    this.facePicker.emit('mouseMove', {
      event,
      position: this.getMousePosition(event),
      modifiers: this.getModifierState(),
    });
  }

  handleClick(event: MouseEvent) {
    if (!this.isEnabled) return;
    if (this.mouseState.isDragging) return;

    this.facePicker.handleClick?.(event);
    this.facePicker.emit('click', {
      event,
      position: this.getMousePosition(event),
      button: event.button,
      modifiers: this.getModifierState(),
    });
  }

  handleDoubleClick(event: MouseEvent) {
    if (!this.isEnabled) return;

    this.facePicker.emit('doubleClick', {
      event,
      position: this.getMousePosition(event),
      button: event.button,
      modifiers: this.getModifierState(),
    });
    event.preventDefault();
  }

  handleContextMenu(event: MouseEvent) {
    if (!this.isEnabled) return;

    this.facePicker.emit('contextMenu', {
      event,
      position: this.getMousePosition(event),
      modifiers: this.getModifierState(),
    });
    event.preventDefault();
  }

  handleKeyDown(event: KeyboardEvent) {
    if (!this.isEnabled) return;

    this.updateModifierState(event);
    this.facePicker.handleKeyDown?.(event);

    this.facePicker.emit('keyDown', {
      event,
      key: event.key,
      code: event.code,
      modifiers: this.getModifierState(),
    });

    this.handleShortcuts(event);
  }

  handleKeyUp(event: KeyboardEvent) {
    if (!this.isEnabled) return;

    this.updateModifierState(event);
    this.facePicker.emit('keyUp', {
      event,
      key: event.key,
      code: event.code,
      modifiers: this.getModifierState(),
    });
  }

  handleWheel(event: WheelEvent) {
    if (!this.isEnabled) return;

    this.facePicker.emit('wheel', {
      event,
      delta: {
        x: event.deltaX,
        y: event.deltaY,
        z: event.deltaZ,
      },
      position: this.getMousePosition(event),
      modifiers: this.getModifierState(),
    });

    if (this.keyState.ctrl || this.keyState.shift) {
      event.preventDefault();
    }
  }

  handleResize(event: Event) {
    if (!this.isEnabled) return;

    this.facePicker.emit('resize', {
      event,
      size: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
    });
  }

  handleVisibilityChange(event: Event) {
    if (!this.isEnabled) return;

    if (document.hidden) {
      this.resetState();
    }

    this.facePicker.emit('visibilityChange', {
      event,
      hidden: document.hidden,
    });
  }

  handleShortcuts(event: KeyboardEvent) {
    const { key, ctrlKey, metaKey, shiftKey } = event;
    const isCtrl = ctrlKey || metaKey;
    const normalizedKey = String(key || '').toLowerCase();

    const shortcuts: Record<string, () => void> = {
      escape: () => this.facePicker.clearSelection?.(),
      a: () => {
        if (isCtrl) this.handleSelectAll(event);
      },
      z: () => {
        if (!isCtrl) return;
        if (shiftKey) this.facePicker.redo?.();
        else this.facePicker.undo?.();
      },
      y: () => {
        if (isCtrl) this.facePicker.redo?.();
      },
      f: () => this.handleFocusSelection(event),
      h: () => this.handleToggleHighlight(event),
      i: () => {
        if (isCtrl && shiftKey) this.handleShowInfo(event);
      },
    };

    const handler = shortcuts[normalizedKey];
    handler?.();
  }

  handleSelectAll(event: KeyboardEvent) {
    event.preventDefault();
  }

  handleFocusSelection(_event: KeyboardEvent) {
    const selectedFaces = this.facePicker.getSelectedFaces?.() || [];
    if (selectedFaces.length > 0) {
      console.log('Focus selection', selectedFaces.length);
    }
  }

  handleToggleHighlight(_event: KeyboardEvent) {
    console.log('Toggle highlight');
  }

  handleShowInfo(event: KeyboardEvent) {
    const stats = this.facePicker.getSelectionStats?.() || {};
    const highlightStats = this.facePicker.getHighlightStats?.() || {};

    console.log('FacePicker info');
    console.log('  selection:', stats);
    console.log('  highlight:', highlightStats);
    event.preventDefault();
  }

  getMousePosition(event: MouseEvent | WheelEvent): MousePositionInfo {
    const rect = this.domElement.getBoundingClientRect();
    return {
      client: { x: event.clientX, y: event.clientY },
      offset: {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      },
      normalized: {
        x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
        y: -((event.clientY - rect.top) / rect.height) * 2 + 1,
      },
      rect,
    };
  }

  updateModifierState(event: KeyboardEvent) {
    this.keyState.ctrl = event.ctrlKey || event.metaKey;
    this.keyState.shift = event.shiftKey;
    this.keyState.alt = event.altKey;
  }

  getModifierState(): ModifierState {
    return { ...this.keyState };
  }

  resetState() {
    this.mouseState.isDown = false;
    this.mouseState.isDragging = false;
    this.keyState.ctrl = false;
    this.keyState.shift = false;
    this.keyState.alt = false;
  }

  setThrottleDelay(delay: number) {
    this.throttleDelay = Math.max(0, delay);
  }

  setDragThreshold(threshold: number) {
    this.mouseState.dragThreshold = Math.max(0, threshold);
  }

  getState(): EventHandlerState {
    return {
      isEnabled: this.isEnabled,
      mouseState: { ...this.mouseState },
      keyState: { ...this.keyState },
      throttleDelay: this.throttleDelay,
    };
  }
}
