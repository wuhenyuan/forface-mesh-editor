export const CONFIG_SCHEMA_VERSION = 3

/**
 * 内部归一化结构（运行时使用）
 * - `models` / `texts` 便于 Editor/Viewer 直接访问
 * - 持久化到文件（project.json）时会序列化成 `features[]`（更通用、可扩展）
 */
const INTERNAL_DEFAULT_CONFIG = {
  status: 'draft', // draft（草稿/编辑中）, synced（已同步到后端）
  propIdentifier: '',

  // 模型统一配置（以后扩展只需要往这里加 key）
  // - origin: 原始/导入模型（未编辑）
  // - base:   底座模型（可选）
  // - final:  编辑后导出/上传的目标（可选 path）
  models: {
    origin: { id: 'origin', path: '', config: {} },
    base: {
      id: 'base',
      path: '',
      config: {
        position: [0, 0, 0],
        scale: [1, 1, 1],
        rotation: [0, 0, 0],
        surface: 100,
        volume: 1000,
        boundingBox: [10, 10, 10],
        // obb 包围盒，如果准的话可以加，不准就不加
        obb: [10, 10, 10]
      }
    },
    final: {
      id: 'final',
      path: '',
      config: {
        scale: [1, 1, 1],
        surface: 100,
        volume: 1000,
        boundingBox: [10, 10, 10]
      }
    }
  },

  // 装饰配置（暂时没有）
  decorations: [{}],

  // 文字配置（示例）
  texts: [
    {
      id: '文字1',
      index: 'random uuid',
      type: 'Ailias',
      text: '我是文字内容',
      size: 33,
      depth: 3,
      effect: 'Embossed',
      color: '#ff00ff',
      position: [0, 0, 0],
      rotate: [0, 0, 0],
      wrap: 'surface Project',
      attachmentSurface: 'in0in1100'
    }
  ],

  lookupTable: {},
  faceRepare: '0',
  modelOptimization: '0'
}

function _normalizeModelEntry(key, input, fallback) {
  const value = input && typeof input === 'object' ? input : {}
  const base = fallback || { id: key, path: '', config: {} }

  return {
    ...base,
    ...value,
    id: value.id || base.id || key,
    path: typeof value.path === 'string' ? value.path : (base.path || ''),
    config: {
      ...(base.config || {}),
      ...(value.config && typeof value.config === 'object' ? value.config : {})
    }
  }
}

/**
 * 兼容旧字段的升级/归一化
 * - 旧：originModelPath/baseModelPath/finalModelPath + finalModelConfig/baseModelConfig
 * - 新：models.{origin,base,final}.{path,config}
 */
