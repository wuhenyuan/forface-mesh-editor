type SurfaceTextEventCallback = (...args: CoreValue[]) => void;

export class SurfaceTextEventHub {
  private _listeners: Map<string, SurfaceTextEventCallback[]>;

  constructor() {
    this._listeners = new Map();
  }

  get listeners() {
    return this._listeners;
  }

  on(eventName: string, callback: SurfaceTextEventCallback) {
    if (!this._listeners.has(eventName)) {
      this._listeners.set(eventName, []);
    }
    this._listeners.get(eventName)?.push(callback);
  }

  off(eventName: string, callback: SurfaceTextEventCallback) {
    const listeners = this._listeners.get(eventName);
    if (!listeners) return;

    const index = listeners.indexOf(callback);
    if (index !== -1) {
      listeners.splice(index, 1);
    }
  }

  emit(eventName: string, ...args: CoreValue[]) {
    const listeners = this._listeners.get(eventName);
    if (!listeners) return;

    listeners.forEach((callback) => {
      try {
        callback(...args);
      } catch (error) {
        console.error(`Error in event listener for ${eventName}:`, error);
      }
    });
  }

  clear() {
    this._listeners.clear();
  }
}

export default SurfaceTextEventHub;
