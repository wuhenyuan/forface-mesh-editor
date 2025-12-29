/**
 * 圆柱面检测问题修复方案
 * 解决圆柱面文字拟合不工作的问题
 */

/**
 * 问题分析和修复建议
 */
export const CYLINDER_DETECTION_FIXES = {
  
  // 问题1: 置信度阈值过高
  CONFIDENCE_THRESHOLD: {
    problem: '当前置信度阈值为0.8（80%），可能过于严格',
    currentValue: 0.8,
    suggestedValue: 0.7,
    reason: '降低到70%可以检测更多的圆柱体，同时保持合理的准确性',
    
    // 修复代码
    fix: `
    // 在 SurfaceTextManager.js 的 analyzeSurface 方法中
    // 将这行:
    if (cylinderInfo && cylinderInfo.confidence > 0.8) {
    
    // 改为:
    if (cylinderInfo && cylinderInfo.confidence > 0.7) {
    `
  },

  // 问题2: 缺少调试信息
  DEBUG_INFO: {
    problem: '缺少详细的调试信息，难以诊断检测失败的原因',
    
    // 修复代码
    fix: `
    // 在 analyzeSurface 方法中添加调试信息
    analyzeSurface(faceInfo) {
      const { mesh } = faceInfo
      
      console.log('🔍 开始表面分析:', mesh.name || 'Unnamed')
      
      // 检测是否为圆柱面
      const cylinderInfo = cylinderSurfaceHelper.detectCylinder(mesh.geometry)
      
      if (cylinderInfo) {
        console.log('圆柱面检测结果:', {
          confidence: (cylinderInfo.confidence * 100).toFixed(1) + '%',
          radius: cylinderInfo.radius.toFixed(2),
          height: cylinderInfo.height.toFixed(2),
          passThreshold: cylinderInfo.confidence > 0.7
        })
        
        if (cylinderInfo.confidence > 0.7) {
          console.log('✅ 检测到圆柱面，启用圆柱面文字模式')
          return {
            surfaceType: 'cylinder',
            cylinderInfo: cylinderInfo,
            attachPoint: faceInfo.point.clone()
          }
        } else {
          console.log('⚠️ 圆柱面置信度不足，使用平面模式')
        }
      } else {
        console.log('❌ 未检测到圆柱面，使用平面模式')
      }
      
      // 默认为平面
      return {
        surfaceType: 'plane',
        attachPoint: faceInfo.point.clone()
      }
    }
    `
  },

  // 问题3: 几何体预处理
  GEOMETRY_PREPROCESSING: {
    problem: '某些几何体可能需要预处理才能正确检测',
    
    fix: `
    // 在检测前添加几何体预处理
    analyzeSurface(faceInfo) {
      const { mesh } = faceInfo
      const geometry = mesh.geometry
      
      // 确保几何体有边界框
      if (!geometry.boundingBox) {
        geometry.computeBoundingBox()
      }
      
      // 确保几何体有法向量
      if (!geometry.attributes.normal) {
        geometry.computeVertexNormals()
      }
      
      // 检查几何体基本信息
      const vertexCount = geometry.attributes.position?.count || 0
      console.log('几何体信息:', {
        type: geometry.type,
        vertices: vertexCount,
        hasIndex: !!geometry.index,
        hasBoundingBox: !!geometry.boundingBox
      })
      
      if (vertexCount < 6) {
        console.log('⚠️ 顶点数量不足，跳过圆柱面检测')
        return { surfaceType: 'plane', attachPoint: faceInfo.point.clone() }
      }
      
      // 继续检测...
    }
    `
  },

  // 问题4: 字体加载问题
  FONT_LOADING: {
    problem: '字体可能未正确加载，导致文字几何体生成失败',
    
    fix: `
    // 在 TextGeometryGenerator.js 中添加字体状态检查
    async generate(text, config = {}, surfaceInfo = null) {
      // 检查字体加载状态
      if (!this.defaultFont) {
        console.log('⏳ 等待默认字体加载...')
        await this.loadDefaultFont()
      }
      
      if (!this.defaultFont) {
        console.warn('⚠️ 字体加载失败，使用备用几何体')
        return this.createFallbackGeometry(text, config)
      }
      
      // 继续生成...
    }
    `
  }
}

/**
 * 应用所有修复
 */
export function applyAllFixes() {
  console.log('🔧 圆柱面检测修复建议:')
  console.log('')
  
  Object.entries(CYLINDER_DETECTION_FIXES).forEach(([key, fix]) => {
    console.log(`${key}:`)
    console.log(`问题: ${fix.problem}`)
    if (fix.suggestedValue !== undefined) {
      console.log(`建议值: ${fix.suggestedValue} (当前: ${fix.currentValue})`)
    }
    console.log('修复代码:')
    console.log(fix.fix)
    console.log('')
  })
}

/**
 * 快速修复：降低置信度阈值
 */
export const QUICK_FIX_CONFIDENCE = `
// 快速修复：在 SurfaceTextManager.js 第608行附近
// 将置信度阈值从 0.8 改为 0.7

// 原代码:
if (cylinderInfo && cylinderInfo.confidence > 0.8) {

// 修改为:
if (cylinderInfo && cylinderInfo.confidence > 0.7) {
`

/**
 * 快速修复：添加调试信息
 */
export const QUICK_FIX_DEBUG = `
// 快速修复：在 analyzeSurface 方法开头添加调试信息

analyzeSurface(faceInfo) {
  const { mesh } = faceInfo
  
  // 添加这些调试信息
  console.log('🔍 表面分析:', {
    meshName: mesh.name || 'Unnamed',
    geometryType: mesh.geometry.type,
    vertexCount: mesh.geometry.attributes.position?.count || 0
  })
  
  const cylinderInfo = cylinderSurfaceHelper.detectCylinder(mesh.geometry)
  
  if (cylinderInfo) {
    console.log('圆柱面检测:', {
      confidence: (cylinderInfo.confidence * 100).toFixed(1) + '%',
      radius: cylinderInfo.radius.toFixed(2),
      willUse: cylinderInfo.confidence > 0.7 ? '✅ 是' : '❌ 否'
    })
  } else {
    console.log('❌ 圆柱面检测失败')
  }
  
  // 继续原有逻辑...
}
`

console.log('🔧 圆柱面检测修复方案已准备就绪')
console.log('请查看 CYLINDER_DETECTION_FIXES 对象获取详细修复建议')

export default CYLINDER_DETECTION_FIXES