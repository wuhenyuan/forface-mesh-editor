# Entity Group Transform Flow

## Goal

The single-object editing path uses the outer `EntityObject` as the only runtime transform truth.

- UI transform semantics target `EntityObject`
- `TransformControls` single-object path attaches to `EntityObject`
- `contentGroup` only handles static content placement
- `node` is the loaded model root, not the editor transform truth

---

## 1. Runtime Structure

```ts
import * as THREE from 'three';

class EntityObject extends THREE.Group {
  entityId: string;
  entity: EntityLike | null;
  contentGroup: THREE.Group;
  node: THREE.Object3D | null;
  worldBox: THREE.Box3;

  constructor(entityId: string, entity: EntityLike | null = null) {
    super();

    this.entityId = entityId;
    this.entity = entity;
    this.node = null;
    this.worldBox = new THREE.Box3();

    this.contentGroup = new THREE.Group();
    this.add(this.contentGroup);
  }
}

type RuntimeTree = `
EntityObject
  -> contentGroup
       -> node
`;
```

---

## 2. Transform Truth

```ts
type SingleObjectTransformTruth = EntityObject;

type NotTransformTruth =
  | THREE.Object3D // node
  | THREE.Group // contentGroup
  | THREE.Object3D; // temporary pivot handle
```

For single-object editing:

```ts
const uiTarget = entityObject;
const gizmoTarget = entityObject;
const serializedTransformSource = entityObject;
```

---

## 3. Model Load Flow

This is the current runtime boundary.

```ts
async function loadModelEntity(
  key: string,
  entry: DocumentModelSource,
  entity: EntityLike | null
) {
  const entityObject = new ModelEntityObject(key, entity);

  // loadFromEntitySource() currently does:
  // 1. loadNode()
  // 2. centerContentAtOrigin()
  const result = await entityObject.loadFromEntitySource(
    (source, options) => assetsManager.load(source, options),
    entry.source,
    {
      modelId: key,
      ...(entry.loaderOptions || {}),
    }
  );

  // business TRS still applies on outer EntityObject
  entityObject.applyEntityPatch(entity || {}, {
    baseTransform: entry.transform,
    entity,
  });

  addMesh(entityObject, {
    selectable: true,
    castShadow: true,
    receiveShadow: true,
    group: 'entity',
  });

  events.emit('modelLoaded', {
    model: entityObject,
    node: entityObject.node,
    modelId: key,
    format: result.format,
    metadata: result.metadata,
  });
}
```

---

## 4. Static Content Centering

This is not edit-time pivot logic.
This is one-time content placement logic.

```ts
class EntityObject extends THREE.Group {
  resetContentOffset() {
    this.contentGroup.position.set(0, 0, 0);
    this.contentGroup.quaternion.identity();
    this.contentGroup.scale.set(1, 1, 1);
    this.contentGroup.updateMatrixWorld(true);
    this.markBoxDirty();
  }

  centerContentAtOrigin() {
    const boxSource = this.getWorldBoxSource();
    if (!boxSource) return null;

    this.resetContentOffset();
    this.updateMatrixWorld(true);

    const contentBox = this._computeContentWorldBox(new THREE.Box3());
    if (contentBox.isEmpty()) return null;

    const worldCenter = contentBox.getCenter(new THREE.Vector3());
    const localCenter = this.worldToLocal(worldCenter.clone());

    // Move content back so EntityObject origin becomes content center
    this.contentGroup.position.sub(localCenter);
    this.contentGroup.updateMatrixWorld(true);

    this.markBoxDirty();
    this.refreshWorldBox(true);

    return localCenter;
  }
}
```

Effect:

```ts
beforeCentering:
  entityObject.origin !== visibleContentCenter

afterCentering:
  entityObject.origin === visibleContentCenter
```

---

## 5. Selection Flow

```ts
function onObjectSelected(object: THREE.Object3D) {
  selectedObject = object;

  if (enableTransformControls) {
    beginTransformSession([object]);
  }

  boundsHelper.attach(object);
  emit('objectSelected', object);
}
```

In the current model path:

```ts
const selectedObject = entityObject;
```

---

## 6. Transform Session Strategy

Current session logic supports both direct and pivot strategies.

```ts
type TransformStrategy = 'direct' | 'pivot';

function beginTransformSession(targets: THREE.Object3D[]) {
  const strategy: TransformStrategy =
    targets.length === 1 ? 'direct' : 'pivot';

  let attachTarget: THREE.Object3D;

  if (strategy === 'direct') {
    attachTarget = targets[0];
  } else {
    attachTarget = buildTemporaryPivotFromSelectionCenter(targets);
  }

  transformControls.attach(attachTarget);

  return {
    strategy,
    attachTarget,
  };
}
```

Important:

```ts
// The current selection manager is still single-selection oriented.
// So pivot is a retained capability in TransformSession,
// not a fully exposed multi-select UX path yet.
```

---

## 7. Single Object Direct Path

This is the active model editing path.

```ts
function beginSingleObjectTransform(entityObject: EntityObject) {
  const result = transformSession.begin([entityObject], {
    mode: getTransformMode(),
  });

  transformControls.attach(result.attachTarget);
}
```

