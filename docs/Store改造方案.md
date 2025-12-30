# Store 改造方案

## 改造目标

将组件间的 props/emit 通信改为通过 store 集中管理，解决：
1. 功能区与菜单区的联动
2. 撤销重做功能
3. 跨组件状态共享

## Store 结构

```
state
├── currentFeature      # 当前功能：base/ornament/text/adjust
├── menuVisible         # 菜单是否显示
├── menuItems           # 菜单数据
├── menuLoading         # 菜单加载状态
├── selectedTextObject  # 选中的文字对象
├── textList            # 文字列表
├── undoStack           # 撤销栈
├── redoStack           # 重做栈
└── workspaceRef        # 工作区组件引用
```

---

## 各组件改造

### 1. EditorLayout.vue

**改造点**：作为容器，初始化 store，移除大部分 props 传递

```vue
<template>
  <div class="editor-root">
    <toolbar-panel />
    <div class="editor-body">
      <feature-panel />
      <feature-menu v-if="shouldShowMenu" />
      <div class="workspace">
        <workspace-viewport ref="workspaceRef" />
      </div>
      <property-panel />
    </div>
  </div>
</template>

<script>
import { computed, ref, onMounted } from 'vue'
import { useEditorStore } from '@/store'

export default {
  name: 'EditorLayout',
  setup() {
    const store = useEditorStore()
    const workspaceRef = ref(null)
    
    // 注册工作区引用
    onMounted(() => {
      store.setWorkspaceRef(workspaceRef)
    })
    
    return {
      shouldShowMenu: computed(() => store.shouldShowMenu()),
      workspaceRef
    }
  }
}
</script>
```

**移除**：
- `feature` 的 v-model
- `menuItems`、`menuLoading` 等 props
- `selectedTextObject`、`textList` 等 props
- 所有 `onXxx` 事件处理函数

---

### 2. FeaturePanel.vue

**改造点**：直接操作 store 切换功能

```vue
<script>
import { computed } from 'vue'
import { useEditorStore } from '@/store'

export default {
  name: 'FeaturePanel',
  setup() {
    const store = useEditorStore()
    
    const active = computed(() => store.state.currentFeature)
    
    const onSelect = (key) => {
      store.setFeature(key)
    }
    
    return { active, onSelect }
  }
}
</script>
```

**移除**：
- `value` prop
- `emit('input')` 和 `emit('change')`

---

### 3. FeatureMenu.vue

**改造点**：从 store 读取数据，搜索结果写回 store

```vue
<script>
import { computed, watch } from 'vue'
import { useEditorStore } from '@/store'

export default {
  name: 'FeatureMenu',
  setup() {
    const store = useEditorStore()
    
    const keyword = computed({
      get: () => store.state.menuKeyword,
      set: (val) => store.setMenuKeyword(val)
    })
    
    const items = computed(() => store.state.menuItems)
    const loading = computed(() => store.state.menuLoading)
    
    const handleSearch = async (value) => {
      store.setMenuLoading(true)
      // 搜索逻辑...
      store.setMenuLoading(false)
    }
    
    const handleSelect = (item) => {
      // 选中逻辑，可以 emit 给上层或直接处理
      console.log('选中:', item)
    }
    
    // 功能切换时清空搜索
    watch(() => store.state.currentFeature, () => {
      store.setMenuKeyword('')
    })
    
    return { keyword, items, loading, handleSearch, handleSelect }
  }
}
</script>
```

**移除**：
- `feature`、`items`、`loading`、`remoteSearch` 等 props
- `emit('search')`、`emit('select')`

---

### 4. PropertyPanel.vue

**改造点**：从 store 读取选中文字和列表

