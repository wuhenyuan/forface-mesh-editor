import * as THREE from 'three'
import type { FaceInfo } from '../../types/events'

export interface FaceInfoWithId extends FaceInfo {
  id: string
  area?: number
}

export interface SelectionSummary {
  count: number
  mode: 'single' | 'multi'
  hasSelection: boolean
  hasHover: boolean
  faceIds: string[]
}

export interface SelectionState {
  selectedFaces: Map<string, FaceInfoWithId>
  selectionMode: 'single' | 'multi'
  timestamp: number
}

export interface SelectionStats {
  totalFaces: number
  meshCount: number
  meshGroups: Array<{ mesh: THREE.Mesh; faceCount: number; totalArea: number }>
  selectionMode: 'single' | 'multi'
  hasHistory: boolean
  canUndo: boolean
  canRedo: boolean
}

type EventCallback = (...args: unknown[]) => void

/**
 * 选择状态管理器
 */
export class SelectionManager {
  selectedFaces: Map<string, FaceInfoWithId>
  selectionMode: 'single' | 'multi'
  hoverFace: FaceInfoWithId | null
  selectionHistory: SelectionState[]
  historyIndex: number
  maxHistorySize: number
  eventCallbacks: Map<string, EventCallback[]>

  constructor() {
    this.selectedFaces = new Map()
    this.selectionMode = 'single'
    this.hoverFace = null
    this.selectionHistory = []
    this.historyIndex = -1
    this.maxHistorySize = 50
    this.eventCallbacks = new Map()
  }
  
  addFace(faceInfo: FaceInfoWithId, recordHistory: boolean = true): boolean {
    if (!faceInfo || !faceInfo.id) {
      console.warn('无效的面信息')
      return false
    }
    
    if (recordHistory) {
      this.recordCurrentState()
    }
    
    if (this.selectionMode === 'single') {
      this.selectedFaces.clear()
    }
    
    this.selectedFaces.set(faceInfo.id, faceInfo)
    this.emitEvent('faceAdded', faceInfo)
    this.emitEvent('selectionChanged', this.getSelectionSummary())
    
    return true
  }
  
  removeFace(faceInfo: FaceInfoWithId, recordHistory: boolean = true): boolean {
    if (!faceInfo || !faceInfo.id) {
      console.warn('无效的面信息')
      return false
    }
    
    if (!this.selectedFaces.has(faceInfo.id)) {
      return false
    }
    
    if (recordHistory) {
      this.recordCurrentState()
    }
    
    const removed = this.selectedFaces.delete(faceInfo.id)
    
    if (removed) {
      this.emitEvent('faceRemoved', faceInfo)
      this.emitEvent('selectionChanged', this.getSelectionSummary())
    }
    
    return removed
  }
  
  clearAll(recordHistory: boolean = true): void {
    if (this.selectedFaces.size === 0) {
      return
    }
    
    if (recordHistory) {
      this.recordCurrentState()
    }
    
    const clearedFaces = Array.from(this.selectedFaces.values())
    this.selectedFaces.clear()
    
    this.emitEvent('selectionCleared', clearedFaces)
    this.emitEvent('selectionChanged', this.getSelectionSummary())
  }
  
  contains(faceInfo: FaceInfoWithId): boolean {
    if (!faceInfo || !faceInfo.id) {
      return false
    }
    return this.selectedFaces.has(faceInfo.id)
  }
  
  getAll(): FaceInfoWithId[] {
    return Array.from(this.selectedFaces.values())
  }
  
  getCount(): number {
    return this.selectedFaces.size
  }
  
  hasSelection(): boolean {
    return this.selectedFaces.size > 0
  }
  
  getFaceById(faceId: string): FaceInfoWithId | null {
    return this.selectedFaces.get(faceId) || null
  }
  
  setSelectionMode(mode: 'single' | 'multi', recordHistory: boolean = true): void {
    if (mode !== 'single' && mode !== 'multi') {
      console.warn('无效的选择模式')
      return
    }
    
    if (this.selectionMode === mode) {
      return
    }
    
    if (recordHistory) {
      this.recordCurrentState()
    }
    
    const oldMode = this.selectionMode
    this.selectionMode = mode
    
    if (mode === 'single' && this.selectedFaces.size > 1) {
      const firstFace = this.selectedFaces.values().next().value
      this.selectedFaces.clear()
      if (firstFace) {
        this.selectedFaces.set(firstFace.id, firstFace)
      }
    }
    
    this.emitEvent('selectionModeChanged', { oldMode, newMode: mode })
    this.emitEvent('selectionChanged', this.getSelectionSummary())
  }
  
  getSelectionMode(): 'single' | 'multi' {
    return this.selectionMode
  }
  
