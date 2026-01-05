/**
 * 文字属性面板
 * 提供文字对象的属性编辑界面
 */
export class TextPropertyPanel {
  [key: string]: any;
  constructor() {
    this.currentTextObject = null
    this.eventListeners = new Map()
    
    // 属性配置
    this.properties = {
      content: { type: 'text', label: '文字内容', required: true },
      color: { type: 'color', label: '颜色', default: '#333333' },
      mode: { 
        type: 'select', 
        label: '雕刻模式', 
        options: [
          { value: 'raised', label: '凸起' },
          { value: 'engraved', label: '内嵌' }
        ],
        default: 'raised'
      },
      font: {
        type: 'select',
        label: '字体',
        options: [
          { value: 'helvetiker', label: 'Helvetiker' },
          { value: 'helvetiker_bold', label: 'Helvetiker Bold' },
          { value: 'optimer', label: 'Optimer' },
          { value: 'optimer_bold', label: 'Optimer Bold' },
          { value: 'gentilis', label: 'Gentilis' },
          { value: 'gentilis_bold', label: 'Gentilis Bold' }
        ],
        default: 'helvetiker'
      },
      size: { 
        type: 'number', 
        label: '大小', 
        min: 0.1, 
        max: 10, 
        step: 0.1, 
        default: 1 
      },
      thickness: { 
        type: 'number', 
        label: '厚度', 
        min: 0.01, 
        max: 2, 
        step: 0.01, 
        default: 0.1 
      }
    }
  }
  
  /**
   * 设置当前文字对象
   * @param {Object} textObject - 文字对象
   */
  setTextObject(textObject) {
    this.currentTextObject = textObject
    this.emit('textObjectChanged', textObject)
  }
  
  /**
   * 获取当前文字对象
   * @returns {Object|null} 当前文字对象
   */
  getCurrentTextObject() {
    return this.currentTextObject
  }
  
  /**
   * 清除当前文字对象
   */
  clearTextObject() {
    this.currentTextObject = null
    this.emit('textObjectCleared')
  }
  
  /**
   * 获取属性值
   * @param {string} propertyName - 属性名称
   * @returns {any} 属性值
   */
  getPropertyValue(propertyName) {
    if (!this.currentTextObject) return null
    
    switch (propertyName) {
      case 'content':
        return this.currentTextObject.content
      case 'color':
        return '#' + this.currentTextObject.material.color.getHexString()
      case 'mode':
        return this.currentTextObject.mode
      case 'font':
        return this.currentTextObject.config.font
      case 'size':
        return this.currentTextObject.config.size
      case 'thickness':
        return this.currentTextObject.config.thickness
      default:
        return this.currentTextObject.config[propertyName]
    }
  }
  
  /**
   * 设置属性值
   * @param {string} propertyName - 属性名称
   * @param {any} value - 属性值
   */
  setPropertyValue(propertyName, value) {
    if (!this.currentTextObject) return
    
    const oldValue = this.getPropertyValue(propertyName)
    
    // 验证值
    const validation = this.validatePropertyValue(propertyName, value)
    if (!validation.isValid) {
      console.error('属性值验证失败:', validation.errors)
      this.emit('validationError', { propertyName, value, errors: validation.errors })
      return
    }
    
    // 发出属性变化事件
    this.emit('propertyChanging', { 
      textObject: this.currentTextObject, 
      propertyName, 
      oldValue, 
      newValue: value 
    })
    
    // 更新属性
    switch (propertyName) {
      case 'content':
        this.emit('contentChangeRequested', { textObject: this.currentTextObject, newContent: value })
        break
      case 'color':
        this.emit('colorChangeRequested', { textObject: this.currentTextObject, newColor: value })
        break
      case 'mode':
        this.emit('modeChangeRequested', { textObject: this.currentTextObject, newMode: value })
        break
      case 'font':
      case 'size':
      case 'thickness':
        this.currentTextObject.config[propertyName] = value
        this.emit('configChangeRequested', { 
          textObject: this.currentTextObject, 
          propertyName, 
          newValue: value 
        })
        break
      default:
        this.currentTextObject.config[propertyName] = value
        this.emit('configChangeRequested', { 
          textObject: this.currentTextObject, 
          propertyName, 
          newValue: value 
        })
    }
    
    // 发出属性已变化事件
    this.emit('propertyChanged', { 
      textObject: this.currentTextObject, 
      propertyName, 
      oldValue, 
      newValue: value 
    })
  }
  
