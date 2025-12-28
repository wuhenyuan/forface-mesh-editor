import * as THREE from 'three'
import { BooleanOperator } from './BooleanOperator.js'
import { TextGeometryGenerator } from './TextGeometryGenerator.js'
import { TextInputOverlay } from './TextInputOverlay.js'
import { TextTransformControls } from './TextTransformControls.js'

/**
 * 表面文字管理器主控制器
 * 负责协调所有文字相关功能
 */
export class SurfaceTextManager {
  constructor(scene, camera, renderer, domElement, facePicker = null) {
    this.scene = scene
    this.camera = camera
    this.renderer = renderer
    this.domElement = domElement
    this.facePicker = facePicker // 可选，不再强制依赖

    // 初始化子系统
    this.geometryGenerator = new TextGeometryGenerator()
    this.inputOverlay = new TextInputOverlay(domElement)
    this.transformControls = new TextTransformControls(scene, camera, renderer)
    this.booleanOperator = new BooleanOperator()

    // 射线投射器（用于独立的点击检测）
    this.raycaster = new THREE.Raycaster()

    // 可点击的目标网格列表
    this.targetMeshes = []

    // 文字对象管理
    this.textObjects = new Map() // id -> TextObject
    this.selectedTextId = null
    this.isTextMode = false

    // 编辑模式状态
    this.isEditing = false // 是否处于编辑模式（内嵌文字被选中编辑）
    this.isDragging = false // 是否正在拖动

    // 目标网格与文字的映射关系
    this.meshTextMap = new Map() // targetMesh.uuid -> Set<textId>

    // 事件系统
    this.eventListeners = new Map()

    // 绑定的事件处理函数
    this._boundOnClick = this._onCanvasClick.bind(this)

    // 配置
    this.config = {
      maxTextObjects: 100,
      defaultTextConfig: this.getDefaultTextConfig(),
      performanceMode: false
    }

    // 绑定事件处理器
    this.setupEventHandlers()
  }

  /**
   * 设置可点击的目标网格
   * @param {THREE.Mesh[]} meshes - 网格数组
   */
  setTargetMeshes (meshes) {
    this.targetMeshes = meshes.filter(m => m && m.isMesh)
    console.log('已设置目标网格数量:', this.targetMeshes.length)
  }

  /**
   * 添加目标网格
   * @param {THREE.Mesh} mesh - 网格
   */
  addTargetMesh (mesh) {
    if (mesh && mesh.isMesh && !this.targetMeshes.includes(mesh)) {
      this.targetMeshes.push(mesh)
    }
  }

  /**
   * 移除目标网格
   * @param {THREE.Mesh} mesh - 网格
   */
  removeTargetMesh (mesh) {
    const index = this.targetMeshes.indexOf(mesh)
    if (index !== -1) {
      this.targetMeshes.splice(index, 1)
    }
  }

  /**
   * 启用文字添加模式（可以创建新文字）
   */
  enableTextMode () {
    if (this.isTextMode) return
    this.isTextMode = true
    console.log('文字添加模式已启用')
    this.emit('textModeEnabled')
  }

  /**
   * 禁用文字添加模式（只能选择/编辑已有文字）
   */
  disableTextMode () {
    if (!this.isTextMode) return
    this.isTextMode = false
    this.inputOverlay.hide()
    console.log('文字添加模式已禁用')
    this.emit('textModeDisabled')
  }

  /**
   * 启用点击监听（初始化时调用）
   */
  enableClickListener () {
    const canvas = this.renderer.domElement
    canvas.addEventListener('click', this._boundOnClick)
    console.log('点击监听已启用')
  }

  /**
   * 禁用点击监听（销毁时调用）
   */
  disableClickListener () {
    const canvas = this.renderer.domElement
    canvas.removeEventListener('click', this._boundOnClick)
    console.log('点击监听已禁用')
  }

  /**
   * 画布点击事件处理（始终监听，不管文字模式是否开启）
   * @param {MouseEvent} event - 鼠标事件
   */
  async _onCanvasClick (event) {
    // 计算归一化设备坐标（相对于 canvas）
    const canvas = this.renderer.domElement
    const rect = canvas.getBoundingClientRect()
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    )

    // 设置射线
    this.raycaster.setFromCamera(mouse, this.camera)

    // 收集所有可检测的对象：目标网格 + 可见的文字网格
    const textMeshes = Array.from(this.textObjects.values()).map(t => t.mesh).filter(m => m.visible)
    const allMeshes = [
      ...this.targetMeshes,
      ...textMeshes
    ]

    // 执行射线检测
    const intersects = this.raycaster.intersectObjects(allMeshes, false)

    if (intersects.length === 0) {
      // 点击空白区域，取消选择
      if (this.selectedTextId) {
        await this.deselectText()
      }
      return
    }

    const hit = intersects[0]
    const hitMesh = hit.object

    // 构造 faceInfo
    const faceInfo = {
      mesh: hitMesh,
      faceIndex: hit.faceIndex,
      face: hit.face,
      point: hit.point.clone(),
      distance: hit.distance,
      uv: hit.uv
    }

