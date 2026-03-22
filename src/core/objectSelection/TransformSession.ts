import * as THREE from 'three';

export type TransformMode = 'translate' | 'rotate' | 'scale';

type SessionObject = THREE.Object3D & {
  entityId?: string;
  userData?: Record<string, CoreValue>;
  markBoxDirty?: () => void;
  refreshWorldBox?: (force?: boolean) => THREE.Box3;
  getWorldBox?: (force?: boolean) => THREE.Box3;
};

type InteractionTargetState = {
  id: string;
  object: SessionObject;
  startWorldMatrix: THREE.Matrix4;
  startWorldPosition: THREE.Vector3;
  startWorldQuaternion: THREE.Quaternion;
  startWorldScale: THREE.Vector3;
  offsetToPivot: THREE.Vector3;
  isCenteredToPivot: boolean;
};

type TransformInteraction = {
  mode: TransformMode;
  startPivotWorldMatrix: THREE.Matrix4;
  startPivotWorldMatrixInverse: THREE.Matrix4;
  targetStates: InteractionTargetState[];
  beforeSnapshots: TransformSnapshot[];
};

export type TransformSnapshot = {
  id: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
};

export type TransformStartEventPayload = {
  mode: TransformMode;
  targetIds: string[];
  pivotWorldPosition: [number, number, number];
};

export type TransformPreviewEventPayload = {
  mode: TransformMode;
  targets: TransformSnapshot[];
};

export type TransformCommitEventPayload = {
  mode: TransformMode;
  before: TransformSnapshot[];
  after: TransformSnapshot[];
};

export type TransformCancelEventPayload = {
  mode: TransformMode;
  targetIds: string[];
};

export type TransformSessionBeginResult = {
  pivotHandle: THREE.Object3D;
  targetIds: string[];
  selectionBox: THREE.Box3;
  pivotWorldPosition: [number, number, number];
};

export type TransformInteractionResult = {
  mode: TransformMode;
  targetIds: string[];
  before: TransformSnapshot[];
  after: TransformSnapshot[];
};

export type TransformSessionBeginOptions = {
  mode?: TransformMode;
};

export class TransformSession {
  scene: THREE.Scene;
  targets: SessionObject[];
  pivotHandle: THREE.Object3D | null;
  selectionBox: THREE.Box3;
  pivotCenterWorld: THREE.Vector3;
  interaction: TransformInteraction | null;
  lastMode: TransformMode;

  private _tmpBox: THREE.Box3;
  private _tmpVec3: THREE.Vector3;
  private _tmpVec32: THREE.Vector3;
  private _tmpQuat: THREE.Quaternion;
  private _tmpQuat2: THREE.Quaternion;
  private _tmpScale: THREE.Vector3;
  private _tmpScale2: THREE.Vector3;
  private _tmpMatrix: THREE.Matrix4;
  private _tmpMatrix2: THREE.Matrix4;
  private _tmpMatrix3: THREE.Matrix4;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.targets = [];
    this.pivotHandle = null;
    this.selectionBox = new THREE.Box3();
    this.pivotCenterWorld = new THREE.Vector3();
    this.interaction = null;
    this.lastMode = 'translate';

