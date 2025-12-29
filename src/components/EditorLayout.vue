<template>
  <div class="editor-root">
    <toolbar-panel />
    <div class="editor-body">
      <feature-panel v-model="feature" />
      <feature-menu 
        v-if="feature === 'base'" 
        :feature="feature"
        :items="menuItems"
        :loading="menuLoading"
        :remote-search="true"
        @search="onMenuSearch"
        @select="onMenuSelect"
      />
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
        @updateTextDirection="onUpdateTextDirection"
        @updateLetterSpacing="onUpdateLetterSpacing"
        @updateCurvingStrength="onUpdateCurvingStrength"
        @updateStartAngle="onUpdateStartAngle"
        @deleteSelectedText="onDeleteSelectedText"
        @deleteText="onDeleteText"
        @selectText="onSelectText"
        @duplicateText="onDuplicateText"
      />
    </div>
  </div>
</template>

<script>
import { ref, computed, provide } from 'vue'
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
    
    // 提供工作区引用给子组件（如工具栏）
    provide('workspaceRef', workspaceRef)
    
    // 提供获取场景数据的方法
    provide('getSceneData', () => {
      if (!workspaceRef.value) return null
      return {
        textObjects: workspaceRef.value.textObjects,
        surfaceTextManager: workspaceRef.value.surfaceTextManager,
        selectedTextId: workspaceRef.value.selectedTextId
      }
    })
    
    // ========== 功能菜单数据管理 ==========
    // 这部分数据和逻辑可以由上层应用传入
    const menuLoading = ref(false)
    const menuItems = ref([
      { id: 'b1', name: '圆形底座', thumbnail: '' },
      { id: 'b2', name: '方形底座', thumbnail: '' },
      { id: 'b3', name: '心形底座', thumbnail: '' },
      { id: 'b4', name: '星形底座', thumbnail: '' }
    ])
    
    // 模拟的全部数据（实际应用中这会是后端 API）
    const allMenuData = [
      { id: 'b1', name: '圆形底座', thumbnail: '' },
      { id: 'b2', name: '方形底座', thumbnail: '' },
      { id: 'b3', name: '心形底座', thumbnail: '' },
      { id: 'b4', name: '星形底座', thumbnail: '' },
      { id: 'b5', name: '六边形底座', thumbnail: '' },
      { id: 'b6', name: '椭圆底座', thumbnail: '' }
    ]
    
    // 搜索处理（上层控制搜索逻辑）
    const onMenuSearch = async (keyword, featureType) => {
      console.log('搜索:', keyword, '功能类型:', featureType)
      
      // 模拟远程搜索
      menuLoading.value = true
      
      // 模拟网络延迟
      await new Promise(resolve => setTimeout(resolve, 300))
      
      if (!keyword) {
        // 空关键词，显示全部
        menuItems.value = allMenuData.slice(0, 4)
      } else {
        // 过滤匹配的数据
        menuItems.value = allMenuData.filter(item => 
          item.name.includes(keyword)
        )
      }
      
      menuLoading.value = false
    }
    
    // 选择菜单项
    const onMenuSelect = (item, featureType) => {
      console.log('选中菜单项:', item, '功能类型:', featureType)
      // TODO: 根据选中的底座类型加载对应的 3D 模型
    }
    
    // ========== 文字列表管理 ==========
    const textListRaw = ref([])
    let textCounter = 0
    
    const textList = computed(() => textListRaw.value)
    
    const generateTextDisplayName = () => {
      textCounter++
      return `文字${textCounter}`
    }
    
    const onTextCreated = (textObject) => {
      const displayName = generateTextDisplayName()
      textListRaw.value.push({
        id: textObject.id,
        content: textObject.content,
        displayName: displayName
      })
      console.log('编辑器：文字已创建', displayName, textObject.content)
    }
    
    const onTextDeleted = ({ id }) => {
      const index = textListRaw.value.findIndex(t => t.id === id)
      if (index !== -1) {
        textListRaw.value.splice(index, 1)
      }
      console.log('编辑器：文字已删除', id)
    }
    
    const onTextSelected = (textObject) => {
      selectedTextObject.value = textObject
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
    
    const onSelectText = (textId) => {
      if (workspaceRef.value) {
        workspaceRef.value.selectText(textId)
      }
    }
    
    const onDeleteText = (textId) => {
      if (workspaceRef.value) {
        workspaceRef.value.deleteText(textId)
      }
    }
    
    const onUpdateTextContent = async (textId, newContent) => {
      if (workspaceRef.value) {
        await workspaceRef.value.updateTextContent(textId, newContent)
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
        selectedTextObject.value.config.font = newFont
        await workspaceRef.value.updateTextContent(textId, selectedTextObject.value.content)
      }
    }
    
    const onUpdateTextSize = async (textId, newSize) => {
      if (workspaceRef.value && selectedTextObject.value) {
        selectedTextObject.value.config.size = newSize
        await workspaceRef.value.updateTextContent(textId, selectedTextObject.value.content)
      }
    }
    
    const onUpdateTextThickness = async (textId, newThickness) => {
      if (workspaceRef.value && selectedTextObject.value) {
        selectedTextObject.value.config.thickness = newThickness
        await workspaceRef.value.updateTextContent(textId, selectedTextObject.value.content)
      }
    }

    // 圆柱面专用属性更新方法
    const onUpdateTextDirection = async (textId, newDirection) => {
      if (workspaceRef.value && selectedTextObject.value) {
        selectedTextObject.value.config.direction = newDirection
        await workspaceRef.value.updateTextDirection(textId, newDirection)
      }
    }

    const onUpdateLetterSpacing = async (textId, newLetterSpacing) => {
      if (workspaceRef.value && selectedTextObject.value) {
        selectedTextObject.value.config.letterSpacing = newLetterSpacing
        await workspaceRef.value.updateLetterSpacing(textId, newLetterSpacing)
      }
    }

    const onUpdateCurvingStrength = async (textId, newCurvingStrength) => {
      if (workspaceRef.value && selectedTextObject.value) {
        selectedTextObject.value.config.curvingStrength = newCurvingStrength
        await workspaceRef.value.updateCurvingStrength(textId, newCurvingStrength)
      }
    }

    const onUpdateStartAngle = async (textId, newStartAngle) => {
      if (workspaceRef.value && selectedTextObject.value) {
        selectedTextObject.value.config.startAngle = newStartAngle
        await workspaceRef.value.updateStartAngle(textId, newStartAngle)
      }
    }
    
    const onDeleteSelectedText = () => {
      if (workspaceRef.value) {
        workspaceRef.value.deleteSelectedText()
      }
    }
    
    const onDuplicateText = () => {
      console.log('复制文字功能待实现')
    }
    
    return { 
      feature,
      selectedTextObject,
      workspaceRef,
      textList,
      // 功能菜单
      menuItems,
      menuLoading,
      onMenuSearch,
      onMenuSelect,
      // 文字事件
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
      onUpdateTextDirection,
      onUpdateLetterSpacing,
      onUpdateCurvingStrength,
      onUpdateStartAngle,
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
