export interface DocumentEventBus {
  on: (event: string, callback: (...args: CoreValue[]) => void) => () => void;
  once: (event: string, callback: (...args: CoreValue[]) => void) => () => void;
  off: (event: string, callback?: (...args: CoreValue[]) => void) => void;
  emit: (event: string, data?: CoreValue) => void;
  onAny: (callback: (event: string, data?: CoreValue) => void) => () => void;
  clear: () => void;
}
