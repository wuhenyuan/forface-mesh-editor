import { EntityManager } from './Document/EntityManager';
import { Entity, EntityProps, EntityPatch, TextEntity, ModelEntity } from './Document/Entity';
import { VisualManager } from './visual/VisualManager';
import { BooleanOperator } from './boolean/BooleanOperator';
import * as THREE from 'three';

export interface EditorOptions {
  container: HTMLElement;
}

/**
 * 3D编辑器主入口
 * 提供简洁的 API：addEntity / updateEntity / delEntity
 */
export class Editor {
  container: HTMLElement;
  entityManager: EntityManager;
  visualManager: VisualManager;
  booleanOperator: BooleanOperator;

  // 事件监听
  private listeners: Map<string, Set<Function>> = new Map();

  constructor(options: EditorOptions) {
    this.container = options.container;

    // 初始化数据管理器
    this.entityManager = new EntityManager();

    // 初始化可视化管理器
    this.visualManager = new VisualManager({
      container: this.container,
      entityManager: this.entityManager,
    });

    // 初始化布尔操作器
    this.booleanOperator = new BooleanOperator();

    // 订阅选中事件
    this.visualManager.selectionManager.on('selected', (data: any) => {
      this.emit('entitySelected', { entityId: data.object?.userData?.entityId });
    });

    this.visualManager.selectionManager.on('deselected', () => {
      this.emit('entityDeselected', {});
    });

    this.visualManager.selectionManager.on('objectChange', (data: any) => {
      // 变换控制器修改了对象位置，同步到 EntityManager
      const entityId = data.object?.userData?.entityId;
      if (entityId) {
        const obj = data.object;
        this.entityManager.updateEntity(entityId, {
          position: [obj.position.x, obj.position.y, obj.position.z],
          rotation: [obj.rotation.x, obj.rotation.y, obj.rotation.z],
          scale: [obj.scale.x, obj.scale.y, obj.scale.z],
        });
      }
    });
  }

  /**
   * 添加实体
   */
  addEntity(props: EntityProps): Entity {
    return this.entityManager.addEntity(props);
  }

  /**
   * 更新实体
   */
  updateEntity(id: string, patch: EntityPatch): boolean {
    return this.entityManager.updateEntity(id, patch);
  }

  /**
   * 删除实体
   */
  delEntity(id: string): boolean {
    return this.entityManager.delEntity(id);
  }

  /**
   * 获取实体
   */
  getEntity(id: string): Entity | null {
    return this.entityManager.getEntity(id);
  }

  /**
   * 获取所有实体
   */
  getAllEntities(): Entity[] {
    return this.entityManager.getAllEntities();
  }

  /**
   * 选中实体
   */
  selectEntity(id: string): void {
    this.visualManager.selectEntity(id);
  }

  /**
   * 取消选中
   */
  deselectEntity(): void {
    this.visualManager.deselectEntity();
  }

  /**
   * 获取当前选中的实体ID
   */
  getSelectedEntityId(): string | null {
    return this.visualManager.selectedEntityId;
  }

  /**
   * 设置变换模式
   */
  setTransformMode(mode: 'translate' | 'rotate' | 'scale'): void {
    this.visualManager.selectionManager.setMode(mode);
  }

  /**
   * 执行布尔运算并更新显示
   */
  async computeBoolean(): Promise<void> {
    const entities = this.entityManager.getAllEntities();
    
    // 找到基础模型（booleanType 为 'none' 的第一个模型）
    const baseEntity = entities.find(e => e.type === 'model' && e.booleanType === 'none');
    if (!baseEntity) {
      console.warn('没有找到基础模型');
      return;
    }

    // 获取基础模型的几何体
    const baseMesh = this.visualManager.entityMeshMap.get(baseEntity.id) as THREE.Mesh;
    if (!baseMesh?.geometry) {
      console.warn('基础模型没有几何体');
      return;
    }

    let resultGeometry = baseMesh.geometry.clone();

    // 遍历所有需要布尔运算的实体
    for (const entity of entities) {
      if (entity.id === baseEntity.id) continue;
      if (entity.booleanType === 'none') continue;

      const mesh = this.visualManager.entityMeshMap.get(entity.id) as THREE.Mesh;
      if (!mesh?.geometry) continue;

      try {
        if (entity.booleanType === 'subtract') {
          const result = await this.booleanOperator.subtract(
            resultGeometry,
            mesh.geometry,
            mesh.matrixWorld
          );
          resultGeometry.dispose();
          resultGeometry = result.geometry;
        } else if (entity.booleanType === 'union') {
          const newGeometry = await this.booleanOperator.union(
            resultGeometry,
            mesh.geometry,
            mesh.matrixWorld
          );
          resultGeometry.dispose();
          resultGeometry = newGeometry;
        }
      } catch (error) {
        console.error('布尔运算失败:', error);
      }
    }

    // 创建结果网格
    const resultMaterial = new THREE.MeshStandardMaterial({
      color: 0x409eff,
      roughness: 0.5,
      metalness: 0.1,
    });
    const resultMesh = new THREE.Mesh(resultGeometry, resultMaterial);
    
    // 设置布尔结果
    this.visualManager.setBooleanResult(resultMesh);
  }

  /**
   * 清空所有实体
   */
  clear(): void {
    this.entityManager.clear();
    this.visualManager.setBooleanResult(null);
  }

  /**
   * 调整大小
   */
  resize(): void {
    this.visualManager.resize();
  }

  /**
   * 事件监听
   */
  on(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  /**
   * 移除事件监听
   */
  off(event: string, callback: Function): void {
    this.listeners.get(event)?.delete(callback);
  }

  /**
   * 发出事件
   */
  private emit(event: string, data: any): void {
    this.listeners.get(event)?.forEach((cb) => {
      try {
        cb(data);
      } catch (e) {
        console.error(`[Editor] Error in ${event} callback:`, e);
      }
    });
  }

  /**
   * 导出数据
   */
  toJSON(): Record<string, any>[] {
    return this.entityManager.toJSON();
  }

  /**
   * 导入数据
   */
  fromJSON(data: EntityProps[]): void {
    this.clear();
    data.forEach((props) => {
      this.addEntity(props);
    });
  }

  /**
   * 销毁
   */
  dispose(): void {
    this.visualManager.dispose();
    this.booleanOperator.destroy();
    this.listeners.clear();
  }
}

export default Editor;