    this._tmpBox = new THREE.Box3();
    this._tmpVec3 = new THREE.Vector3();
    this._tmpVec32 = new THREE.Vector3();
    this._tmpQuat = new THREE.Quaternion();
    this._tmpQuat2 = new THREE.Quaternion();
    this._tmpScale = new THREE.Vector3();
    this._tmpScale2 = new THREE.Vector3();
    this._tmpMatrix = new THREE.Matrix4();
    this._tmpMatrix2 = new THREE.Matrix4();
    this._tmpMatrix3 = new THREE.Matrix4();
  }

  hasSession() {
    return !!this.pivotHandle && this.targets.length > 0;
  }

  hasInteraction() {
    return !!this.interaction;
  }

  getTargetIds() {
    return this.targets.map((target) => this._getTargetId(target));
  }

  getSelectionBox(target = new THREE.Box3()) {
    return target.copy(this.selectionBox);
  }

  begin(targets: THREE.Object3D[], options: TransformSessionBeginOptions = {}) {
    const validTargets = (targets || []).filter((target) => !!target && !!target.parent) as SessionObject[];
    if (validTargets.length === 0) {
      return null;
    }

    this.end();

    this.targets = validTargets;
    this.lastMode = options.mode || 'translate';

    const pivotHandle = new THREE.Object3D();
    pivotHandle.name = '__pivot_handle__';
    pivotHandle.userData = {
      ...(pivotHandle.userData || {}),
      isHelper: true,
      isTransformPivotHandle: true,
    };

    this._refreshSelectionBoxFromTargets();

    const firstTarget = this.targets[0];
    firstTarget.updateMatrixWorld(true);
    firstTarget.matrixWorld.decompose(this._tmpVec3, this._tmpQuat, this._tmpScale);

    const pivotCenter = this.selectionBox.isEmpty()
      ? this._tmpVec3.clone()
      : this.selectionBox.getCenter(this._tmpVec32);

    this.pivotCenterWorld.copy(pivotCenter);
    pivotHandle.position.copy(pivotCenter);
    pivotHandle.quaternion.copy(this._tmpQuat);
    pivotHandle.scale.set(1, 1, 1);
    pivotHandle.updateMatrixWorld(true);

    this.scene.add(pivotHandle);
    this.pivotHandle = pivotHandle;

    return {
      pivotHandle,
      targetIds: this.getTargetIds(),
      selectionBox: this.selectionBox.clone(),
      pivotWorldPosition: [pivotCenter.x, pivotCenter.y, pivotCenter.z],
    } as TransformSessionBeginResult;
  }

  beginInteraction(mode: TransformMode) {
    if (!this.hasSession() || !this.pivotHandle) {
      return null;
    }

    this.lastMode = mode;

    this.pivotHandle.updateMatrixWorld(true);
    const startPivotWorldMatrix = this._tmpMatrix.copy(this.pivotHandle.matrixWorld).clone();
    const startPivotWorldMatrixInverse = this._tmpMatrix2.copy(startPivotWorldMatrix).invert().clone();
    const pivotWorldPosition = this._tmpVec3.setFromMatrixPosition(startPivotWorldMatrix).clone();

    const targetStates = this.targets.map((target) => {
      target.updateMatrixWorld(true);
      const startWorldMatrix = target.matrixWorld.clone();
      startWorldMatrix.decompose(this._tmpVec32, this._tmpQuat2, this._tmpScale2);

      const startWorldPosition = this._tmpVec32.clone();
      const startWorldQuaternion = this._tmpQuat2.clone();
      const startWorldScale = this._tmpScale2.clone();
      const offsetToPivot = startWorldPosition.clone().sub(pivotWorldPosition);
      const isCenteredToPivot = offsetToPivot.lengthSq() <= 1e-10;

      return {
        id: this._getTargetId(target),
        object: target,
        startWorldMatrix,
        startWorldPosition,
        startWorldQuaternion,
        startWorldScale,
        offsetToPivot,
        isCenteredToPivot,
      } as InteractionTargetState;
    });

    const beforeSnapshots = targetStates.map((state) => this._snapshotObject(state.object, state.id));

    this.interaction = {
      mode,
      startPivotWorldMatrix,
      startPivotWorldMatrixInverse,
      targetStates,
      beforeSnapshots,
    };

    return {
      mode,
      targetIds: targetStates.map((state) => state.id),
      pivotWorldPosition: [pivotWorldPosition.x, pivotWorldPosition.y, pivotWorldPosition.z],
    } as TransformStartEventPayload;
  }

  updateFromPivot() {
    const interaction = this.interaction;
    const pivotHandle = this.pivotHandle;
    if (!interaction || !pivotHandle) {
      return null;
    }

    pivotHandle.updateMatrixWorld(true);

    const deltaWorld = this._tmpMatrix
      .copy(pivotHandle.matrixWorld)
      .multiply(interaction.startPivotWorldMatrixInverse);

    interaction.targetStates.forEach((targetState) => {
      const object = targetState.object;
      const newTargetWorld = this._tmpMatrix2.multiplyMatrices(deltaWorld, targetState.startWorldMatrix);
      this._applyWorldMatrixToObject(object, newTargetWorld);
      this._markAndRefreshBox(object);
    });

    this._refreshSelectionBoxFromTargets();

    return {
      mode: interaction.mode,
      targets: interaction.targetStates.map((targetState) =>
        this._snapshotObject(targetState.object, targetState.id)
      ),
    } as TransformPreviewEventPayload;
  }

  finishInteraction(commit = true) {
    const interaction = this.interaction;
    if (!interaction) {
      return null;
    }

    if (!commit) {
      interaction.targetStates.forEach((targetState) => {
        this._applyWorldMatrixToObject(targetState.object, targetState.startWorldMatrix);
        this._markAndRefreshBox(targetState.object);
      });
      if (this.pivotHandle) {
        this._applyWorldMatrixToObject(this.pivotHandle, interaction.startPivotWorldMatrix);
      }
    } else {
      interaction.targetStates.forEach((targetState) => {
        this._markAndRefreshBox(targetState.object);
      });
    }

    this._refreshSelectionBoxFromTargets();

    const result = {
      mode: interaction.mode,
      targetIds: interaction.targetStates.map((state) => state.id),
      before: interaction.beforeSnapshots.map((snapshot) => ({ ...snapshot })),
      after: interaction.targetStates.map((targetState) =>
        this._snapshotObject(targetState.object, targetState.id)
      ),
    } as TransformInteractionResult;

    this.interaction = null;
    return result;
  }

  end() {
    this.interaction = null;

    if (this.pivotHandle?.parent) {
      this.pivotHandle.parent.remove(this.pivotHandle);
    }

    this.targets = [];
    this.pivotHandle = null;
    this.selectionBox.makeEmpty();
    this.pivotCenterWorld.set(0, 0, 0);
  }

  dispose() {
    this.end();
  }

  private _snapshotObject(object: SessionObject, id = this._getTargetId(object)) {
    return {
      id,
      position: [object.position.x, object.position.y, object.position.z],
      rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
      scale: [object.scale.x, object.scale.y, object.scale.z],
    } as TransformSnapshot;
  }

  private _getTargetId(object: SessionObject) {
    if (typeof object.entityId === 'string' && object.entityId.length > 0) {
      return object.entityId;
    }
    const entityKey = object.userData?.entityKey;
    if (typeof entityKey === 'string' && entityKey.length > 0) {
      return entityKey;
    }
    return object.uuid;
  }

  private _refreshSelectionBoxFromTargets() {
    const selectionBox = this.selectionBox;
    selectionBox.makeEmpty();

    this.targets.forEach((target) => {
      const targetBox = this._getObjectWorldBox(target, this._tmpBox);
      if (!targetBox.isEmpty()) {
        selectionBox.union(targetBox);
        return;
      }
      target.updateMatrixWorld(true);
      this._tmpVec3.setFromMatrixPosition(target.matrixWorld);
      selectionBox.expandByPoint(this._tmpVec3);
    });

    if (!selectionBox.isEmpty()) {
      selectionBox.getCenter(this.pivotCenterWorld);
    }
  }

  private _getObjectWorldBox(object: SessionObject, target: THREE.Box3) {
    if (typeof object.getWorldBox === 'function') {
      const objectBox = object.getWorldBox(false);
      if (objectBox?.isBox3) {
        return target.copy(objectBox);
      }
    }

    target.setFromObject(object);
    return target;
  }

  private _markAndRefreshBox(object: SessionObject) {
    object.markBoxDirty?.();
    if (typeof object.refreshWorldBox === 'function') {
      object.refreshWorldBox(true);
    }
  }

  private _applyWorldMatrixToObject(object: SessionObject, worldMatrix: THREE.Matrix4) {
    const localMatrix = this._tmpMatrix3.copy(worldMatrix);

    if (object.parent) {
      object.parent.updateMatrixWorld(true);
      const parentInverse = this._tmpMatrix2.copy(object.parent.matrixWorld).invert();
      localMatrix.premultiply(parentInverse);
    }

    localMatrix.decompose(this._tmpVec3, this._tmpQuat, this._tmpScale);
    object.position.copy(this._tmpVec3);
    object.quaternion.copy(this._tmpQuat);
    object.scale.copy(this._tmpScale);
    object.updateMatrixWorld(true);
  }
}

export default TransformSession;

