import * as THREE from 'three';

export type TransformMode = 'translate' | 'rotate' | 'scale';
export type TransformStrategy = 'direct' | 'pivot';

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
};

type TransformInteraction = {
  mode: TransformMode;
  strategy: TransformStrategy;
  controlObject: THREE.Object3D;
  startControlWorldMatrix: THREE.Matrix4;
  startControlWorldMatrixInverse: THREE.Matrix4;
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
  strategy: TransformStrategy;
  target: THREE.Object3D | null;
  targetIds: string[];
  controlWorldPosition: [number, number, number];
  pivotWorldPosition: [number, number, number];
};

export type TransformPreviewEventPayload = {
  mode: TransformMode;
  strategy: TransformStrategy;
  target: THREE.Object3D | null;
  targetObjects: THREE.Object3D[];
  targets: TransformSnapshot[];
};

export type TransformCommitEventPayload = {
  mode: TransformMode;
  strategy: TransformStrategy;
  target: THREE.Object3D | null;
  targetIds: string[];
  targetObjects: THREE.Object3D[];
  before: TransformSnapshot[];
  after: TransformSnapshot[];
};

export type TransformCancelEventPayload = {
  mode: TransformMode;
  strategy: TransformStrategy;
  target: THREE.Object3D | null;
  targetIds: string[];
  targetObjects: THREE.Object3D[];
};

export type TransformSessionBeginResult = {
  strategy: TransformStrategy;
  attachTarget: THREE.Object3D;
  pivotHandle: THREE.Object3D | null;
  target: THREE.Object3D | null;
  targetIds: string[];
  selectionBox: THREE.Box3;
  controlWorldPosition: [number, number, number];
  pivotWorldPosition: [number, number, number];
};

export type TransformInteractionResult = {
  mode: TransformMode;
  strategy: TransformStrategy;
  target: THREE.Object3D | null;
  targetIds: string[];
  targetObjects: THREE.Object3D[];
  before: TransformSnapshot[];
  after: TransformSnapshot[];
};

export type TransformSessionBeginOptions = {
  mode?: TransformMode;
  strategy?: 'auto' | TransformStrategy;
};

export class TransformSession {
  scene: THREE.Scene;
  targets: SessionObject[];
  pivotHandle: THREE.Object3D | null;
  attachTarget: THREE.Object3D | null;
  selectionBox: THREE.Box3;
  pivotCenterWorld: THREE.Vector3;
  interaction: TransformInteraction | null;
  lastMode: TransformMode;
  strategy: TransformStrategy;

  private _tmpBox: THREE.Box3;
  private _tmpVec3: THREE.Vector3;
  private _tmpVec32: THREE.Vector3;
  private _tmpQuat: THREE.Quaternion;
  private _tmpScale: THREE.Vector3;
  private _tmpMatrix: THREE.Matrix4;
  private _tmpMatrix2: THREE.Matrix4;
  private _tmpMatrix3: THREE.Matrix4;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.targets = [];
    this.pivotHandle = null;
    this.attachTarget = null;
    this.selectionBox = new THREE.Box3();
    this.pivotCenterWorld = new THREE.Vector3();
    this.interaction = null;
    this.lastMode = 'translate';
    this.strategy = 'direct';

