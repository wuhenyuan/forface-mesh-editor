/**
 * 兼容层。
 *
 * `BooleanOperator` 的真实实现已经迁移到 `core/boolean`，
 * 这里仅保留旧路径导出，避免现有调用方一次性全部断掉。
 */
export { BooleanOperator } from '../boolean/BooleanOperator';