  setHoverFace(faceInfo: FaceInfoWithId | null): void {
    this.hoverFace = faceInfo
  }
  
  getHoverFace(): FaceInfoWithId | null {
    return this.hoverFace
  }
  
  clearHover(): void {
    this.hoverFace = null
  }
  
  toggleFace(faceInfo: FaceInfoWithId, recordHistory: boolean = true): boolean {
    if (!faceInfo || !faceInfo.id) {
      return false
    }
    
    if (this.contains(faceInfo)) {
      this.removeFace(faceInfo, recordHistory)
      return false
    } else {
      this.addFace(faceInfo, recordHistory)
      return true
    }
  }
  
  getSelectionSummary(): SelectionSummary {
    return {
      count: this.getCount(),
      mode: this.selectionMode,
      hasSelection: this.hasSelection(),
      hasHover: this.hoverFace !== null,
      faceIds: Array.from(this.selectedFaces.keys())
    }
  }
  
  recordCurrentState(): void {
    const currentState: SelectionState = {
      selectedFaces: new Map(this.selectedFaces),
      selectionMode: this.selectionMode,
      timestamp: Date.now()
    }
    
    this.selectionHistory = this.selectionHistory.slice(0, this.historyIndex + 1)
    this.selectionHistory.push(currentState)
    this.historyIndex++
    
    if (this.selectionHistory.length > this.maxHistorySize) {
      this.selectionHistory.shift()
      this.historyIndex--
    }
  }
  
  undo(): boolean {
    if (this.historyIndex <= 0) {
      return false
    }
    
    this.historyIndex--
    const previousState = this.selectionHistory[this.historyIndex]
    
    if (previousState) {
      this.selectedFaces = new Map(previousState.selectedFaces)
      this.selectionMode = previousState.selectionMode
      
      this.emitEvent('undoPerformed', previousState)
      this.emitEvent('selectionChanged', this.getSelectionSummary())
      return true
    }
    
    return false
  }
  
  redo(): boolean {
    if (this.historyIndex >= this.selectionHistory.length - 1) {
      return false
    }
    
    this.historyIndex++
    const nextState = this.selectionHistory[this.historyIndex]
    
    if (nextState) {
      this.selectedFaces = new Map(nextState.selectedFaces)
      this.selectionMode = nextState.selectionMode
      
      this.emitEvent('redoPerformed', nextState)
      this.emitEvent('selectionChanged', this.getSelectionSummary())
      return true
    }
    
    return false
  }
  
  canUndo(): boolean {
    return this.historyIndex > 0
  }
  
  canRedo(): boolean {
    return this.historyIndex < this.selectionHistory.length - 1
  }
  
  clearHistory(): void {
    this.selectionHistory = []
    this.historyIndex = -1
  }
  
  on(eventName: string, callback: EventCallback): void {
    if (!this.eventCallbacks.has(eventName)) {
      this.eventCallbacks.set(eventName, [])
    }
    this.eventCallbacks.get(eventName)!.push(callback)
  }
  
  off(eventName: string, callback: EventCallback): void {
    if (!this.eventCallbacks.has(eventName)) return
    
    const callbacks = this.eventCallbacks.get(eventName)!
    const index = callbacks.indexOf(callback)
    if (index !== -1) {
      callbacks.splice(index, 1)
    }
  }
  
  emitEvent(eventName: string, ...args: unknown[]): void {
    if (!this.eventCallbacks.has(eventName)) return
    
    const callbacks = this.eventCallbacks.get(eventName)!
    callbacks.forEach(callback => {
      try {
        callback(...args)
      } catch (error) {
        console.error(`Error in SelectionManager event listener for ${eventName}:`, error)
      }
    })
  }
  
  getSelectionStats(): SelectionStats {
    const meshGroups = new Map<string, { mesh: THREE.Mesh; faceCount: number; totalArea: number }>()
    
    this.selectedFaces.forEach(faceInfo => {
      const meshId = faceInfo.mesh.uuid
      if (!meshGroups.has(meshId)) {
        meshGroups.set(meshId, {
          mesh: faceInfo.mesh,
          faceCount: 0,
          totalArea: 0
        })
      }
      
      const group = meshGroups.get(meshId)!
      group.faceCount++
      if (faceInfo.area) {
        group.totalArea += faceInfo.area
      }
    })
    
    return {
      totalFaces: this.selectedFaces.size,
      meshCount: meshGroups.size,
      meshGroups: Array.from(meshGroups.values()),
      selectionMode: this.selectionMode,
      hasHistory: this.selectionHistory.length > 0,
      canUndo: this.canUndo(),
      canRedo: this.canRedo()
    }
  }
}
