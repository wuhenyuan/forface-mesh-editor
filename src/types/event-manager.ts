export type EventCallback<T = unknown> = (data: T) => void

export interface IEventManager {
  on<T>(event: string, callback: EventCallback<T>): void
  off<T>(event: string, callback: EventCallback<T>): void
  emit<T>(event: string, data?: T): void
  once<T>(event: string, callback: EventCallback<T>): void
  clear(): void
}

export interface EventSubscription {
  event: string
  callback: EventCallback
  once: boolean
}

export type EventMap = Map<string, Set<EventCallback>>
