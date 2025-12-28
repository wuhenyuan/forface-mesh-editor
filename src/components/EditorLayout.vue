<template>
  <div class="editor-root">
    <toolbar-panel />
    <div class="editor-body">
      <feature-panel v-model="feature" />
      <feature-menu v-if="feature === 'base'" :feature="feature" />
      <div class="workspace" :class="{ 'no-menu': feature !== 'base' }">
        <workspace-viewport 
          :current-tool="feature"
          @textSelected="onTextSelected"
          @textDeselected="onTextDeselected"
          @textCreated="onTextCreated"
          @textDeleted="onTextDeleted"
          ref="workspaceRef"
        />
      </div>
      <property-panel 
        :selectedTextObject="selectedTextObject"
        :textList="textList"
        @updateTextContent="onUpdateTextContent"
        @updateTextColor="onUpdateTextColor"
        @updateTextMode="onUpdateTextMode"
        @updateTextFont="onUpdateTextFont"
        @updateTextSize="onUpdateTextSize"
        @updateTextThickness="onUpdateTextThickness"
        @deleteSelectedText="onDeleteSelectedText"
        @deleteText="onDeleteText"
        @selectText="onSelectText"
        @duplicateText="onDuplicateText"
      />
    </div>
  </div>
</template>

<script>
import { ref, computed } from 'vue'
import ToolbarPanel from './ToolbarPanel.vue'
import FeaturePanel from './FeaturePanel.vue'
import FeatureMenu from './FeatureMenu.vue'
import PropertyPanel from './PropertyPanel.vue'
import WorkspaceViewport from './WorkspaceViewport.vue'
export default {
  name: 'EditorLayout',
  components: {
    ToolbarPanel,
    FeaturePanel,
    FeatureMenu,
    PropertyPanel,
    WorkspaceViewport
  },
  setup() {
    const feature = ref('base')
    const selectedTextObject = ref(null)
    const workspaceRef = ref(null)
    
    // 文字列表管理（带显示名称）
    const textListRaw = ref([]) // { id, content, displayName }
    let textCounter = 0
    
    // 计算属性：带显示名称的文字列表
    const textList = computed(() => textListRaw.value)
    
    // 生成文字显示名称
    const generateTextDisplayName = () => {
      textCounter++
      return `文字${textCounter}`
    }
    
    // 文字创建事件
    const onTextCreated = (textObject) => {
      const displayName = generateTextDisplayName()
      textListRaw.value.push({
        id: textObject.id,
        content: textObject.content,
        displayName: displayName
      })
      console.log('编辑器：文字已创建', displayName, textObject.content)
    }
    
    // 文字删除事件
    const onTextDeleted = ({ id }) => {
      const index = textListRaw.value.findIndex(t => t.id === id)
      if (index !== -1) {
        textListRaw.value.splice(index, 1)
      }
      console.log('编辑器：文字已删除', id)
    }
    
    // 文字选择事件处理
    const onTextSelected = (textObject) => {
      selectedTextObject.value = textObject
      // 同步更新文字列表中的内容
      const textItem = textListRaw.value.find(t => t.id === textObject.id)
      if (textItem) {
        textItem.content = textObject.content
      }
      console.log('编辑器：文字已选中', textObject.content)
    }
    
    const onTextDeselected = () => {
      selectedTextObject.value = null
      console.log('编辑器：文字已取消选择')
    }
    
    // 从工艺信息面板选择文字
    const onSelectText = (textId) => {
      if (workspaceRef.value) {
        workspaceRef.value.selectText(textId)
      }
    }
    
    // 从工艺信息面板删除文字
    const onDeleteText = (textId) => {
      if (workspaceRef.value) {
        workspaceRef.value.deleteText(textId)
      }
    }
    
    // 文字属性更新事件处理
    const onUpdateTextContent = async (textId, newContent) => {
      if (workspaceRef.value) {
        await workspaceRef.value.updateTextContent(textId, newContent)
        // 同步更新文字列表中的内容
        const textItem = textListRaw.value.find(t => t.id === textId)
        if (textItem) {
          textItem.content = newContent
        }
      }
    }
    
    const onUpdateTextColor = (textId, newColor) => {
      if (workspaceRef.value) {
        workspaceRef.value.updateTextColor(textId, newColor)
      }
    }
    
    const onUpdateTextMode = async (textId, newMode) => {
      if (workspaceRef.value) {
        await workspaceRef.value.switchTextMode(textId, newMode)
      }
    }
    
    const onUpdateTextFont = async (textId, newFont) => {
      if (workspaceRef.value && selectedTextObject.value) {
        // 更新字体需要重新生成几何体
        selectedTextObject.value.config.font = newFont
        await workspaceRef.value.updateTextContent(textId, selectedTextObject.value.content)
      }
    }
    
    const onUpdateTextSize = async (textId, newSize) => {
      if (workspaceRef.value && selectedTextObject.value) {
        // 更新大小需要重新生成几何体
        selectedTextObject.value.config.size = newSize
        await workspaceRef.value.updateTextContent(textId, selectedTextObject.value.content)
      }
    }
    
    const onUpdateTextThickness = async (textId, newThickness) => {
      if (workspaceRef.value && selectedTextObject.value) {
        // 更新厚度需要重新生成几何体
        selectedTextObject.value.config.thickness = newThickness
        await workspaceRef.value.updateTextContent(textId, selectedTextObject.value.content)
      }
    }
    
    const onDeleteSelectedText = () => {
      if (workspaceRef.value) {
        workspaceRef.value.deleteSelectedText()
      }
    }
    
    const onDuplicateText = () => {
      // TODO: 实现文字复制功能
      console.log('复制文字功能待实现')
    }
    
    return { 
      feature,
      selectedTextObject,
      workspaceRef,
      textList,
      onTextSelected,
      onTextDeselected,
      onTextCreated,
      onTextDeleted,
      onSelectText,
      onDeleteText,
      onUpdateTextContent,
      onUpdateTextColor,
      onUpdateTextMode,
      onUpdateTextFont,
      onUpdateTextSize,
      onUpdateTextThickness,
      onDeleteSelectedText,
      onDuplicateText
    }
  }
}
</script>

<style scoped>
.editor-root {
  display: grid;
  grid-template-rows: var(--header-height) 1fr;
  height: 100vh;
}
.editor-body {
  display: grid;
  grid-template-columns: var(--aside1-width) var(--aside2-width) 1fr var(--right-width);
  height: calc(100vh - var(--header-height));
}
/* 当功能菜单隐藏时，workspace 占据更多空间 */
.editor-body:has(.workspace.no-menu) {
  grid-template-columns: var(--aside1-width) 1fr var(--right-width);
}
.workspace {
  background: #f7f8fa;
}
.workspace.no-menu {
  grid-column: 2 / 3;
}
:root,
.editor-root {
  --header-height: 56px;
  --aside1-width: 120px;
  --aside2-width: 300px;
  --right-width: 320px;
}
</style>
