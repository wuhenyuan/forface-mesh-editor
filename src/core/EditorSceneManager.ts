import HistoryManager from './history/HistoryManager';
import { ObjectSelectionManager, ObjectSelector } from './objectSelection';
import type EditorViewer from './EditorViewer';

export class EditorSceneManager {
  history: HistoryManager;
  selector: ObjectSelectionManager | null;
  highlighter: ObjectSelector | null;
  viewer: EditorViewer | null;

  constructor(options: { viewer?: EditorViewer; history?: HistoryManager } = {}) {
    this.history = options.history || new HistoryManager();
    this.selector = null;
    this.highlighter = null;
    this.viewer = null;

    if (options.viewer) {
      this.attachViewer(options.viewer);
    }
  }

  attachViewer(viewer: EditorViewer) {
    this.viewer = viewer;
    this.selector =
      (viewer.initObjectSelection?.() as ObjectSelectionManager | null) ||
      (viewer.getObjectSelectionManager?.() as ObjectSelectionManager | null) ||
      null;
    const selector = this.selector as
      | (ObjectSelectionManager & { objectSelector?: ObjectSelector })
      | null;
    this.highlighter = selector?.objectSelector || null;
  }

  dispose() {
    this.selector = null;
    this.highlighter = null;
    this.viewer = null;
  }
}

export default EditorSceneManager;
