/**
 * 通用实体布尔模块导出。
 *
 * 这里承载与具体业务无关的布尔能力：
 * - `BooleanOperator`：底层 CSG 操作器；
 * - `EntityBooleanService`：面向实体编排的通用服务。
 */
export { BooleanOperator } from './BooleanOperator';
export { default as EntityBooleanService } from './EntityBooleanService';
export type { EntityBooleanMetadata } from './EntityBooleanService';
