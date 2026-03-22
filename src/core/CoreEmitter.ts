import mitt, { Emitter, Handler } from 'mitt';

export type CoreEventHandler<T = CoreValue> = (event: T) => void;
export type CoreAnyHandler = (event: string, payload?: CoreValue) => void;

export class CoreEmitter<Events extends Record<string, CoreValue> = Record<string, CoreValue>> {
  private _emitter: Emitter<Events>;
  private _anyListeners: Set<CoreAnyHandler>;

  constructor(emitter?: Emitter<Events>) {
    this._emitter = emitter || mitt<Events>();
    this._anyListeners = new Set();
  }

  on<Key extends keyof Events>(type: Key, handler: Handler<Events[Key]>) {
    this._emitter.on(type, handler);
    return () => this.off(type, handler);
  }

  once<Key extends keyof Events>(type: Key, handler: Handler<Events[Key]>) {
    const wrapper: Handler<Events[Key]> = (event) => {
      this.off(type, wrapper);
      handler(event);
    };
    return this.on(type, wrapper);
  }

  off<Key extends keyof Events>(type: Key, handler?: Handler<Events[Key]>) {
    this._emitter.off(type, handler);
  }

  emit<Key extends keyof Events>(type: Key, event?: Events[Key]) {
    this._emitter.emit(type, event as Events[Key]);
    if (this._anyListeners.size > 0) {
      this._anyListeners.forEach((listener) => {
        listener(String(type), event);
      });
    }
  }

  onAny(handler: CoreAnyHandler) {
    this._anyListeners.add(handler);
    return () => this._anyListeners.delete(handler);
  }

  clear() {
    this._emitter.all.clear();
    this._anyListeners.clear();
  }

  get raw() {
    return this._emitter;
  }
}

export default CoreEmitter;
