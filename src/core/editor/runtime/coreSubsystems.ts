import { ExportManager } from '../../ExportManager';
import { LoaderManager } from '../../LoaderManager';
import { ProjectManager } from '../../ProjectManager';
import { FeatureDetector } from '../../facePicking/FeatureDetector';
import type { FeatureDetectorLike, ViewerEventBus } from './types';

export type EditorCoreSubsystems = {
  featureDetector: FeatureDetectorLike;
  loaderManager: LoaderManager;
  exportManager: ExportManager;
  projectManager: ProjectManager;
};

export function createEditorCoreSubsystems(events: ViewerEventBus): EditorCoreSubsystems {
  const featureDetector = new FeatureDetector() as FeatureDetectorLike;
  const loaderManager = new LoaderManager();
  const exportManager = new ExportManager();
  const projectManager = new ProjectManager();

  loaderManager.setFeatureDetector(featureDetector);

  loaderManager.onProgress = (progress) => {
    events.emit('loadProgress', progress);
  };
  loaderManager.onError = (error) => {
    events.emit('loadError', { error });
  };

  exportManager.onProgress = (progress) => {
    events.emit('exportProgress', progress);
  };
  exportManager.onError = (error) => {
    events.emit('exportError', { error });
  };

  projectManager.onChange = (event) => {
    events.emit('projectChanged', event);
  };
  projectManager.onSave = (event) => {
    events.emit('projectSaved', event);
  };
  projectManager.onLoad = (event) => {
    events.emit('projectLoaded', event);
  };

  featureDetector.onDetectionStart = (modelId) => {
    events.emit('featureDetectionStart', { modelId });
  };
  featureDetector.onDetectionProgress = (modelId, progress) => {
    events.emit('featureDetectionProgress', { modelId, progress });
  };
  featureDetector.onDetectionComplete = (result) => {
    events.emit('featureDetectionComplete', result);
  };

  return {
    featureDetector,
    loaderManager,
    exportManager,
    projectManager,
  };
}