    this._tmpBox = new THREE.Box3();
    this._tmpVec3 = new THREE.Vector3();
    this._tmpVec32 = new THREE.Vector3();
    this._tmpQuat = new THREE.Quaternion();
    this._tmpScale = new THREE.Vector3();
    this._tmpMatrix = new THREE.Matrix4();
    this._tmpMatrix2 = new THREE.Matrix4();
    this._tmpMatrix3 = new THREE.Matrix4();
  }

  hasSession() {
    return !!this.attachTarget && this.targets.length > 0;
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
    this.strategy = this._resolveStrategy(validTargets, options.strategy);

    this._refreshSelectionBoxFromTargets();

    let pivotHandle: THREE.Object3D | null = null;
    let attachTarget: THREE.Object3D = validTargets[0];
    let controlWorldPosition = new THREE.Vector3();

    if (this.strategy === 'pivot') {
      const firstTarget = validTargets[0];
      firstTarget.updateMatrixWorld(true);
      firstTarget.matrixWorld.decompose(this._tmpVec3, this._tmpQuat, this._tmpScale);

      const pivotCenter = this.selectionBox.isEmpty()
        ? this._tmpVec3.clone()
        : this.selectionBox.getCenter(this._tmpVec32).clone();

      pivotHandle = new THREE.Object3D();
      pivotHandle.name = '__pivot_handle__';
      pivotHandle.userData = {
        ...(pivotHandle.userData || {}),
        isHelper: true,
        isTransformPivotHandle: true,
      };
      pivotHandle.position.copy(pivotCenter);
      pivotHandle.quaternion.copy(this._tmpQuat);
      pivotHandle.scale.set(1, 1, 1);
      pivotHandle.updateMatrixWorld(true);
      this.scene.add(pivotHandle);

      attachTarget = pivotHandle;
      controlWorldPosition.copy(pivotCenter);
      this.pivotHandle = pivotHandle;
    } else {
      attachTarget.updateMatrixWorld(true);
      controlWorldPosition.setFromMatrixPosition(attachTarget.matrixWorld);
      this.pivotHandle = null;
    }

    this.attachTarget = attachTarget;

    return {
      strategy: this.strategy,
      attachTarget,
      pivotHandle,
      target: validTargets[0] || null,
      targetIds: this.getTargetIds(),
      selectionBox: this.selectionBox.clone(),
      controlWorldPosition: [
        controlWorldPosition.x,
        controlWorldPosition.y,
        controlWorldPosition.z,
      ],
      pivotWorldPosition: [
        controlWorldPosition.x,
        controlWorldPosition.y,
        controlWorldPosition.z,
      ],
    } as TransformSessionBeginResult;
  }

  beginInteraction(mode: TransformMode) {
    const controlObject = this.attachTarget;
    if (!this.hasSession() || !controlObject) {
      return null;
    }

    this.lastMode = mode;

    controlObject.updateMatrixWorld(true);
    const startControlWorldMatrix = this._tmpMatrix.copy(controlObject.matrixWorld).clone();
    const startControlWorldMatrixInverse = this._tmpMatrix2
      .copy(startControlWorldMatrix)
      .invert()
      .clone();
    const controlWorldPosition = this._tmpVec3.setFromMatrixPosition(startControlWorldMatrix).clone();

    const targetStates = this.targets.map((target) => {
      target.updateMatrixWorld(true);
      return {
        id: this._getTargetId(target),
        object: target,
        startWorldMatrix: target.matrixWorld.clone(),
      } as InteractionTargetState;
    });

    const beforeSnapshots = targetStates.map((state) => this._snapshotObject(state.object, state.id));

    this.interaction = {
      mode,
      strategy: this.strategy,
      controlObject,
      startControlWorldMatrix,
      startControlWorldMatrixInverse,
      targetStates,
      beforeSnapshots,
    };

    return {
      mode,
      strategy: this.strategy,
      target: this.targets[0] || null,
      targetIds: targetStates.map((state) => state.id),
      controlWorldPosition: [
        controlWorldPosition.x,
        controlWorldPosition.y,
        controlWorldPosition.z,
      ],
      pivotWorldPosition: [
        controlWorldPosition.x,
        controlWorldPosition.y,
        controlWorldPosition.z,
      ],
    } as TransformStartEventPayload;
  }

  updateFromPivot() {
    const interaction = this.interaction;
    if (!interaction) {
      return null;
    }

    if (interaction.strategy === 'pivot') {
      interaction.controlObject.updateMatrixWorld(true);
      const deltaWorld = this._tmpMatrix
        .copy(interaction.controlObject.matrixWorld)
        .multiply(interaction.startControlWorldMatrixInverse);

      interaction.targetStates.forEach((targetState) => {
        const newTargetWorld = this._tmpMatrix2.multiplyMatrices(deltaWorld, targetState.startWorldMatrix);
        this._applyWorldMatrixToObject(targetState.object, newTargetWorld);
        this._markAndRefreshBox(targetState.object);
      });
    } else {
      interaction.targetStates.forEach((targetState) => {
        targetState.object.updateMatrixWorld(true);
        this._markAndRefreshBox(targetState.object);
      });
    }

    this._refreshSelectionBoxFromTargets();

    return {
      mode: interaction.mode,
      strategy: interaction.strategy,
      target: this.targets[0] || null,
      targetObjects: [...this.targets],
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

      if (interaction.strategy === 'pivot') {
        this._applyWorldMatrixToObject(interaction.controlObject, interaction.startControlWorldMatrix);
      }
    } else {
      interaction.targetStates.forEach((targetState) => {
        this._markAndRefreshBox(targetState.object);
      });
    }

    this._refreshSelectionBoxFromTargets();

    const result = {
      mode: interaction.mode,
      strategy: interaction.strategy,
      target: this.targets[0] || null,
      targetIds: interaction.targetStates.map((state) => state.id),
      targetObjects: [...this.targets],
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
    this.attachTarget = null;
    this.selectionBox.makeEmpty();
    this.pivotCenterWorld.set(0, 0, 0);
    this.strategy = 'direct';
  }

  dispose() {
    this.end();
  }

  private _resolveStrategy(
    targets: SessionObject[],
    requestedStrategy: TransformSessionBeginOptions['strategy'] = 'auto'
  ) {
    if (requestedStrategy === 'pivot') {
      return 'pivot';
    }

    if (requestedStrategy === 'direct') {
      return targets.length === 1 ? 'direct' : 'pivot';
    }

    return targets.length === 1 ? 'direct' : 'pivot';
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

  private _applyWorldMatrixToObject(object: SessionObject | THREE.Object3D, worldMatrix: THREE.Matrix4) {
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