    // 处理点击
    await this._handleClick(faceInfo, event)
  }

  /**
   * 处理点击逻辑
   * @param {Object} faceInfo - 面信息
   * @param {MouseEvent} event - 原始鼠标事件
   */
  async _handleClick (faceInfo, event) {
    try {
      // 1. 检查是否点击了凸起模式的文字对象
      if (faceInfo.mesh.userData && faceInfo.mesh.userData.isTextObject) {
        const textId = faceInfo.mesh.userData.textId
        this.selectText(textId)
        return
      }

      // 2. 检查是否点击了包含内嵌文字的目标网格（通过材质组判断）
      const textIdFromEngraved = this.findTextIdFromEngravedMesh(
        faceInfo.mesh,
        faceInfo.point,
        faceInfo.face,
        faceInfo.faceIndex
      )
      if (textIdFromEngraved) {
        // 点击的是内嵌文字区域，进入编辑模式
        this.enterEditMode(textIdFromEngraved)
        return
      }

      // 3. 如果不是文字模式，点击普通表面不做任何事
      if (!this.isTextMode) {
        // 取消当前选择
        if (this.selectedTextId) {
          await this.deselectText()
        }
        return
      }

      // 4. 文字模式下，点击普通表面创建新文字
      const screenPosition = {
        x: event.clientX,
        y: event.clientY
      }

      // 显示输入覆盖层
      const textContent = await this.inputOverlay.show(screenPosition.x, screenPosition.y)

      if (textContent && this.validateTextContent(textContent)) {
        // 创建文字对象
        await this.createTextObject(textContent, faceInfo)
      }

    } catch (error) {
      console.error('处理点击失败:', error)
      this.emit('error', { type: 'click', error })
    }
  }

  /**
   * 处理面选择事件（保留用于兼容）
   * @param {Object} faceInfo - 面信息
   * @param {MouseEvent} originalEvent - 原始鼠标事件
   * @deprecated 使用内部 _handleClick 代替
   */
  async handleFaceSelected (faceInfo, originalEvent = null) {
    await this._handleClick(faceInfo, originalEvent || { clientX: 0, clientY: 0 })
  }

  /**
   * 从内嵌网格中查找对应的文字ID
   * 通过检测点击的面所属的材质组来判断
   * @param {THREE.Mesh} mesh - 被点击的网格
   * @param {THREE.Vector3} point - 点击位置
   * @param {THREE.Face} face - 点击的面
   * @param {number} faceIndex - 点击的面索引
   * @returns {string|null} 文字ID或null
   */
  findTextIdFromEngravedMesh (mesh, point, face, faceIndex) {
    // 检查这个网格是否有关联的内嵌文字
    const textIds = this.meshTextMap.get(mesh.uuid)
    if (!textIds || textIds.size === 0) return null

    // 检查网格是否使用多材质
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const geometry = mesh.geometry
    const groups = geometry.groups

    // 如果有材质组，通过 faceIndex 找到对应的材质
    if (groups && groups.length > 0 && faceIndex !== undefined) {
      // 计算这个面属于哪个材质组
      const vertexIndex = faceIndex * 3 // 每个面3个顶点

      for (const group of groups) {
        if (vertexIndex >= group.start && vertexIndex < group.start + group.count) {
          const materialIndex = group.materialIndex
          const material = materials[materialIndex]

          // 检查这个材质是否标记为雕刻文字
          if (material && material.userData && material.userData.isEngravedText) {
            const textId = material.userData.textId
            console.log('通过材质组找到内嵌文字:', textId)
            return textId
          }
          break
        }
      }
    }

    // 备用方案：通过边界框检测
    for (const textId of textIds) {
      const textObject = this.textObjects.get(textId)
      if (!textObject || textObject.mode !== 'engraved') continue

      // 获取文字的边界框（世界坐标系）
      const textBounds = new THREE.Box3()
      textObject.geometry.computeBoundingBox()
      textBounds.copy(textObject.geometry.boundingBox)

      // 将边界框转换到世界坐标系
      const textMatrix = textObject.mesh.matrixWorld
      textBounds.applyMatrix4(textMatrix)

      // 扩展边界框一点，增加容错
      textBounds.expandByScalar(0.5)

      // 检查点击点是否在文字边界框内
      if (textBounds.containsPoint(point)) {
        console.log('通过边界框找到内嵌文字:', textId)
        return textId
      }
    }

    return null
  }

  /**
   * 进入编辑模式（用于编辑内嵌文字）
   * @param {string} textId - 文字ID
   */
  enterEditMode (textId) {
    if (!this.textObjects.has(textId)) {
      console.warn(`文字对象不存在: ${textId}`)
      return
    }

    const textObject = this.textObjects.get(textId)

    // 如果不是内嵌模式，直接选择
    if (textObject.mode !== 'engraved') {
      this.selectText(textId)
      return
    }

    console.log(`进入编辑模式: ${textId}`)

    // 设置编辑状态
    this.isEditing = true

    // 恢复目标网格的原始几何体（临时）
    if (textObject.originalTargetGeometry) {
      textObject.targetMesh.geometry.dispose()
      textObject.targetMesh.geometry = textObject.originalTargetGeometry.clone()

      // 恢复原始材质（原始几何体没有材质组，不能用多材质数组）
      if (textObject.originalTargetMaterial) {
        textObject.targetMesh.material = textObject.originalTargetMaterial
      }

      console.log('[DEBUG] 已恢复原始几何体和材质')
    } else {
      console.warn('[DEBUG] 原始几何体不存在!')
    }

    // 显示文字网格，并调整到内嵌位置
    textObject.mesh.visible = true

    // 计算内嵌偏移：文字需要往表面内部移动
    // 获取表面法向量
    if (textObject.faceInfo && textObject.faceInfo.face) {
      const normal = textObject.faceInfo.face.normal.clone()
      normal.transformDirection(textObject.targetMesh.matrixWorld)
      normal.normalize()

      // 获取文字深度（thickness）
      const depth = textObject.config.thickness || 0.5

      // 保存原始位置（用于退出编辑模式时恢复）
      if (!textObject.originalPosition) {
        textObject.originalPosition = textObject.mesh.position.clone()
      }

      // 将文字往内部移动（沿法向量反方向移动 depth 距离）
      const engravedPosition = textObject.originalPosition.clone()
      engravedPosition.add(normal.multiplyScalar(-depth))
      textObject.mesh.position.copy(engravedPosition)

      console.log('[DEBUG] 文字已移动到内嵌位置，偏移深度:', depth)
    }

    // 选中文字
    this.selectText(textId)

    this.emit('editModeEntered', textObject)
  }

  /**
   * 退出编辑模式
   * @param {boolean} applyChanges - 是否应用更改（重新执行布尔操作）
   */
  async exitEditMode (applyChanges = true) {
    if (!this.isEditing || !this.selectedTextId) return

    const textObject = this.textObjects.get(this.selectedTextId)
    if (!textObject || textObject.mode !== 'engraved') {
      this.isEditing = false
      return
    }

    console.log(`退出编辑模式: ${this.selectedTextId}, 应用更改: ${applyChanges}`)

    try {
      // 在重新应用布尔操作前，需要将文字位置恢复到表面位置
      // 因为布尔操作需要文字在正确的"凸起"位置才能正确计算
      if (textObject.faceInfo && textObject.faceInfo.face) {
        const normal = textObject.faceInfo.face.normal.clone()
        normal.transformDirection(textObject.targetMesh.matrixWorld)
        normal.normalize()

        const depth = textObject.config.thickness || 0.5

        // 将文字从内嵌位置移回表面位置
        const currentPos = textObject.mesh.position.clone()
        currentPos.add(normal.multiplyScalar(depth))
        textObject.mesh.position.copy(currentPos)

        // 更新原始位置为新位置
        textObject.originalPosition = textObject.mesh.position.clone()
      }

      if (applyChanges) {
        // 重新执行布尔操作
        await this.reapplyEngraving(textObject)
      } else {
        // 不应用更改，恢复到之前的雕刻状态
        // 需要重新执行布尔操作以恢复
        await this.reapplyEngraving(textObject)
      }
    } catch (error) {
      console.error('退出编辑模式失败:', error)
      this.emit('error', { type: 'exitEditMode', error })
    }

    this.isEditing = false
    this.emit('editModeExited', textObject)
  }

  /**
   * 重新应用内嵌效果（支持多个文字）
   * @param {Object} textObject - 文字对象
   */
  async reapplyEngraving (textObject) {
    try {
      // 获取该网格上所有的内嵌文字
      const textIds = this.meshTextMap.get(textObject.targetMesh.uuid)
      if (!textIds) return

      // 从原始几何体开始
      let currentGeometry = textObject.originalTargetGeometry.clone()

      // 依次应用所有内嵌文字的布尔操作
      for (const textId of textIds) {
        const textObj = this.textObjects.get(textId)
        if (!textObj || textObj.mode !== 'engraved') continue

        // 更新文字网格的世界矩阵
        textObj.mesh.updateMatrixWorld(true)

        // 创建一个用于布尔操作的文字几何体副本，并应用变换
        const textGeometryForCSG = textObj.geometry.clone()
        textGeometryForCSG.applyMatrix4(textObj.mesh.matrixWorld)

        // 获取目标网格的逆矩阵
        const targetInverseMatrix = new THREE.Matrix4().copy(textObj.targetMesh.matrixWorld).invert()
        textGeometryForCSG.applyMatrix4(targetInverseMatrix)

        // 执行布尔减法操作
        const result = await this.booleanOperator.subtract(
          currentGeometry,
          textGeometryForCSG,
          null,
          { textId: textObj.id }
        )

        if (result && result.geometry) {
          // 清理上一个几何体
          if (currentGeometry !== textObject.originalTargetGeometry) {
            currentGeometry.dispose()
          }
          currentGeometry = result.geometry
        }

        // 清理临时几何体
        textGeometryForCSG.dispose()

        // 隐藏文字网格
        textObj.mesh.visible = false
      }

      // 更新目标网格几何体
      textObject.targetMesh.geometry.dispose()
      textObject.targetMesh.geometry = currentGeometry

      // 更新多材质数组
      this.updateMeshMaterials(textObject.targetMesh, textObject)

      console.log('内嵌效果重新应用成功')

    } catch (error) {
      console.error('重新应用内嵌效果失败:', error)
      throw error
    }
  }

  /**
   * 创建文字对象
   * @param {string} content - 文字内容
   * @param {Object} faceInfo - 面信息
   * @returns {Promise<string>} 文字对象ID
   */
  async createTextObject (content, faceInfo) {
    if (this.textObjects.size >= this.config.maxTextObjects) {
      throw new Error(`文字对象数量已达到最大限制: ${this.config.maxTextObjects}`)
    }

    const textId = this.generateTextId()

    try {
      // 生成文字几何体
      const geometry = await this.geometryGenerator.generate(content, this.config.defaultTextConfig)

      // 创建文字网格
      const material = new THREE.MeshPhongMaterial({
        color: this.config.defaultTextConfig.color
      })
      const mesh = new THREE.Mesh(geometry, material)

      // 设置文字对象的用户数据，用于识别
      mesh.userData = {
        isTextObject: true,
        textId: textId,
        type: 'text'
      }

      // 计算文字位置和方向
      this.positionTextOnSurface(mesh, faceInfo)

      // 创建文字对象数据
      const textObject = {
        id: textId,
        content: content,
        mesh: mesh,
        geometry: geometry,
        material: material,
        targetMesh: faceInfo.mesh,
        targetFace: faceInfo.faceIndex,
        faceInfo: faceInfo,
        config: { ...this.config.defaultTextConfig },
        mode: 'raised',
        created: Date.now(),
        modified: Date.now()
      }

      // 添加到场景和管理器
      this.scene.add(mesh)
      this.textObjects.set(textId, textObject)

      // 建立目标网格与文字的映射关系
      this.addMeshTextMapping(faceInfo.mesh, textId)

      // 选中新创建的文字
      this.selectText(textId)

      console.log(`文字对象已创建: ${textId}`, textObject)
      this.emit('textCreated', textObject)

      return textId

    } catch (error) {
      console.error('创建文字对象失败:', error)
      this.emit('error', { type: 'textCreation', error, textId })
      throw error
    }
  }

  /**
   * 添加网格与文字的映射关系
   * @param {THREE.Mesh} mesh - 目标网格
   * @param {string} textId - 文字ID
   */
  addMeshTextMapping (mesh, textId) {
    if (!this.meshTextMap.has(mesh.uuid)) {
      this.meshTextMap.set(mesh.uuid, new Set())
    }
    this.meshTextMap.get(mesh.uuid).add(textId)
  }

  /**
   * 移除网格与文字的映射关系
   * @param {THREE.Mesh} mesh - 目标网格
   * @param {string} textId - 文字ID
   */
  removeMeshTextMapping (mesh, textId) {
    const textIds = this.meshTextMap.get(mesh.uuid)
    if (textIds) {
      textIds.delete(textId)
      if (textIds.size === 0) {
        this.meshTextMap.delete(mesh.uuid)
      }
    }
  }

  /**
   * 在表面上定位文字
   * @param {THREE.Mesh} textMesh - 文字网格
   * @param {Object} faceInfo - 面信息
   */
  positionTextOnSurface (textMesh, faceInfo) {
    // 设置位置
    textMesh.position.copy(faceInfo.point)

    // 计算表面法向量
    const normal = faceInfo.face ? faceInfo.face.normal.clone() : new THREE.Vector3(0, 1, 0)

    // 将法向量转换到世界坐标系
    normal.transformDirection(faceInfo.mesh.matrixWorld)
    normal.normalize()

    // 设置文字朝向（面向法向量）
    const up = new THREE.Vector3(0, 1, 0)
    if (Math.abs(normal.dot(up)) > 0.9) {
      up.set(1, 0, 0) // 如果法向量接近垂直，使用不同的up向量
    }

    textMesh.lookAt(textMesh.position.clone().add(normal))

    // 稍微偏移以避免z-fighting
    textMesh.position.add(normal.multiplyScalar(0.01))
  }

  /**
   * 计算3D点的屏幕位置
   * @param {THREE.Vector3} worldPosition - 世界坐标位置
   * @returns {Object} 屏幕坐标 {x, y}
   */
  calculateScreenPosition (worldPosition) {
    const vector = worldPosition.clone()
    vector.project(this.camera)

    // 转换为全屏坐标（不是相对于DOM元素）
    const x = (vector.x * 0.5 + 0.5) * window.innerWidth
    const y = (vector.y * -0.5 + 0.5) * window.innerHeight

    return { x, y }
  }

  /**
   * 选中文字对象
   * @param {string} textId - 文字ID
   */
  selectText (textId) {
    if (!this.textObjects.has(textId)) {
      console.warn(`文字对象不存在: ${textId}`)
      return
    }

    // 取消之前的选择
    if (this.selectedTextId) {
      this.deselectText()
    }

    this.selectedTextId = textId
    const textObject = this.textObjects.get(textId)

    // 显示变换控制器
    this.transformControls.attach(textObject.mesh)

    // 添加选择高亮效果
    this.addSelectionHighlight(textObject.mesh)

    console.log(`文字对象已选中: ${textId}`)
    this.emit('textSelected', textObject)
  }

  /**
   * 取消选中文字对象
   * @param {boolean} applyChanges - 是否应用更改（仅对编辑模式有效）
   */
  async deselectText (applyChanges = true) {
    if (!this.selectedTextId) return

    const textObject = this.textObjects.get(this.selectedTextId)

    // 如果处于编辑模式，先退出编辑模式
    if (this.isEditing && textObject.mode === 'engraved') {
      await this.exitEditMode(applyChanges)
    }

    // 隐藏变换控制器
    this.transformControls.detach()

    // 移除选择高亮效果
    this.removeSelectionHighlight(textObject.mesh)

    console.log(`文字对象已取消选中: ${this.selectedTextId}`)
    this.emit('textDeselected', textObject)

    this.selectedTextId = null
  }

  /**
   * 添加选择高亮效果
   * @param {THREE.Mesh} mesh - 网格对象
   */
  addSelectionHighlight (mesh) {
    // 保存原始材质
    if (!mesh.userData.originalMaterial) {
      mesh.userData.originalMaterial = mesh.material
    }

    // 创建透明高亮材质
    const highlightMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff00, // 绿色高亮
      transparent: true,
      opacity: 0.5,
      depthTest: false, // 不进行深度测试，不被遮挡
      depthWrite: false // 不写入深度缓冲
    })

    mesh.material = highlightMaterial
    mesh.renderOrder = 999 // 确保最后渲染，显示在最上层
  }

  /**
   * 移除选择高亮效果
   * @param {THREE.Mesh} mesh - 网格对象
   */
  removeSelectionHighlight (mesh) {
    // 恢复原始材质
    if (mesh.userData.originalMaterial) {
      mesh.material = mesh.userData.originalMaterial
      delete mesh.userData.originalMaterial
      mesh.renderOrder = 0 // 恢复默认渲染顺序
    }
  }

  /**
   * 删除文字对象
   * @param {string} textId - 文字ID
   */
  async deleteText (textId) {
    if (!this.textObjects.has(textId)) {
      console.warn(`文字对象不存在: ${textId}`)
      return
    }

    const textObject = this.textObjects.get(textId)

    // 如果是当前选中的文字，先取消选中
    if (this.selectedTextId === textId) {
      await this.deselectText(false) // 不应用更改，因为我们要删除它
    }

    // 如果是内嵌模式，需要处理几何体
    if (textObject.mode === 'engraved' && textObject.originalTargetGeometry) {
      // 先移除映射关系（这样在检查其他内嵌文字时不会包含当前文字）
      this.removeMeshTextMapping(textObject.targetMesh, textId)

      // 检查该网格上是否还有其他内嵌文字
      const textIds = this.meshTextMap.get(textObject.targetMesh.uuid)
      const otherEngravedTexts = []

      if (textIds) {
        for (const otherTextId of textIds) {
          const otherTextObj = this.textObjects.get(otherTextId)
          if (otherTextObj && otherTextObj.mode === 'engraved') {
            otherEngravedTexts.push(otherTextObj)
          }
        }
      }

      if (otherEngravedTexts.length > 0) {
        // 还有其他内嵌文字，需要重新应用它们的布尔操作
        console.log(`删除文字后，重新应用 ${otherEngravedTexts.length} 个其他内嵌文字`)

        try {
          // 从原始几何体开始
          let currentGeometry = textObject.originalTargetGeometry.clone()

          // 依次应用其他内嵌文字的布尔操作
          for (const otherTextObj of otherEngravedTexts) {
            // 更新文字网格的世界矩阵
            otherTextObj.mesh.updateMatrixWorld(true)

            // 创建一个用于布尔操作的文字几何体副本，并应用变换
            const textGeometryForCSG = otherTextObj.geometry.clone()
            textGeometryForCSG.applyMatrix4(otherTextObj.mesh.matrixWorld)

            // 获取目标网格的逆矩阵
            const targetInverseMatrix = new THREE.Matrix4().copy(otherTextObj.targetMesh.matrixWorld).invert()
            textGeometryForCSG.applyMatrix4(targetInverseMatrix)

            // 执行布尔减法操作
            const result = await this.booleanOperator.subtract(
              currentGeometry,
              textGeometryForCSG,
              null,
              { textId: otherTextObj.id }
            )

            if (result && result.geometry) {
              // 清理上一个几何体
              if (currentGeometry !== textObject.originalTargetGeometry) {
                currentGeometry.dispose()
              }
              currentGeometry = result.geometry
            }

            // 清理临时几何体
            textGeometryForCSG.dispose()
          }

          // 更新目标网格几何体
          textObject.targetMesh.geometry.dispose()
          textObject.targetMesh.geometry = currentGeometry

          // 更新多材质数组
          this.updateMeshMaterials(textObject.targetMesh, otherEngravedTexts[0])

        } catch (error) {
          console.error('重新应用其他内嵌文字失败:', error)
          // 回退：恢复原始几何体
          textObject.targetMesh.geometry.dispose()
          textObject.targetMesh.geometry = textObject.originalTargetGeometry.clone()
          if (textObject.originalTargetMaterial) {
            textObject.targetMesh.material = textObject.originalTargetMaterial
          }
        }

      } else {
        // 没有其他内嵌文字，直接恢复原始几何体和材质
        textObject.targetMesh.geometry.dispose()
        textObject.targetMesh.geometry = textObject.originalTargetGeometry.clone()

        // 恢复原始材质
        if (textObject.originalTargetMaterial) {
          textObject.targetMesh.material = textObject.originalTargetMaterial
        }
      }

      // 清理原始几何体引用
      textObject.originalTargetGeometry.dispose()

    } else {
      // 非内嵌模式，只需移除映射关系
      this.removeMeshTextMapping(textObject.targetMesh, textId)
    }

    // 清理雕刻材质
    if (textObject.engravedMaterial) {
      textObject.engravedMaterial.dispose()
      textObject.engravedMaterial = null
    }

    // 从场景中移除
    this.scene.remove(textObject.mesh)

    // 清理几何体和材质
    textObject.geometry.dispose()
    textObject.material.dispose()

    // 从管理器中移除
    this.textObjects.delete(textId)

    console.log(`文字对象已删除: ${textId}`)
    this.emit('textDeleted', { id: textId, textObject })
  }

  /**
   * 更新文字内容
   * @param {string} textId - 文字ID
   * @param {string} newContent - 新内容
   */
  async updateTextContent (textId, newContent) {
    if (!this.textObjects.has(textId)) {
      console.warn(`文字对象不存在: ${textId}`)
      return
    }

    if (!this.validateTextContent(newContent)) {
      throw new Error('无效的文字内容')
    }

    const textObject = this.textObjects.get(textId)
    const oldContent = textObject.content

    try {
      // 生成新的几何体（使用当前配置）
      const newGeometry = await this.geometryGenerator.generate(newContent, textObject.config)

      // 更新网格几何体
      textObject.mesh.geometry.dispose() // 清理旧几何体
      textObject.mesh.geometry = newGeometry
      textObject.geometry = newGeometry
      textObject.content = newContent
      textObject.modified = Date.now()

      console.log(`文字内容已更新: ${textId}`, { oldContent, newContent })
      this.emit('textContentUpdated', { textObject, oldContent, newContent })

    } catch (error) {
      console.error('更新文字内容失败:', error)
      this.emit('error', { type: 'contentUpdate', error, textId })
      throw error
    }
  }

  /**
   * 更新文字配置并重新生成几何体
   * @param {string} textId - 文字ID
   * @param {Object} configUpdates - 配置更新
   */
  async updateTextConfig (textId, configUpdates) {
    if (!this.textObjects.has(textId)) {
      console.warn(`文字对象不存在: ${textId}`)
      return
    }

    const textObject = this.textObjects.get(textId)
    const oldConfig = { ...textObject.config }

    try {
      // 更新配置
      Object.assign(textObject.config, configUpdates)

      // 重新生成几何体
      const newGeometry = await this.geometryGenerator.generate(textObject.content, textObject.config)

      // 更新网格几何体
      textObject.mesh.geometry.dispose()
      textObject.mesh.geometry = newGeometry
      textObject.geometry = newGeometry
      textObject.modified = Date.now()

      console.log(`文字配置已更新: ${textId}`, { oldConfig, newConfig: textObject.config })
      this.emit('textConfigUpdated', { textObject, oldConfig, newConfig: textObject.config })

    } catch (error) {
      console.error('更新文字配置失败:', error)
      // 回滚配置
      textObject.config = oldConfig
      this.emit('error', { type: 'configUpdate', error, textId })
      throw error
    }
  }

  /**
   * 更新文字颜色
   * @param {string} textId - 文字ID
   * @param {number} color - 新颜色
   */
  updateTextColor (textId, color) {
    if (!this.textObjects.has(textId)) {
      console.warn(`文字对象不存在: ${textId}`)
      return
    }

    const textObject = this.textObjects.get(textId)
    const oldColor = textObject.material.color.getHex()

    // 更新原始材质颜色（用于凸起模式）
    textObject.material.color.setHex(color)
    textObject.config.color = color
    textObject.modified = Date.now()

    // 如果是内嵌模式，更新雕刻材质颜色
    if (textObject.mode === 'engraved' && textObject.engravedMaterial) {
      textObject.engravedMaterial.color.setHex(color)
      console.log(`内嵌文字颜色已更新: ${textId}`)
    }

    // 如果文字当前被选中，需要更新高亮材质的颜色
    if (this.selectedTextId === textId) {
      const mesh = textObject.mesh
      // 检查是否有高亮材质
      if (mesh.userData.originalMaterial) {
        // 更新原始材质颜色
        mesh.userData.originalMaterial.color.setHex(color)

        // 重新创建高亮材质以反映新颜色
        const highlightMaterial = mesh.userData.originalMaterial.clone()
        highlightMaterial.emissive.setHex(0x444444) // 添加发光效果
        highlightMaterial.emissiveIntensity = 0.3

        mesh.material = highlightMaterial
      }
    }

    console.log(`文字颜色已更新: ${textId}`, { oldColor, newColor: color })
    this.emit('textColorUpdated', { textObject, oldColor, newColor: color })
  }

  /**
   * 切换文字模式（凸起/内嵌）
   * @param {string} textId - 文字ID
   * @param {string} mode - 模式 ('raised' | 'engraved')
   */
  async switchTextMode (textId, mode) {
    if (!this.textObjects.has(textId)) {
      console.warn(`文字对象不存在: ${textId}`)
      return
    }

    if (!['raised', 'engraved'].includes(mode)) {
      throw new Error(`无效的文字模式: ${mode}`)
    }

    const textObject = this.textObjects.get(textId)
    const oldMode = textObject.mode

    if (oldMode === mode) return // 模式相同，无需切换

    try {
      if (mode === 'engraved') {
        // 切换到内嵌模式，执行布尔操作
        await this.applyEngravingMode(textObject)
      } else {
        // 切换到凸起模式，恢复原始状态
        await this.applyRaisedMode(textObject)
      }

      textObject.mode = mode
      textObject.modified = Date.now()

      console.log(`文字模式已切换: ${textId}`, { oldMode, newMode: mode })
      this.emit('textModeChanged', { textObject, oldMode, newMode: mode })

    } catch (error) {
      console.error('切换文字模式失败:', error)
      this.emit('error', { type: 'modeSwitch', error, textId })
      throw error
    }
  }

  /**
   * 应用内嵌模式（支持多个文字）
   * @param {Object} textObject - 文字对象
   */
  async applyEngravingMode (textObject) {
    // 保存原始几何体和材质（用于恢复）
    if (!textObject.originalTargetGeometry) {
      textObject.originalTargetGeometry = textObject.targetMesh.geometry.clone()
      textObject.originalTargetMaterial = Array.isArray(textObject.targetMesh.material)
        ? textObject.targetMesh.material[0]
        : textObject.targetMesh.material

      console.log('[DEBUG] 保存原始几何体:', {
        vertexCount: textObject.originalTargetGeometry.attributes.position?.count,
        hasIndex: !!textObject.originalTargetGeometry.index,
        materialType: typeof textObject.originalTargetMaterial
      })
    } else {
      console.log('[DEBUG] 原始几何体已存在，跳过保存')
    }

    try {
      // 更新文字网格的世界矩阵
      textObject.mesh.updateMatrixWorld(true)

      // 创建一个用于布尔操作的文字几何体副本，并应用变换
      const textGeometryForCSG = textObject.geometry.clone()
      textGeometryForCSG.applyMatrix4(textObject.mesh.matrixWorld)

      // 获取目标网格的逆矩阵，将文字几何体转换到目标网格的局部坐标系
      const targetInverseMatrix = new THREE.Matrix4().copy(textObject.targetMesh.matrixWorld).invert()
      textGeometryForCSG.applyMatrix4(targetInverseMatrix)

      // 执行布尔减法操作，传入 textId 用于标识
      const result = await this.booleanOperator.subtract(
        textObject.targetMesh.geometry,
        textGeometryForCSG,
        null,
        { textId: textObject.id }
      )

      if (result && result.geometry) {
        // 更新目标网格几何体
        textObject.targetMesh.geometry.dispose()
        textObject.targetMesh.geometry = result.geometry

        // 更新多材质数组（支持多个文字）
        this.updateMeshMaterials(textObject.targetMesh, textObject)

        // 隐藏文字网格（因为已经雕刻到目标网格中）
        textObject.mesh.visible = false

        console.log('[DEBUG] 内嵌模式应用成功:', {
          resultVertexCount: result.geometry.attributes.position?.count,
          groupsCount: result.geometry.groups?.length || 0
        })
      } else {
        throw new Error('布尔操作返回空结果')
      }

      // 清理临时几何体
      textGeometryForCSG.dispose()

    } catch (error) {
      console.error('应用内嵌模式失败:', error)
      throw error
    }
  }

  /**
   * 更新网格的多材质数组（支持多个内嵌文字）
   * @param {THREE.Mesh} mesh - 目标网格
   * @param {Object} newTextObject - 新添加的文字对象
   */
  updateMeshMaterials (mesh, newTextObject) {
    const textIds = this.meshTextMap.get(mesh.uuid)
    if (!textIds) return

    // 收集所有内嵌文字的材质
    const materials = []

    // 材质0: 原始表面材质
    const originalMaterial = newTextObject.originalTargetMaterial
    materials.push(originalMaterial)

    // 为每个内嵌文字创建/更新材质
    let materialIndex = 1
    for (const textId of textIds) {
      const textObj = this.textObjects.get(textId)
      if (!textObj || textObj.mode !== 'engraved') continue

      // 获取原始颜色
      const originalColor = originalMaterial.color?.getHex() || 0x409eff

      // 创建或复用雕刻材质
      if (!textObj.engravedMaterial) {
        textObj.engravedMaterial = new THREE.MeshStandardMaterial({
          color: originalColor,
          roughness: 0.7,
          metalness: 0.1
        })
      }
      textObj.engravedMaterial.userData = {
        textId: textObj.id,
        isEngravedText: true,
        materialIndex: materialIndex
      }

      materials.push(textObj.engravedMaterial)
      textObj.materialIndex = materialIndex
      materialIndex++
    }

    // 设置多材质
    mesh.material = materials.length > 1 ? materials : materials[0]

    console.log(`网格材质已更新，共 ${materials.length} 个材质`)
  }

  /**
   * 应用凸起模式（支持多个文字）
   * @param {Object} textObject - 文字对象
   */
  async applyRaisedMode (textObject) {
    // 如果之前是内嵌模式，需要处理几何体
    if (textObject.mode === 'engraved' && textObject.originalTargetGeometry) {
      // 清理雕刻材质
      if (textObject.engravedMaterial) {
        textObject.engravedMaterial.dispose()
        textObject.engravedMaterial = null
      }

      // 显示文字网格
      textObject.mesh.visible = true

      // 检查该网格上是否还有其他内嵌文字
      const textIds = this.meshTextMap.get(textObject.targetMesh.uuid)
      const otherEngravedTexts = []

      if (textIds) {
        for (const textId of textIds) {
          if (textId === textObject.id) continue // 跳过当前文字
          const otherTextObj = this.textObjects.get(textId)
          // 注意：此时当前文字的 mode 还是 'engraved'，所以需要排除它
          if (otherTextObj && otherTextObj.mode === 'engraved') {
            otherEngravedTexts.push(otherTextObj)
          }
        }
      }

      if (otherEngravedTexts.length > 0) {
        // 还有其他内嵌文字，需要重新应用它们的布尔操作
        console.log(`还有 ${otherEngravedTexts.length} 个其他内嵌文字，重新应用布尔操作`)

        try {
          // 从原始几何体开始
          let currentGeometry = textObject.originalTargetGeometry.clone()

          // 依次应用其他内嵌文字的布尔操作
          for (const otherTextObj of otherEngravedTexts) {
            // 更新文字网格的世界矩阵
            otherTextObj.mesh.updateMatrixWorld(true)

            // 创建一个用于布尔操作的文字几何体副本，并应用变换
            const textGeometryForCSG = otherTextObj.geometry.clone()
            textGeometryForCSG.applyMatrix4(otherTextObj.mesh.matrixWorld)

            // 获取目标网格的逆矩阵
            const targetInverseMatrix = new THREE.Matrix4().copy(otherTextObj.targetMesh.matrixWorld).invert()
            textGeometryForCSG.applyMatrix4(targetInverseMatrix)

            // 执行布尔减法操作
            const result = await this.booleanOperator.subtract(
              currentGeometry,
              textGeometryForCSG,
              null,
              { textId: otherTextObj.id }
            )

            if (result && result.geometry) {
              // 清理上一个几何体
              if (currentGeometry !== textObject.originalTargetGeometry) {
                currentGeometry.dispose()
              }
              currentGeometry = result.geometry
            }

            // 清理临时几何体
            textGeometryForCSG.dispose()
          }

          // 更新目标网格几何体
          textObject.targetMesh.geometry.dispose()
          textObject.targetMesh.geometry = currentGeometry

          // 更新多材质数组（使用第一个其他内嵌文字来更新）
          this.updateMeshMaterials(textObject.targetMesh, otherEngravedTexts[0])

          console.log('凸起模式应用成功，已重新应用其他内嵌文字')

        } catch (error) {
          console.error('重新应用其他内嵌文字失败:', error)
          // 回退：恢复原始几何体
          textObject.targetMesh.geometry.dispose()
          textObject.targetMesh.geometry = textObject.originalTargetGeometry.clone()
          if (textObject.originalTargetMaterial) {
            textObject.targetMesh.material = textObject.originalTargetMaterial
          }
          throw error
        }

      } else {
        // 没有其他内嵌文字，直接恢复原始几何体和材质
        textObject.targetMesh.geometry.dispose()
        textObject.targetMesh.geometry = textObject.originalTargetGeometry.clone()

        // 恢复原始材质
        if (textObject.originalTargetMaterial) {
          textObject.targetMesh.material = textObject.originalTargetMaterial
        }

        console.log('凸起模式应用成功，已恢复原始几何体')
      }

    } else {
      // 确保文字网格可见
      textObject.mesh.visible = true
    }
  }

  /**
   * 获取所有文字对象
   * @returns {Array} 文字对象数组
   */
  getAllTextObjects () {
    return Array.from(this.textObjects.values())
  }

  /**
   * 获取选中的文字对象
   * @returns {Object|null} 文字对象或null
   */
  getSelectedTextObject () {
    return this.selectedTextId ? this.textObjects.get(this.selectedTextId) : null
  }

  /**
   * 设置事件处理器
   */
  setupEventHandlers () {
    // 监听变换控制器事件
    this.transformControls.on('change', () => {
      if (this.selectedTextId) {
        const textObject = this.textObjects.get(this.selectedTextId)
        textObject.modified = Date.now()
        this.emit('textTransformed', textObject)
      }
    })

    // 监听拖动开始事件
    this.transformControls.on('dragging-changed', async (isDragging) => {
      this.isDragging = isDragging

      if (this.selectedTextId) {
        const textObject = this.textObjects.get(this.selectedTextId)

        if (isDragging) {
          // 开始拖动
          console.log('开始拖动文字')
          this.emit('dragStart', textObject)
        } else {
          // 结束拖动
          console.log('结束拖动文字')
          this.emit('dragEnd', textObject)

          // 如果是编辑模式下的内嵌文字，重新应用布尔操作
          if (this.isEditing && textObject.mode === 'engraved') {
            try {
              // 拖动结束后，文字在内嵌位置，需要先移回表面位置再做布尔操作
              if (textObject.faceInfo && textObject.faceInfo.face) {
                const normal = textObject.faceInfo.face.normal.clone()
                normal.transformDirection(textObject.targetMesh.matrixWorld)
                normal.normalize()

                const depth = textObject.config.thickness || 0.5

                // 将文字从内嵌位置移回表面位置
                const surfacePos = textObject.mesh.position.clone()
                surfacePos.add(normal.multiplyScalar(depth))
                textObject.mesh.position.copy(surfacePos)
              }

              await this.reapplyEngraving(textObject)

              // 布尔操作完成后，再把文字移回内嵌位置（因为还在编辑模式）
              if (textObject.faceInfo && textObject.faceInfo.face) {
                const normal = textObject.faceInfo.face.normal.clone()
                normal.transformDirection(textObject.targetMesh.matrixWorld)
                normal.normalize()

                const depth = textObject.config.thickness || 0.5

                // 将文字移回内嵌位置
                const engravedPos = textObject.mesh.position.clone()
                engravedPos.add(normal.multiplyScalar(-depth))
                textObject.mesh.position.copy(engravedPos)
              }

              console.log('拖动结束，布尔操作已重新应用')
            } catch (error) {
              console.error('重新应用布尔操作失败:', error)
              this.emit('error', { type: 'reapplyEngraving', error })
            }
          }
        }
      }
    })

    // 监听输入覆盖层事件
    this.inputOverlay.on('cancel', () => {
      console.log('文字输入已取消')
    })
  }

  /**
   * 添加事件监听器
   * @param {string} eventName - 事件名称
   * @param {Function} callback - 回调函数
   */
  on (eventName, callback) {
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
  off (eventName, callback) {
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
  emit (eventName, ...args) {
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
   * 销毁管理器，清理资源
   */
  async destroy () {
    // 禁用点击监听
    this.disableClickListener()

    // 禁用文字模式
    this.disableTextMode()

    // 删除所有文字对象
    const textIds = Array.from(this.textObjects.keys())
    for (const id of textIds) {
      await this.deleteText(id)
    }

    // 清理子系统
    this.transformControls.dispose()
    this.inputOverlay.destroy()

    // 清理事件监听器
    this.eventListeners.clear()

    console.log('表面文字管理器已销毁')
  }

  /**
   * 验证文字内容
   * @param {string} content - 文字内容
   * @returns {boolean} 是否有效
   */
  validateTextContent (content) {
    return typeof content === 'string' && content.trim().length > 0
  }

  /**
   * 生成唯一文字ID
   * @returns {string} 唯一ID
   */
  generateTextId () {
    return `text_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
  }

  /**
   * 获取默认文字配置
   * @returns {Object} 默认配置
   */
  getDefaultTextConfig () {
    return {
      font: 'helvetiker',
      size: 3, // 字体大小设置为3
      thickness: 0.5, // 深度设置为0.5
      color: 0x333333,
      mode: 'raised', // 'raised' | 'engraved'
      curveSegments: 12,
      bevelEnabled: false,
      bevelThickness: 0.02, // 倒角厚度
      bevelSize: 0.01, // 倒角大小
      bevelOffset: 0,
      bevelSegments: 5
    }
  }

  /**
   * 检查是否处于编辑模式
   * @returns {boolean} 是否处于编辑模式
   */
  isInEditMode () {
    return this.isEditing
  }

  /**
   * 检查是否正在拖动
   * @returns {boolean} 是否正在拖动
   */
  isCurrentlyDragging () {
    return this.isDragging
  }

  /**
   * 获取指定网格上的所有文字对象
   * @param {THREE.Mesh} mesh - 目标网格
   * @returns {Array} 文字对象数组
   */
  getTextObjectsOnMesh (mesh) {
    const textIds = this.meshTextMap.get(mesh.uuid)
    if (!textIds) return []

    return Array.from(textIds)
      .map(id => this.textObjects.get(id))
      .filter(obj => obj !== undefined)
  }

  /**
   * 获取指定网格上的内嵌文字对象
   * @param {THREE.Mesh} mesh - 目标网格
   * @returns {Array} 内嵌文字对象数组
   */
  getEngravedTextObjectsOnMesh (mesh) {
    return this.getTextObjectsOnMesh(mesh).filter(obj => obj.mode === 'engraved')
  }

  /**
   * 手动触发重新应用所有内嵌效果
   * @param {THREE.Mesh} targetMesh - 目标网格（可选，不传则处理所有）
   */
  async refreshAllEngravings (targetMesh = null) {
    const textObjects = targetMesh
      ? this.getEngravedTextObjectsOnMesh(targetMesh)
      : this.getAllTextObjects().filter(obj => obj.mode === 'engraved')

    for (const textObject of textObjects) {
      try {
        await this.reapplyEngraving(textObject)
      } catch (error) {
        console.error(`刷新内嵌效果失败: ${textObject.id}`, error)
      }
    }

    console.log(`已刷新 ${textObjects.length} 个内嵌文字效果`)
  }

  /**
   * 限制文字移动在目标表面上
   * @param {string} textId - 文字ID
   * @param {boolean} constrain - 是否限制
   */
  setConstrainToSurface (textId, constrain) {
    if (!this.textObjects.has(textId)) return

    const textObject = this.textObjects.get(textId)
    textObject.constrainToSurface = constrain

    // TODO: 实现表面约束逻辑
    console.log(`文字 ${textId} 表面约束: ${constrain}`)
  }
}