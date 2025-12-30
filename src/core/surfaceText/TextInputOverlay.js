/**
 * 文字输入覆盖层
 * 在指定位置显示文字输入框
 */
export class TextInputOverlay {
  constructor(domElement) {
    this.domElement = domElement
    this.overlay = null
    this.inputElement = null
    this.isVisible = false
    
    // 事件监听器
    this.eventListeners = new Map()
    
    // 配置
    this.config = {
      className: 'text-input-overlay',
      inputClassName: 'text-input-field',
      maxLength: 100,
      placeholder: '输入文字内容...',
      fontSize: '16px',
      padding: '8px 12px',
      borderRadius: '4px',
      border: '2px solid #007bff',
      backgroundColor: '#ffffff',
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      zIndex: 10000
    }
    
    // 创建样式
    this.createStyles()
  }
  
  /**
   * 创建CSS样式
   */
  createStyles() {
    const styleId = 'text-input-overlay-styles'
    
    // 检查是否已经存在样式
    if (document.getElementById(styleId)) {
      return
    }
    
    const style = document.createElement('style')
    style.id = styleId
    style.textContent = `
      .${this.config.className} {
        position: fixed;
        z-index: ${this.config.zIndex};
        pointer-events: none;
      }
      
      .${this.config.inputClassName} {
        font-size: ${this.config.fontSize};
        padding: ${this.config.padding};
        border: ${this.config.border};
        border-radius: ${this.config.borderRadius};
        background-color: ${this.config.backgroundColor};
        box-shadow: ${this.config.boxShadow};
        outline: none;
        pointer-events: auto;
        min-width: 200px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      
      .${this.config.inputClassName}:focus {
        border-color: #0056b3;
        box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.25);
      }
      
      .${this.config.inputClassName}::placeholder {
        color: #6c757d;
        opacity: 1;
      }
    `
    
    document.head.appendChild(style)
  }
  
  /**
   * 显示输入覆盖层
   * @param {number} x - 屏幕X坐标
   * @param {number} y - 屏幕Y坐标
   * @param {string} initialValue - 初始值
   * @returns {Promise<string|null>} 用户输入的文字或null（取消）
   */
  show(x, y, initialValue = '') {
    return new Promise((resolve) => {
      if (this.isVisible) {
        this.hide()
      }
      
      // 创建覆盖层元素
      this.createOverlay(x, y, initialValue)
      
      // 设置事件处理器
      const handleConfirm = () => {
        const value = this.inputElement.value.trim()
        this.hide()
        resolve(value || null)
      }
      
      const handleCancel = () => {
        this.hide()
        this.emit('cancel')
        resolve(null)
      }
      
      const handleKeyDown = (event) => {
        event.stopPropagation() // 防止事件冒泡到其他系统
        
        switch (event.key) {
          case 'Enter':
            event.preventDefault()
            handleConfirm()
            break
          case 'Escape':
            event.preventDefault()
            handleCancel()
            break
        }
      }
      
      const handleBlur = () => {
        // 延迟处理，允许用户点击其他地方取消
        setTimeout(() => {
          if (this.isVisible) {
            handleCancel()
          }
        }, 100)
      }
      
      // 绑定事件
      this.inputElement.addEventListener('keydown', handleKeyDown)
      this.inputElement.addEventListener('blur', handleBlur)
      
      // 聚焦输入框
      this.inputElement.focus()
      this.inputElement.select()
      
      this.isVisible = true
      this.emit('shown', { x, y, initialValue })
    })
  }
  
  /**
   * 创建覆盖层DOM元素
   * @param {number} x - 屏幕X坐标
   * @param {number} y - 屏幕Y坐标
   * @param {string} initialValue - 初始值
   */
  createOverlay(x, y, initialValue) {
    // 创建覆盖层容器
    this.overlay = document.createElement('div')
    this.overlay.className = this.config.className
    
    // 创建输入框
    this.inputElement = document.createElement('input')
    this.inputElement.type = 'text'
    this.inputElement.className = this.config.inputClassName
    this.inputElement.placeholder = this.config.placeholder
    this.inputElement.maxLength = this.config.maxLength
    this.inputElement.value = initialValue
    
    // 添加到覆盖层
    this.overlay.appendChild(this.inputElement)
    
    // 计算位置（确保不超出屏幕边界）
    const position = this.calculatePosition(x, y)
    this.overlay.style.left = position.x + 'px'
    this.overlay.style.top = position.y + 'px'
    
    // 添加到DOM
    document.body.appendChild(this.overlay)
  }
  
