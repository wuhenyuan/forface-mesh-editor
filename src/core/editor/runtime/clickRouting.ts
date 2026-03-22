import type {
  ViewerClickPayload,
  ViewerEventBus,
  ViewerEventPayload,
} from './types';

type SurfaceTextClickTarget = {
  _onCanvasClick?: (mouseEvent: MouseEvent) => Promise<void> | void;
} | null;

type ObjectSelectionClickTarget = {
  objectSelector?: {
    handleClick?: (mouseEvent: MouseEvent) => void;
  };
} | null;

type ClickRoutingOptions = {
  events: ViewerEventBus;
  getSurfaceTextManager: () => SurfaceTextClickTarget;
  getObjectSelectionManager: () => ObjectSelectionClickTarget;
};

export function bindViewerClickRouting(options: ClickRoutingOptions) {
  const { events, getSurfaceTextManager, getObjectSelectionManager } = options;

  return events.on('click', async (payload?: ViewerEventPayload) => {
    const clickPayload = (payload || {}) as ViewerClickPayload;
    const event = clickPayload.event;
    if (!event) return;

    try {
      await Promise.resolve(getSurfaceTextManager()?._onCanvasClick?.(event));
    } catch (error) {
      console.error('[EditorViewer] surface text click handling failed', error);
    }

    if ((event as CoreValue)?.__surfaceTextHandled) {
      return;
    }

    getObjectSelectionManager()?.objectSelector?.handleClick?.(event);
  });
}