  /**
   * 验证属性值
   * @param {string} propertyName - 属性名称
   * @param {any} value - 属性值
   * @returns {Object} 验证结果
   */
  validatePropertyValue(propertyName, value) {
    const property = this.properties[propertyName]
    if (!property) {
      return { isValid: false, errors: ['未知属性'] }
    }
    
    const errors = []
    
    // 必填验证
    if (property.required && (value === null || value === undefined || value === '')) {
      errors.push('此属性为必填项')
    }
    
    // 类型验证
    switch (property.type) {
      case 'text':
        if (typeof value !== 'string') {
          errors.push('必须是文本类型')
        } else if (value.trim().length === 0) {
          errors.push('文本内容不能为空')
        }
        break
        
      case 'number':
        if (typeof value !== 'number' || isNaN(value)) {
          errors.push('必须是数字类型')
        } else {
          if (property.min !== undefined && value < property.min) {
            errors.push(`值不能小于 ${property.min}`)
          }
          if (property.max !== undefined && value > property.max) {
            errors.push(`值不能大于 ${property.max}`)
          }
        }
        break
        
      case 'color':
        if (typeof value !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(value)) {
          errors.push('必须是有效的颜色值（如 #FF0000）')
        }
        break
        
      case 'select':
        const validOptions = property.options.map(opt => opt.value)
        if (!validOptions.includes(value)) {
          errors.push(`值必须是以下选项之一: ${validOptions.join(', ')}`)
        }
        break
    }
    
    return {
      isValid: errors.length === 0,
      errors
    }
  }
  
  /**
   * 获取所有属性配置
   * @returns {Object} 属性配置
   */
  getPropertyConfigs() {
    return { ...this.properties }
  }
  
  /**
   * 获取属性配置
   * @param {string} propertyName - 属性名称
   * @returns {Object|null} 属性配置
   */
  getPropertyConfig(propertyName) {
    return this.properties[propertyName] || null
  }
  
  /**
   * 获取当前所有属性值
   * @returns {Object} 属性值对象
   */
  getAllPropertyValues() {
    if (!this.currentTextObject) return {}
    
    const values: Record<string, any> = {}
    Object.keys(this.properties).forEach(propertyName => {
      values[propertyName] = this.getPropertyValue(propertyName)
    })
    
    return values
  }
  
  /**
   * 批量设置属性值
   * @param {Object} properties - 属性值对象
   */
  setAllPropertyValues(properties) {
    if (!this.currentTextObject || !properties) return
    
    Object.entries(properties).forEach(([propertyName, value]) => {
      if (this.properties[propertyName]) {
        this.setPropertyValue(propertyName, value)
      }
    })
  }
  
  /**
   * 重置属性为默认值
   * @param {string} propertyName - 属性名称（可选，不提供则重置所有）
   */
  resetToDefault(propertyName) {
    if (propertyName) {
      const property = this.properties[propertyName]
      if (property && property.default !== undefined) {
        this.setPropertyValue(propertyName, property.default)
      }
    } else {
      // 重置所有属性
      Object.entries(this.properties as Record<string, any>).forEach(([name, config]) => {
        const cfg = config as any
        if (cfg.default !== undefined) {
          this.setPropertyValue(name, cfg.default)
        }
      })
    }
  }
  
  /**
   * 检查属性是否已修改
   * @param {string} propertyName - 属性名称
   * @returns {boolean} 是否已修改
   */
  isPropertyModified(propertyName) {
    const currentValue = this.getPropertyValue(propertyName)
    const defaultValue = this.properties[propertyName]?.default
    
    return currentValue !== defaultValue
  }
  
  /**
   * 获取已修改的属性列表
   * @returns {string[]} 已修改的属性名称数组
   */
  getModifiedProperties() {
    return Object.keys(this.properties).filter(propertyName => 
      this.isPropertyModified(propertyName)
    )
  }
  
  /**
   * 创建属性面板UI（Vue组件数据）
   * @returns {Object} UI配置数据
   */
  createPanelData() {
    if (!this.currentTextObject) {
      return {
        hasTextObject: false,
        properties: []
      }
    }
    
    const properties = Object.entries(this.properties as Record<string, any>).map(([name, config]) => ({
      name,
      ...(config as any),
      value: this.getPropertyValue(name),
      isModified: this.isPropertyModified(name)
    }))
    
    return {
      hasTextObject: true,
      textObjectId: this.currentTextObject.id,
      textObjectName: this.currentTextObject.content || '未命名文字',
      properties
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
   * 销毁属性面板，清理资源
   */
  destroy() {
    this.currentTextObject = null
    this.eventListeners.clear()
    console.log('文字属性面板已销毁')
  }
}