  /**
   * 计算输入框位置，确保不超出屏幕边界
   * @param {number} x - 目标X坐标
   * @param {number} y - 目标Y坐标
   * @returns {Object} 调整后的位置 {x, y}
   */
  calculatePosition(x, y) {
    const margin = 10 // 边距
    const inputWidth = 220 // 预估输入框宽度
    const inputHeight = 40 // 预估输入框高度
    
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    
    let adjustedX = x
    let adjustedY = y
    
    // 水平位置调整
    if (adjustedX + inputWidth + margin > viewportWidth) {
      adjustedX = viewportWidth - inputWidth - margin
    }
    if (adjustedX < margin) {
      adjustedX = margin
    }
    
    // 垂直位置调整
    if (adjustedY + inputHeight + margin > viewportHeight) {
      adjustedY = y - inputHeight - margin // 显示在点击位置上方
    }
    if (adjustedY < margin) {
      adjustedY = margin
    }
    
    return { x: adjustedX, y: adjustedY }
  }
  
  /**
   * 隐藏输入覆盖层
   */
  hide() {
    if (!this.isVisible) return
    
    // 移除DOM元素
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay)
    }
    
    // 清理引用
    this.overlay = null
    this.inputElement = null
    this.isVisible = false
    
    this.emit('hidden')
  }
  
  /**
   * 检查是否可见
   * @returns {boolean} 是否可见
   */
  isShown() {
    return this.isVisible
  }
  
  /**
   * 获取当前输入值
   * @returns {string} 当前输入值
   */
  getCurrentValue() {
    return this.inputElement ? this.inputElement.value : ''
  }
  
  /**
   * 设置输入值
   * @param {string} value - 新值
   */
  setValue(value) {
    if (this.inputElement) {
      this.inputElement.value = value || ''
    }
  }
  
  /**
   * 设置占位符文本
   * @param {string} placeholder - 占位符文本
   */
  setPlaceholder(placeholder) {
    this.config.placeholder = placeholder
    if (this.inputElement) {
      this.inputElement.placeholder = placeholder
    }
  }
  
  /**
   * 设置最大长度
   * @param {number} maxLength - 最大长度
   */
  setMaxLength(maxLength) {
    this.config.maxLength = maxLength
    if (this.inputElement) {
      this.inputElement.maxLength = maxLength
    }
  }
  
  /**
   * 更新样式配置
   * @param {Object} styleConfig - 样式配置
   */
  updateStyles(styleConfig) {
    Object.assign(this.config, styleConfig)
    
    // 如果当前有输入框，应用新样式
    if (this.inputElement) {
      const input = this.inputElement
      if (styleConfig.fontSize) input.style.fontSize = styleConfig.fontSize
      if (styleConfig.padding) input.style.padding = styleConfig.padding
      if (styleConfig.borderRadius) input.style.borderRadius = styleConfig.borderRadius
      if (styleConfig.border) input.style.border = styleConfig.border
      if (styleConfig.backgroundColor) input.style.backgroundColor = styleConfig.backgroundColor
      if (styleConfig.boxShadow) input.style.boxShadow = styleConfig.boxShadow
    }
  }
  
  /**
   * 验证输入内容
   * @param {string} value - 输入值
   * @returns {Object} 验证结果
   */
  validateInput(value) {
    const errors = []
    const warnings = []
    
    if (!value || typeof value !== 'string') {
      errors.push('输入内容不能为空')
    } else {
      const trimmed = value.trim()
      if (trimmed.length === 0) {
        errors.push('输入内容不能为空白')
      } else if (trimmed.length > this.config.maxLength) {
        errors.push(`输入内容不能超过${this.config.maxLength}个字符`)
      }
      
      // 检查特殊字符
      const hasSpecialChars = /[<>\"'&]/.test(trimmed)
      if (hasSpecialChars) {
        warnings.push('输入内容包含特殊字符，可能影响显示效果')
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      value: value ? value.trim() : ''
    }
  }
  
  /**
   * 添加事件监听器
   * @param {string} eventName - 事件名称
   * @param {Function} callback - 回调函数
   */
  on(eventName, callback) {
    if (!this.eventListeners.has(eventName)) {
      this.eventListeners.set(eventName, [])
    }
    this.eventListeners.get(eventName).push(callback)
  }
  
  /**
   * 移除事件监听器
   * @param {string} eventName - 事件名称
   * @param {Function} callback - 回调函数
   */
  off(eventName, callback) {
    if (!this.eventListeners.has(eventName)) return
    
    const listeners = this.eventListeners.get(eventName)
    const index = listeners.indexOf(callback)
    if (index !== -1) {
      listeners.splice(index, 1)
    }
  }
  
  /**
   * 发出事件
   * @param {string} eventName - 事件名称
   * @param {...any} args - 事件参数
   */
  emit(eventName, ...args) {
    if (!this.eventListeners.has(eventName)) return
    
    const listeners = this.eventListeners.get(eventName)
    listeners.forEach(callback => {
      try {
        callback(...args)
      } catch (error) {
        console.error(`Error in event listener for ${eventName}:`, error)
      }
    })
  }
  
  /**
   * 销毁覆盖层，清理资源
   */
  destroy() {
    this.hide()
    this.eventListeners.clear()
    
    // 移除样式
    const styleElement = document.getElementById('text-input-overlay-styles')
    if (styleElement) {
      styleElement.remove()
    }
    
    console.log('文字输入覆盖层已销毁')
  }
}