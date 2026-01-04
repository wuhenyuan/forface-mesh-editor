import type * as THREE from 'three'
import type { TextObject, TextListItem } from './text'
import type { CommandSnapshot } from './history'

export type FeatureType = 'base' | 'ornament' | 'text' | 'adjust'
export type ViewMode = 'result' | 'construct'

export interface MenuItem {
  key: string
  label: string
  icon?: string
  disabled?: boolean
  children?: MenuItem[]
}

export interface ContextMenuItem {
  key: string
  label: string
  icon?: string
  danger?: boolean
  divider?: boolean
  disabled?: boolean
}

export interface ContextMenuState {
  visible: boolean
  x: number
  y: number
  target: THREE.Object3D | null
  targetType: 'text' | 'object' | 'surface' | 'empty' | null
  items: ContextMenuItem[]
}

export interface ColorPickerState {
  visible: boolean
  x: number
  y: number
  color: string
  target: THREE.Object3D | null
}

export interface EditMenuState {
  visible: boolean
  x: number
  y: number
  target: THREE.Object3D | null
}

export interface TooltipState {
  visible: boolean
  x: number
  y: number
  content: string
}

export interface WorkspaceViewport {
  viewer: unknown
  getViewer(): unknown
}

export interface EditorState {
  currentFeature: FeatureType
  viewMode: ViewMode
  viewModeBusy: boolean
  menuVisible: boolean
  menuItems: MenuItem[]
  menuLoading: boolean
  menuKeyword: string
  selectedTextObject: TextObject | null
  selectedBaseObject: THREE.Object3D | null
  selectedObject: THREE.Object3D | null
  textList: TextListItem[]
  textCounter: number
  history: CommandSnapshot
  workspaceRef: { value: WorkspaceViewport } | null
  contextMenu: ContextMenuState
  colorPicker: ColorPickerState
  editMenu: EditMenuState
  tooltip: TooltipState
}

export interface TransformState {
  mode: 'translate' | 'rotate' | 'scale'
  space: 'world' | 'local'
  snapEnabled: boolean
  snapValue: number
}