```ts
// In single-object direct mode:
result.strategy === 'direct'
result.attachTarget === entityObject
```

During drag:

```ts
function updateTransformSession() {
  const preview = transformSession.updateFromPivot();
  if (!preview) return;

  boundsHelper.update(selectedObject);

  emit('transform:preview', preview);
  emit('bbox:updated', buildBboxPayload());
}
```

Result:

```ts
EntityObject.position
EntityObject.rotation
EntityObject.scale
```

are the values changed by the gizmo.

---

## 8. Why the Gizmo Appears at the Center

`TransformControls` is not configured with a custom visual center.
It always renders at the attached object's origin.

So the actual mechanism is:

```ts
// 1. attach gizmo to EntityObject
transformControls.attach(entityObject);

// 2. move content around EntityObject origin
entityObject.centerContentAtOrigin();

// 3. visual effect
// gizmo appears at visible content center
```

Equivalent mental model:

```ts
// not this:
moveTransformControlsToCenter();

// but this:
moveContentAroundEntityObjectOrigin();
```

---

## 9. UI Read Flow

Current UI read path is:

```ts
function syncSelectedTransformToStore() {
  const selectedObject = store.selectedRuntimeObject();
  if (!selectedObject) {
    store.clearSelectedObjectTransform();
    return;
  }

  store.syncSelectedObjectTransformFromObject(selectedObject);
}
```

Store snapshot shape:

```ts
function buildTransformFromObject(object: THREE.Object3D) {
  return {
    position: [object.position.x, object.position.y, object.position.z],
    rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
    scale: [object.scale.x, object.scale.y, object.scale.z],
  };
}
```

For a selected model:

```ts
selectedRuntimeObject === entityObject
selectedObjectTransform === snapshot(entityObject)
```

---

## 10. UI Write Flow

Current UI does not mutate `EntityObject` directly.
It writes through `updateEntity()`, then the runtime object is synchronized from entity update events.

```ts
function updateSelectedEntityTransform() {
  const entityId = selectedEntityId.value;
  if (!entityId) return;

  store.updateEntity(entityId, {
    position: [x, y, z],
    rotation: [rx, ry, rz],
    scale: [sx, sy, sz],
  });
}
```

Then runtime sync happens through the entity update path:

```ts
function onEntityUpdated(payload: EntityUpdatedPayload) {
  modelObject.applyEntityPatch(payload.patch, {
    baseTransform: entry.transform,
    entity: payload.entity,
  });
}
```

So the accurate statement is:

```ts
// UI semantic target
EntityObject

// UI write path
PropertyPanel -> updateEntity(entityId, patch) -> runtime sync -> EntityObject
```

---

## 11. Preview / Commit Flow

Current preview flow:

```ts
emitter.on('transform:preview', (payload) => {
  const current = getPrimarySnapshot(payload.targets);
  if (!current) return;

  store.setSelectedObjectTransform({
    position: current.position,
    rotation: current.rotation,
    scale: current.scale,
  });
});
```

Current commit flow:

```ts
emitter.on('transform:commit', (payload) => {
  const afterSnapshot = getPrimarySnapshot(payload.after);
  if (!afterSnapshot) return;

  const entityKey =
    afterSnapshot.id || selectedObject?.userData?.entityKey;

  store.updateEntity(entityKey, {
    position: afterSnapshot.position,
    rotation: afterSnapshot.rotation,
    scale: afterSnapshot.scale,
  });
});
```

Cancel flow:

```ts
emitter.on('transform:cancel', () => {
  syncSelectedTransformToStore();
});
```

---

## 12. World Box Flow

Business bbox should come from content, not helpers and not temporary pivot.

```ts
class EntityObject extends THREE.Group {
  getWorldBoxSource() {
    return this.contentGroup || this.node || null;
  }

  refreshWorldBox(force = false) {
    if (!force && !this.worldBoxDirty) {
      return this.worldBox;
    }

    this.updateMatrixWorld(true);
    this.worldBox.makeEmpty();
    this._computeContentWorldBox(this.worldBox);
    this.worldBoxDirty = false;

    return this.worldBox;
  }
}
```

Rule:

```ts
doNotUseForBusinessBBox = [
  pivotHandle,
  transformControlsHelper,
  boundsHelper,
];
```

---

## 13. Current Truth Table

```ts
const singleObjectEditing = {
  uiSemanticTarget: 'EntityObject',
  uiReadSource: 'selected runtime object snapshot',
  uiWritePath: 'updateEntity -> runtime sync -> EntityObject',
  gizmoAttachTarget: 'EntityObject',
  contentPlacementObject: 'contentGroup',
  loadedModelRoot: 'node',
  transformTruth: 'EntityObject',
};
```

---

## 14. Summary

```ts
// Single-object model editing
PropertyPanel <-> Entity data <-> EntityObject
TransformControls -> attach(EntityObject)
contentGroup -> static centering only
node -> loaded model content only
```

```ts
// Why the gizmo is visually centered
// Not because TransformControls moved,
// but because contentGroup was statically recentered around EntityObject.origin
```