```vue
<script>
import { computed, watch, ref } from 'vue'
import { useEditorStore } from '@/store'

export default {
  name: 'PropertyPanel',
  setup() {
    const store = useEditorStore()
    
    const selectedTextObject = computed(() => store.state.selectedTextObject)
    const textList = computed(() => store.state.textList)
    const isOnCylinder = computed(() => store.isSelectedTextOnCylinder())
    
    const textForm = ref({ content: '', color: '#333333', /* ... */ })
    
    // 同步选中文字到表单
    watch(selectedTextObject, (obj) => {
      if (obj) {
        textForm.value.content = obj.content
        // ...
      }
    }, { immediate: true })
    
    // 更新文字内容
    const updateTextContent = () => {
      const workspace = store.state.workspaceRef?.value
      if (workspace && selectedTextObject.value) {
        workspace.updateTextContent(selectedTextObject.value.id, textForm.value.content)
        store.updateTextInList(selectedTextObject.value.id, textForm.value.content)
      }
    }
    
    // 选择文字
    const selectTextItem = (text) => {
      const workspace = store.state.workspaceRef?.value
      workspace?.selectText(text.id)
    }
    
    // 删除文字
    const deleteTextItem = (textId) => {
      const workspace = store.state.workspaceRef?.value
      workspace?.deleteText(textId)
    }
    
    return {
      selectedTextObject,
      textList,
      isOnCylinder,
      textForm,
      updateTextContent,
      selectTextItem,
      deleteTextItem
    }
  }
}
</script>
```

**移除**：
- `selectedTextObject`、`textList` props
- 所有 `emit('updateXxx')` 事件

---

### 5. ToolbarPanel.vue

**改造点**：撤销重做从 store 获取状态

```vue
<script>
import { computed } from 'vue'
import { useEditorStore } from '@/store'

export default {
  name: 'ToolbarPanel',
  setup() {
    const store = useEditorStore()
    
    const canUndo = computed(() => store.canUndo())
    const canRedo = computed(() => store.canRedo())
    
    const handleUndo = () => {
      const action = store.undo()
      if (!action) return
      
      const workspace = store.state.workspaceRef?.value
      if (!workspace) return
      
      // 根据 action 类型执行撤销
      switch (action.type) {
        case 'TEXT_ADD':
          workspace.deleteText(action.payload.id)
          break
        case 'TEXT_REMOVE':
          // workspace.restoreText(action.payload)
          break
        case 'TEXT_UPDATE':
          workspace.updateTextContent(action.payload.textId, action.payload.from)
          break
      }
    }
    
    const handleRedo = () => {
      const action = store.redo()
      if (!action) return
      
      const workspace = store.state.workspaceRef?.value
      if (!workspace) return
      
      switch (action.type) {
        case 'TEXT_ADD':
          // workspace.restoreText(action.payload)
          break
        case 'TEXT_REMOVE':
          workspace.deleteText(action.payload.id)
          break
        case 'TEXT_UPDATE':
          workspace.updateTextContent(action.payload.textId, action.payload.to)
          break
      }
    }
    
    return { canUndo, canRedo, handleUndo, handleRedo }
  }
}
</script>
```

---

### 6. WorkspaceViewport.vue

**改造点**：事件触发时更新 store

```vue
<script>
import { useEditorStore } from '@/store'

export default {
  name: 'WorkspaceViewport',
  setup(props, { emit }) {
    const store = useEditorStore()
    
    // 文字创建时
    const onTextCreated = (textObject) => {
      store.addText(textObject)
      emit('textCreated', textObject) // 保留 emit 供外部监听
    }
    
    // 文字选中时
    const onTextSelected = (textObject) => {
      store.selectText(textObject)
      emit('textSelected', textObject)
    }
    
    // 文字删除时
    const onTextDeleted = ({ id, textObject }) => {
      store.removeText(id)
      emit('textDeleted', { id, textObject })
    }
    
    // ...
  }
}
</script>
```

---

## 改造顺序

1. **第一步**：改造 `EditorLayout` + `FeaturePanel`（功能切换）
2. **第二步**：改造 `FeatureMenu`（菜单联动）
3. **第三步**：改造 `WorkspaceViewport`（事件写入 store）
4. **第四步**：改造 `PropertyPanel`（读取 store）
5. **第五步**：改造 `ToolbarPanel`（撤销重做）

## 数据流向

```
用户操作
    ↓
组件调用 store.action()
    ↓
store.state 更新
    ↓
所有组件响应式更新
```

## 注意事项

1. `workspaceRef` 存在 store 中，供其他组件调用 3D 操作
2. 保留必要的 `emit`，让外部（上层项目）也能监听事件
3. 撤销重做只记录关键操作，不记录每次属性变化
