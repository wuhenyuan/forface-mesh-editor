export interface DocumentEventBus {
  on: (event: string, callback: (...args: unknown[]) => void) => () => void;
  once: (event: string, callback: (...args: unknown[]) => void) => () => void;
  off: (event: string, callback?: (...args: unknown[]) => void) => void;
  emit: (event: string, data?: unknown) => void;
  onAny: (callback: (event: string, data?: unknown) => void) => () => void;
  clear: () => void;
}