export function normalizeConfig(inputConfig) {
  const source = inputConfig && typeof inputConfig === 'object' ? inputConfig : {}

  const {
    // legacy fields (v1)
    originModelPath,
    baseModelPath,
    finalModelPath,
    finalModelConfig,
    baseModelConfig,
    // config2 format
    version,
    createTime,
    // v3 persisted format
    features,
    // v2 internal format
    models: modelsField,
    texts: textsField,
    ...rest
  } = source

  const base = JSON.parse(JSON.stringify(INTERNAL_DEFAULT_CONFIG))

  if (typeof version === 'string' && version) {
    rest.metadata = {
      ...(rest.metadata && typeof rest.metadata === 'object' ? rest.metadata : {}),
      version,
      ...(typeof createTime === 'string' && createTime ? { created: createTime } : {})
    }
  } else if (typeof createTime === 'string' && createTime) {
    rest.metadata = {
      ...(rest.metadata && typeof rest.metadata === 'object' ? rest.metadata : {}),
      created: createTime
    }
  }

  const modelsFromFeatures = {}
  const textsFromFeatures = []

  if (Array.isArray(features)) {
    for (const feature of features) {
      if (!feature || typeof feature !== 'object') continue
      const kind = feature.kind || feature.type
      const id = typeof feature.id === 'string' ? feature.id : null
      const payload = feature.payload && typeof feature.payload === 'object' ? feature.payload : {}

      if (kind === 'model') {
        const key = id || (typeof payload.key === 'string' ? payload.key : null)
        if (!key) continue
        modelsFromFeatures[key] = {
          id: key,
          path: typeof payload.path === 'string' ? payload.path : '',
          config: payload.config && typeof payload.config === 'object' ? payload.config : {}
        }
        continue
      }

      if (kind === 'text') {
        const textIndex = id || (typeof payload.index === 'string' ? payload.index : null)
        if (!textIndex) continue
        const { index: _ignored, ...restPayload } = payload
        textsFromFeatures.push({ ...restPayload, index: textIndex })
      }
    }
  }

  const modelsFromList = {}
  if (Array.isArray(modelsField)) {
    for (let i = 0; i < modelsField.length; i++) {
      const entry = modelsField[i]
      if (!entry || typeof entry !== 'object') continue

      const configuredPath =
        typeof entry.url === 'string'
          ? entry.url
          : (typeof entry.path === 'string' ? entry.path : '')
      if (!configuredPath) continue

      const key =
        typeof entry.id === 'string' && entry.id
          ? entry.id
          : (typeof entry.key === 'string' && entry.key
              ? entry.key
              : (i === 0 ? 'origin' : (i === 1 ? 'base' : (i === 2 ? 'final' : `model_${i + 1}`))))

      const nextConfig = {}
      if (Array.isArray(entry.position)) nextConfig.position = entry.position
      if (Array.isArray(entry.scale)) nextConfig.scale = entry.scale
      if (Array.isArray(entry.rotation)) nextConfig.rotation = entry.rotation

      modelsFromList[key] = {
        id: key,
        path: configuredPath,
        config: nextConfig
      }
    }
  }

  const merged = {
    ...base,
    ...rest,
    schemaVersion: CONFIG_SCHEMA_VERSION,
    models: {
      ...base.models,
      ...modelsFromFeatures,
      ...modelsFromList,
      ...(modelsField && typeof modelsField === 'object' && !Array.isArray(modelsField) ? modelsField : {})
    },
    texts: Array.isArray(textsField)
      ? textsField
      : (textsFromFeatures.length > 0 ? textsFromFeatures : base.texts)
  }

  // 归一化 models（包含未来扩展的未知 key）
  for (const [key, value] of Object.entries(merged.models)) {
    merged.models[key] = _normalizeModelEntry(key, value, base.models[key])
  }

  // 确保 texts 每一项都有稳定 index（用于后续更新/删除/持久化）
  if (Array.isArray(merged.texts)) {
    const now = Date.now()
    merged.texts = merged.texts
      .filter((t) => t && typeof t === 'object')
      .map((t, idx) => {
        if (typeof t.index === 'string' && t.index) return t
        return {
          ...t,
          index: `text_${now}_${idx}_${Math.random().toString(36).slice(2, 10)}`
        }
      })
  }

  // legacy path → models.*.path（仅在新值为空时填充）
  if (typeof originModelPath === 'string' && !merged.models.origin.path) {
    merged.models.origin.path = originModelPath
  }
  if (typeof baseModelPath === 'string' && !merged.models.base.path) {
    merged.models.base.path = baseModelPath
  }
  if (typeof finalModelPath === 'string' && !merged.models.final.path) {
    merged.models.final.path = finalModelPath
  }

  // legacy config → models.*.config（新字段优先）
  if (finalModelConfig && typeof finalModelConfig === 'object') {
    merged.models.final.config = {
      ...(base.models.final.config || {}),
      ...(finalModelConfig || {}),
      ...(merged.models.final.config || {})
    }
  }
  if (baseModelConfig && typeof baseModelConfig === 'object') {
    merged.models.base.config = {
      ...(base.models.base.config || {}),
      ...(baseModelConfig || {}),
      ...(merged.models.base.config || {})
    }
  }

  return merged
}

/**
 * 持久化文件结构（project.json 使用）
 * - 相对路径：表示 zip 包内路径，导入 zip 时会映射到 blob:URL 加载
 * - 网络 URL：表示线上资源（轻量包可只存 json + final）
 *
 * features 设计：把模型/文字统一成条目，新增一个文字就是新增一个 feature
 * - model feature: { kind:'model', id:'origin|base|final|...', payload:{ path, config } }
 * - text  feature: { kind:'text',  id:'<uuid>', payload:{ ...textConfig(不含 index) } }
 */
export function serializeConfig(inputConfig) {
  const normalized = normalizeConfig(inputConfig)

  const nextFeatures = []

  for (const [key, model] of Object.entries(normalized.models || {})) {
    nextFeatures.push({
      kind: 'model',
      id: key,
      payload: {
        path: model?.path || '',
        config: model?.config || {}
      }
    })
  }

  const textsList = Array.isArray(normalized.texts) ? normalized.texts : []
  for (const textConfig of textsList) {
    if (!textConfig || typeof textConfig !== 'object') continue
    const { index, ...payload } = textConfig
    const id = typeof index === 'string' && index ? index : `text_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
    nextFeatures.push({
      kind: 'text',
      id,
      payload
    })
  }

  const persisted = {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    status: normalized.status || 'draft',
    propIdentifier: normalized.propIdentifier || '',
    features: nextFeatures,
    decorations: normalized.decorations || [],
    lookupTable: normalized.lookupTable || {},
    faceRepare: normalized.faceRepare ?? '0',
    modelOptimization: normalized.modelOptimization ?? '0'
  }

  if (normalized.metadata) {
    persisted.metadata = normalized.metadata
  }

  return persisted
}

const defaultConfig = serializeConfig(INTERNAL_DEFAULT_CONFIG)

export default defaultConfig
