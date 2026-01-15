export interface DocumentEventBus {
  on: (event: string, callback: (...args: any[]) => void) => () => void;
  once: (event: string, callback: (...args: any[]) => void) => () => void;
  off: (event: string, callback?: (...args: any[]) => void) => void;
  emit: (event: string, data?: any) => void;
  onAny: (callback: (event: string, data?: any) => void) => () => void;
  clear: () => void;
}
