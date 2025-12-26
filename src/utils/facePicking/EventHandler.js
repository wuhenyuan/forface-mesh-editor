/**
 * 事件处理器
 * 负责管理面拾取相关的所有用户交互事件
 */
export class EventHandler {
  constructor(facePicker, domElement) {
    this.facePicker = facePicker
    this.domElement = domElement
    
    // 事件状态
    this.isEnabled = false
    this.mouseState = {
      isDown: false,
      lastPosition: { x: 0, y: 0 },
      dragThreshold: 5, // 像素
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
  enable() {
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
    this.domElement.tabIndex = 0 // 使元素可以接收键盘焦点
  }
  
  /**
   * 禁用事件处理
   */
  disable() {
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
   * @param {MouseEvent} event - 鼠标事件
   */
  handleMouseDown(event) {
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
   * @param {MouseEvent} event - 鼠标事件
   */
  handleMouseUp(event) {
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
   * @param {MouseEvent} event - 鼠标事件
   */
  handleMouseMove(event) {
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
   * @param {MouseEvent} event - 鼠标事件
   */
  handleClick(event) {
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
   * @param {MouseEvent} event - 鼠标事件
   */
  handleDoubleClick(event) {
    if (!this.isEnabled) return
    
    // 发出双击事件
    this.facePicker.emit('doubleClick', {
      event,
      position: this.getMousePosition(event),
      button: event.button,
      modifiers: this.getModifierState()
    })
    
    // 可以在这里添加双击特殊逻辑，比如全选相邻面
    event.preventDefault()
  }
  
  /**
   * 处理右键菜单事件
   * @param {MouseEvent} event - 鼠标事件
   */
  handleContextMenu(event) {
    if (!this.isEnabled) return
    
    // 发出右键菜单事件
    this.facePicker.emit('contextMenu', {
      event,
      position: this.getMousePosition(event),
      modifiers: this.getModifierState()
    })
    
    // 默认阻止浏览器右键菜单
    event.preventDefault()
  }
  
  /**
   * 处理键盘按下事件
   * @param {KeyboardEvent} event - 键盘事件
   */
  handleKeyDown(event) {
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
   * @param {KeyboardEvent} event - 键盘事件
   */
  handleKeyUp(event) {
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
   * @param {WheelEvent} event - 滚轮事件
   */
  handleWheel(event) {
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
   * @param {Event} event - 窗口事件
   */
  handleResize(event) {
    if (!this.isEnabled) return
    
    // 发出窗口大小变化事件
    this.facePicker.emit('resize', {
      event,
      size: {
        width: window.innerWidth,
        height: window.innerHeight
      }
    })
  }
  
  /**
   * 处理页面可见性变化事件
   * @param {Event} event - 可见性事件
   */
  handleVisibilityChange(event) {
    if (!this.isEnabled) return
    
    // 当页面变为不可见时，重置状态
    if (document.hidden) {
      this.resetState()
    }
    
    // 发出可见性变化事件
    this.facePicker.emit('visibilityChange', {
      event,
      hidden: document.hidden
    })
  }
  
  /**
   * 处理快捷键
   * @param {KeyboardEvent} event - 键盘事件
   */
  handleShortcuts(event) {
    const { key, ctrlKey, metaKey, shiftKey, altKey } = event
    const isCtrl = ctrlKey || metaKey
    
    // 定义快捷键映射
    const shortcuts = {
      // 选择操作
      'Escape': () => this.facePicker.clearSelection(),
      'a': () => isCtrl && this.handleSelectAll(event),
      
      // 历史操作
      'z': () => isCtrl && !shiftKey && this.facePicker.undo(),
      'z': () => isCtrl && shiftKey && this.facePicker.redo(),
      'y': () => isCtrl && this.facePicker.redo(),
      
      // 视图操作
      'f': () => this.handleFocusSelection(event),
      'h': () => this.handleToggleHighlight(event),
      
      // 调试操作
      'i': () => isCtrl && shiftKey && this.handleShowInfo(event)
    }
    
    // 执行对应的快捷键操作
    const handler = shortcuts[key.toLowerCase()]
    if (handler) {
      handler()
    }
  }
  
  /**
   * 处理全选操作
   * @param {KeyboardEvent} event - 键盘事件
   */
  handleSelectAll(event) {
    // 这里可以实现全选逻辑
    console.log('全选功能待实现')
    event.preventDefault()
  }
  
  /**
   * 处理聚焦到选择
   * @param {KeyboardEvent} event - 键盘事件
   */
  handleFocusSelection(event) {
    // 这里可以实现聚焦到选中面的逻辑
    const selectedFaces = this.facePicker.getSelectedFaces()
    if (selectedFaces.length > 0) {
      console.log('聚焦到选中面:', selectedFaces.length)
    }
  }
  
  /**
   * 处理切换高亮显示
   * @param {KeyboardEvent} event - 键盘事件
   */
  handleToggleHighlight(event) {
    // 这里可以实现切换高亮显示的逻辑
    console.log('切换高亮显示')
  }
  
  /**
   * 处理显示信息
   * @param {KeyboardEvent} event - 键盘事件
   */
  handleShowInfo(event) {
    const stats = this.facePicker.getSelectionStats()
    const highlightStats = this.facePicker.getHighlightStats()
    
    console.log('面拾取信息:')
    console.log('  选择统计:', stats)
    console.log('  高亮统计:', highlightStats)
    
    event.preventDefault()
  }
  
  /**
   * 获取鼠标位置
   * @param {MouseEvent} event - 鼠标事件
   * @returns {Object} 鼠标位置信息
   */
  getMousePosition(event) {
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
   * @param {KeyboardEvent} event - 键盘事件
   */
  updateModifierState(event) {
    this.keyState.ctrl = event.ctrlKey || event.metaKey
    this.keyState.shift = event.shiftKey
    this.keyState.alt = event.altKey
  }
  
  /**
   * 获取修饰键状态
   * @returns {Object} 修饰键状态
   */
  getModifierState() {
    return { ...this.keyState }
  }
  
  /**
   * 重置所有状态
   */
  resetState() {
    this.mouseState.isDown = false
    this.mouseState.isDragging = false
    this.keyState.ctrl = false
    this.keyState.shift = false
    this.keyState.alt = false
  }
  
  /**
   * 设置事件节流延迟
   * @param {number} delay - 延迟时间（毫秒）
   */
  setThrottleDelay(delay) {
    this.throttleDelay = Math.max(0, delay)
  }
  
  /**
   * 设置拖拽阈值
   * @param {number} threshold - 阈值（像素）
   */
  setDragThreshold(threshold) {
    this.mouseState.dragThreshold = Math.max(0, threshold)
  }
  
  /**
   * 获取事件处理器状态
   * @returns {Object} 状态信息
   */
  getState() {
    return {
      isEnabled: this.isEnabled,
      mouseState: { ...this.mouseState },
      keyState: { ...this.keyState },
      throttleDelay: this.throttleDelay
    }
  }
}