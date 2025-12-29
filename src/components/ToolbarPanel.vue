<template>
  <div class="toolbar">
    <div class="left">
      <el-button type="text">{{ projectName }}</el-button>
    </div>
    <div class="center">
      <el-button size="mini">撤销</el-button>
      <el-button size="mini">恢复</el-button>
      <el-button size="mini">重置视图</el-button>
      <el-divider direction="vertical"></el-divider>
      <el-button size="mini">模型尺寸</el-button>
      <el-button size="mini">设计交流</el-button>
      <el-button size="mini">分享</el-button>
      <el-button size="mini">更多</el-button>
      <el-divider direction="vertical"></el-divider>
      <el-button 
        size="mini" 
        type="warning"
        @click="checkIntersection"
        :loading="checkingIntersection"
      >
        相交检查
      </el-button>
    </div>
    <div class="right">
      <el-button type="primary" size="mini">设计保存</el-button>
    </div>
  </div>
</template>

<script>
import { ref, inject } from 'vue'
import * as THREE from 'three'

export default {
  name: 'ToolbarPanel',
  setup() {
    const projectName = ref('人物模型编辑器')
    const checkingIntersection = ref(false)
    
    // 注入工作区引用，用于获取文字和几何体信息
    const workspaceRef = inject('workspaceRef', null)
    
    /**
     * 执行相交检查
     */
    const checkIntersection = async () => {
      if (checkingIntersection.value) return
      
      try {
        checkingIntersection.value = true
        console.log('========== 开始相交检查 ==========')
        
        // 直接从 window 获取调试数据
        const debugData = window.debugTextData
        if (!debugData) {
          console.error('❌ 未找到调试数据，请等待场景初始化完成')
          return
        }
        
        console.log('✅ 获取调试数据成功')
        console.log('🔍 调试数据结构:', debugData)
        
        const textObjects = debugData.textObjects || []
        const targetMeshes = debugData.targetMeshes || []
        
        console.log('📝 场景中文字对象数量:', textObjects.length)
        console.log('📝 文字对象详情:', textObjects)
        console.log('🎯 场景中目标网格数量:', targetMeshes.length)
        
        if (textObjects.length === 0) {
          console.warn('⚠️ 场景中没有文字对象')
          return
        }
        
        if (targetMeshes.length === 0) {
          console.error('❌ 场景中没有目标网格')
          return
        }
        
        // 创建布尔操作器
        const { BooleanOperator } = await import('../utils/surfaceText/BooleanOperator.js')
        const booleanOperator = new BooleanOperator()
        
        if (!booleanOperator.isReady()) {
          throw new Error('布尔操作器未准备就绪')
        }
        
        console.log('✅ 布尔操作器准备就绪')
        
        // 遍历所有文字对象
        for (let i = 0; i < textObjects.length; i++) {
          const textObject = textObjects[i]
          console.log(`\n--- 检查文字对象 ${i + 1} ---`)
          console.log('📝 文字内容:', textObject.content || '未知')
          console.log('📝 文字ID:', textObject.id)
          console.log('📝 完整文字对象:', textObject)
          
          // 获取文字的几何体和变换矩阵
          const textMesh = textObject.mesh  // 注意：SurfaceTextManager 中使用的是 mesh 属性，不是 textMesh
          console.log('📐 textMesh:', textMesh)
          
          if (!textMesh) {
            console.warn('⚠️ 文字对象没有 mesh 属性，跳过')
            console.log('   可用属性:', Object.keys(textObject))
            continue
          }
          
          if (!textMesh.geometry) {
            console.warn('⚠️ textMesh 没有 geometry 属性，跳过')
            console.log('   textMesh 可用属性:', Object.keys(textMesh))
            continue
          }
          
          const textGeometry = textMesh.geometry
          const textMatrix = textMesh.matrixWorld
          
          console.log('📐 文字几何体信息:')
          console.log('   - 顶点数:', textGeometry.getAttribute('position')?.count || 0)
          console.log('   - 位置:', textMesh.position.toArray().map(v => v.toFixed(2)).join(', '))
          console.log('   - 旋转:', textMesh.rotation.toArray().slice(0,3).map(v => (v * 180 / Math.PI).toFixed(1)).join('°, ') + '°')
          console.log('   - 缩放:', textMesh.scale.toArray().map(v => v.toFixed(2)).join(', '))
          
          // 遍历所有目标网格
          for (let j = 0; j < targetMeshes.length; j++) {
            const targetMesh = targetMeshes[j]
            console.log(`\n  🎯 与目标网格 ${j + 1} 的相交检查`)
            console.log('     网格名称:', targetMesh.name || '未命名')
            console.log('     网格类型:', targetMesh.type)
            console.log('     网格顶点数:', targetMesh.geometry.getAttribute('position')?.count || 0)
            
            // 执行综合相交检查
            console.log('  🔍 开始综合相交检查...')
            const intersectionResult = booleanOperator.checkIntersectionComprehensive(
              targetMesh.geometry,
              textGeometry,
              textMatrix,
              {
                useBVH: true,
                fastOnly: false
              }
            )
            
            // 输出详细检查结果
            console.log('\n  📊 === 相交检查结果 ===')
            console.log('  🎯 目标网格:', targetMesh.name || `网格${j + 1}`)
            console.log('  📝 文字内容:', textObject.content || '未知')
            
            if (intersectionResult.boundingBoxCheck) {
              console.log('\n  📦 边界盒检查:')
              console.log('     - 相交:', intersectionResult.boundingBoxCheck.intersects ? '✅ 是' : '❌ 否')
              console.log('     - 原因:', intersectionResult.boundingBoxCheck.reason)
              if (intersectionResult.boundingBoxCheck.distance !== undefined) {
                console.log('     - 距离:', intersectionResult.boundingBoxCheck.distance.toFixed(2))
              }
            }
            
            if (intersectionResult.bvhCheck) {
              console.log('\n  🌳 BVH 精确检查:')
              console.log('     - 相交:', intersectionResult.bvhCheck.intersects ? '✅ 是' : '❌ 否')
              console.log('     - 原因:', intersectionResult.bvhCheck.reason)
              console.log('     - 精度:', intersectionResult.bvhCheck.precision || 'standard')
              if (intersectionResult.bvhCheck.fallback) {
                console.log('     - ⚠️ 使用了回退检测')
              }
            }
            
            console.log('\n  🎯 最终结果:')
            console.log('     - 相交状态:', intersectionResult.finalResult ? '✅ 相交' : '❌ 不相交')
            console.log('     - 置信度:', intersectionResult.confidence)
            console.log('     - 检测方法:', intersectionResult.method)
            
            // 根据结果给出建议
            if (intersectionResult.finalResult) {
              console.log('\n  💡 建议: 文字与网格相交，可以执行布尔运算（如雕刻）')
            } else {
              console.log('\n  💡 建议: 文字与网格不相交，可以拖动文字调整位置')
              if (intersectionResult.boundingBoxCheck?.distance) {
                console.log(`     当前距离: ${intersectionResult.boundingBoxCheck.distance.toFixed(2)} 单位`)
              }
            }
            
            console.log('  ' + '─'.repeat(50))
          }
          
          console.log('\n' + '='.repeat(60))
        }
        
        console.log('\n✅ 场景相交检查完成！')
        console.log('💡 提示: 你可以拖动文字对象改变位置，然后再次点击按钮查看相交状态的变化')
        
      } catch (error) {
        console.error('❌ 相交检查失败:', error)
        console.error('错误详情:', error.message)
        if (error.stack) {
          console.error('错误堆栈:', error.stack)
        }
      } finally {
        checkingIntersection.value = false
      }
    }
    
    return { 
      projectName,
      checkingIntersection,
      checkIntersection
    }
  }
}
</script>

<style scoped>
.toolbar {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  height: var(--header-height);
  box-sizing: border-box;
  padding: 0 12px;
  border-bottom: 1px solid #ebeef5;
  background: #fff;
}
.left {
  justify-self: start;
}
.center {
  justify-self: center;
  display: flex;
  gap: 8px;
  align-items: center;
}
.right {
  justify-self: end;
}
</style>
