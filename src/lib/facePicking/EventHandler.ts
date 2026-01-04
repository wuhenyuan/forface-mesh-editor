import type { FacePicker } from './FacePicker'

interface MouseState {
  isDown: boolean
  lastPosition: { x: number; y: number }
  dragThreshold: number
  isDragging: boolean
}

interface KeyState {
  ctrl: boolean
  shift: boolean
  alt: boolean
}

interface MousePosition {
  client: { x: number; y: number }
  offset: { x: number; y: number }
  normalized: { x: number; y: number }
  rect: DOMRect
}

/**
 * 事件处理器
 * 负责管理面拾取相关的所有用户交互事件
 */
export class EventHandler {
  private facePicker: FacePicker
  private domElement: HTMLElement
  private isEnabled: boolean
  private mouseState: MouseState
  private keyState: KeyState
  private throttleDelay: number
  private lastMouseMoveTime: number

  constructor(facePicker: FacePicker, domElement: HTMLElement) {
    this.facePicker = facePicker
    this.domElement = domElement
    
    // 事件状态
    this.isEnabled = false
    this.mouseState = {
      isDown: false,
      lastPosition: { x: 0, y: 0 },
      dragThreshold: 5,
      isDragging: false
    }
    
    // 键盘状态
    this.keyState = {
      ctrl: false,
      shift: false,
      alt: false
    }
    
    // 事件节流
    this.throttleDelay = 16 // ~60fps
    this.lastMouseMoveTime = 0

    // 绑定事件处理方法
    this.handleMouseDown = this.handleMouseDown.bind(this)
    this.handleMouseUp = this.handleMouseUp.bind(this)
    this.handleMouseMove = this.handleMouseMove.bind(this)
    this.handleClick = this.handleClick.bind(this)
    this.handleDoubleClick = this.handleDoubleClick.bind(this)
    this.handleContextMenu = this.handleContextMenu.bind(this)
    this.handleKeyDown = this.handleKeyDown.bind(this)
    this.handleKeyUp = this.handleKeyUp.bind(this)
    this.handleWheel = this.handleWheel.bind(this)
    this.handleResize = this.handleResize.bind(this)
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this)
  }
  
  /**
   * 启用事件处理
   */
  enable(): void {
    if (this.isEnabled) return
    
    this.isEnabled = true
    
    // 鼠标事件
    this.domElement.addEventListener('mousedown', this.handleMouseDown)
    this.domElement.addEventListener('mouseup', this.handleMouseUp)
    this.domElement.addEventListener('mousemove', this.handleMouseMove)
    this.domElement.addEventListener('click', this.handleClick)
    this.domElement.addEventListener('dblclick', this.handleDoubleClick)
    this.domElement.addEventListener('contextmenu', this.handleContextMenu)
    this.domElement.addEventListener('wheel', this.handleWheel, { passive: false })
    
    // 键盘事件（全局）
    document.addEventListener('keydown', this.handleKeyDown)
    document.addEventListener('keyup', this.handleKeyUp)
    
    // 窗口事件
    window.addEventListener('resize', this.handleResize)
    document.addEventListener('visibilitychange', this.handleVisibilityChange)
    
    // 设置DOM元素属性
    this.domElement.style.cursor = 'crosshair'
    ;(this.domElement as HTMLElement).tabIndex = 0
  }
  
  /**
   * 禁用事件处理
   */
  disable(): void {
    if (!this.isEnabled) return
    
    this.isEnabled = false
    
    // 移除所有事件监听器
    this.domElement.removeEventListener('mousedown', this.handleMouseDown)
    this.domElement.removeEventListener('mouseup', this.handleMouseUp)
    this.domElement.removeEventListener('mousemove', this.handleMouseMove)
    this.domElement.removeEventListener('click', this.handleClick)
    this.domElement.removeEventListener('dblclick', this.handleDoubleClick)
    this.domElement.removeEventListener('contextmenu', this.handleContextMenu)
    this.domElement.removeEventListener('wheel', this.handleWheel)
    
    document.removeEventListener('keydown', this.handleKeyDown)
    document.removeEventListener('keyup', this.handleKeyUp)
    
    window.removeEventListener('resize', this.handleResize)
    document.removeEventListener('visibilitychange', this.handleVisibilityChange)
    
    // 重置DOM元素属性
    this.domElement.style.cursor = 'default'
    
    // 重置状态
    this.resetState()
  }

  /**
   * 处理鼠标按下事件
   */
  handleMouseDown(event: MouseEvent): void {
    if (!this.isEnabled) return
    
    this.mouseState.isDown = true
    this.mouseState.lastPosition = { x: event.clientX, y: event.clientY }
    this.mouseState.isDragging = false
    
    // 确保元素获得焦点以接收键盘事件
    this.domElement.focus()
    
    // 发出鼠标按下事件
    this.facePicker.emit('mouseDown', {
      event,
      position: this.getMousePosition(event),
      button: event.button,
      modifiers: this.getModifierState()
    })
  }
  
  /**
   * 处理鼠标抬起事件
   */
  handleMouseUp(event: MouseEvent): void {
    if (!this.isEnabled) return
    
    this.mouseState.isDown = false
    
    // 发出鼠标抬起事件
    this.facePicker.emit('mouseUp', {
      event,
      position: this.getMousePosition(event),
      button: event.button,
      modifiers: this.getModifierState(),
      wasDragging: this.mouseState.isDragging
    })
    
    this.mouseState.isDragging = false
  }
  
  /**
   * 处理鼠标移动事件
   */
  handleMouseMove(event: MouseEvent): void {
    if (!this.isEnabled) return
    
    // 事件节流
    const now = Date.now()
    if (now - this.lastMouseMoveTime < this.throttleDelay) {
      return
    }
    this.lastMouseMoveTime = now
    
    const currentPosition = { x: event.clientX, y: event.clientY }
    
    // 检查是否开始拖拽
    if (this.mouseState.isDown && !this.mouseState.isDragging) {
      const deltaX = Math.abs(currentPosition.x - this.mouseState.lastPosition.x)
      const deltaY = Math.abs(currentPosition.y - this.mouseState.lastPosition.y)
      
      if (deltaX > this.mouseState.dragThreshold || deltaY > this.mouseState.dragThreshold) {
        this.mouseState.isDragging = true
        
        // 发出拖拽开始事件
        this.facePicker.emit('dragStart', {
          event,
          startPosition: this.mouseState.lastPosition,
          currentPosition: currentPosition
        })
      }
    }
    
    // 如果正在拖拽，发出拖拽事件
    if (this.mouseState.isDragging) {
      this.facePicker.emit('drag', {
        event,
        startPosition: this.mouseState.lastPosition,
        currentPosition: currentPosition,
        delta: {
          x: currentPosition.x - this.mouseState.lastPosition.x,
          y: currentPosition.y - this.mouseState.lastPosition.y
        }
      })
    } else {
      // 正常的鼠标移动（悬停检测）
      this.facePicker.handleMouseMove(event)
      
      // 发出鼠标移动事件
      this.facePicker.emit('mouseMove', {
        event,
        position: this.getMousePosition(event),
        modifiers: this.getModifierState()
      })
    }
  }

  /**
   * 处理点击事件
   */
  handleClick(event: MouseEvent): void {
    console.log('EventHandler.handleClick 被调用', {
      enabled: this.isEnabled,
      isDragging: this.mouseState.isDragging,
      button: event.button
    })
    
    if (!this.isEnabled) return
    
    // 如果刚刚完成拖拽，忽略点击事件
    if (this.mouseState.isDragging) {
      console.log('忽略点击事件，因为正在拖拽')
      return
    }
    
    // 委托给FacePicker处理面选择逻辑
    console.log('委托给FacePicker处理点击')
    this.facePicker.handleClick(event)
    
    // 发出点击事件
    this.facePicker.emit('click', {
      event,
      position: this.getMousePosition(event),
      button: event.button,
      modifiers: this.getModifierState()
    })
  }
  
  /**
   * 处理双击事件
   */
  handleDoubleClick(event: MouseEvent): void {
    if (!this.isEnabled) return
    
    // 发出双击事件
    this.facePicker.emit('doubleClick', {
      event,
      position: this.getMousePosition(event),
      button: event.button,
      modifiers: this.getModifierState()
    })
    
    event.preventDefault()
  }
  
  /**
   * 处理右键菜单事件
   */
  handleContextMenu(event: MouseEvent): void {
    if (!this.isEnabled) return
    
    // 发出右键菜单事件
    this.facePicker.emit('contextMenu', {
      event,
      position: this.getMousePosition(event),
      modifiers: this.getModifierState()
    })
    
    event.preventDefault()
  }
  
  /**
   * 处理键盘按下事件
   */
  handleKeyDown(event: KeyboardEvent): void {
    if (!this.isEnabled) return
    
    // 更新修饰键状态
    this.updateModifierState(event)
    
    // 委托给FacePicker处理
    this.facePicker.handleKeyDown(event)
    
    // 发出键盘按下事件
    this.facePicker.emit('keyDown', {
      event,
      key: event.key,
      code: event.code,
      modifiers: this.getModifierState()
    })
    
    // 处理特殊快捷键
    this.handleShortcuts(event)
  }
  
  /**
   * 处理键盘抬起事件
   */
  handleKeyUp(event: KeyboardEvent): void {
    if (!this.isEnabled) return
    
    // 更新修饰键状态
    this.updateModifierState(event)
    
    // 发出键盘抬起事件
    this.facePicker.emit('keyUp', {
      event,
      key: event.key,
      code: event.code,
      modifiers: this.getModifierState()
    })
  }

  /**
   * 处理鼠标滚轮事件
   */
  handleWheel(event: WheelEvent): void {
    if (!this.isEnabled) return
    
    // 发出滚轮事件
    this.facePicker.emit('wheel', {
      event,
      delta: {
        x: event.deltaX,
        y: event.deltaY,
        z: event.deltaZ
      },
      position: this.getMousePosition(event),
      modifiers: this.getModifierState()
    })
    
    // 如果有修饰键，可能需要阻止默认行为
    if (this.keyState.ctrl || this.keyState.shift) {
      event.preventDefault()
    }
  }
  
  /**
   * 处理窗口大小变化事件
   */
  handleResize(_event: Event): void {
    if (!this.isEnabled) return
    
    // 发出窗口大小变化事件
    this.facePicker.emit('resize', {
      size: {
        width: window.innerWidth,
        height: window.innerHeight
      }
    })
  }
  
  /**
   * 处理页面可见性变化事件
   */
  handleVisibilityChange(_event: Event): void {
    if (!this.isEnabled) return
    
    // 当页面变为不可见时，重置状态
    if (document.hidden) {
      this.resetState()
    }
    
    // 发出可见性变化事件
    this.facePicker.emit('visibilityChange', {
      hidden: document.hidden
    })
  }
  
  /**
   * 处理快捷键
   */
  private handleShortcuts(event: KeyboardEvent): void {
    const { key, ctrlKey, metaKey, shiftKey } = event
    const isCtrl = ctrlKey || metaKey
    
    // 处理快捷键
    switch (key.toLowerCase()) {
      case 'escape':
        this.facePicker.clearSelection()
        break
      case 'a':
        if (isCtrl) {
          this.handleSelectAll(event)
        }
        break
      case 'z':
        if (isCtrl && !shiftKey) {
          this.facePicker.undo()
        } else if (isCtrl && shiftKey) {
          this.facePicker.redo()
        }
        break
      case 'y':
        if (isCtrl) {
          this.facePicker.redo()
        }
        break
      case 'f':
        this.handleFocusSelection()
        break
      case 'h':
        this.handleToggleHighlight()
        break
      case 'i':
        if (isCtrl && shiftKey) {
          this.handleShowInfo(event)
        }
        break
    }
  }
  
  /**
   * 处理全选操作
   */
  private handleSelectAll(event: KeyboardEvent): void {
    console.log('全选功能待实现')
    event.preventDefault()
  }
  
  /**
   * 处理聚焦到选择
   */
  private handleFocusSelection(): void {
    const selectedFaces = this.facePicker.getSelectedFaces()
    if (selectedFaces.length > 0) {
      console.log('聚焦到选中面:', selectedFaces.length)
    }
  }
  
  /**
   * 处理切换高亮显示
   */
  private handleToggleHighlight(): void {
    console.log('切换高亮显示')
  }
  
  /**
   * 处理显示信息
   */
  private handleShowInfo(event: KeyboardEvent): void {
    const stats = this.facePicker.getSelectionStats()
    const highlightStats = this.facePicker.getHighlightStats()
    
    console.log('面拾取信息:')
    console.log('  选择统计:', stats)
    console.log('  高亮统计:', highlightStats)
    
    event.preventDefault()
  }

  /**
   * 获取鼠标位置
   */
  private getMousePosition(event: MouseEvent): MousePosition {
    const rect = this.domElement.getBoundingClientRect()
    
    return {
      client: { x: event.clientX, y: event.clientY },
      offset: { 
        x: event.clientX - rect.left, 
        y: event.clientY - rect.top 
      },
      normalized: {
        x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
        y: -((event.clientY - rect.top) / rect.height) * 2 + 1
      },
      rect: rect
    }
  }
  
  /**
   * 更新修饰键状态
   */
  private updateModifierState(event: KeyboardEvent): void {
    this.keyState.ctrl = event.ctrlKey || event.metaKey
    this.keyState.shift = event.shiftKey
    this.keyState.alt = event.altKey
  }
  
  /**
   * 获取修饰键状态
   */
  getModifierState(): KeyState {
    return { ...this.keyState }
  }
  
  /**
   * 重置所有状态
   */
  resetState(): void {
    this.mouseState.isDown = false
    this.mouseState.isDragging = false
    this.keyState.ctrl = false
    this.keyState.shift = false
    this.keyState.alt = false
  }
  
  /**
   * 设置事件节流延迟
   */
  setThrottleDelay(delay: number): void {
    this.throttleDelay = Math.max(0, delay)
  }
  
  /**
   * 设置拖拽阈值
   */
  setDragThreshold(threshold: number): void {
    this.mouseState.dragThreshold = Math.max(0, threshold)
  }
  
  /**
   * 获取事件处理器状态
   */
  getState(): {
    isEnabled: boolean
    mouseState: MouseState
    keyState: KeyState
    throttleDelay: number
  } {
    return {
      isEnabled: this.isEnabled,
      mouseState: { ...this.mouseState },
      keyState: { ...this.keyState },
      throttleDelay: this.throttleDelay
    }
  }
}
