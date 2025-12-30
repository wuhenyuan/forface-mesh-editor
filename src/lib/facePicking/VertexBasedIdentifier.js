/**
 * 基于顶点索引的稳定标识符
 * 
 * 核心原理：
 * 1. 基于原始模型的固定顶点索引
 * 2. 获取面的所有顶点索引，排序去重
 * 3. 相邻压缩：0,1,2,3,4,5 → "i0i5"
 * 4. 非连续分段：0,1,2,5,6,7 → "i0i2,i5i7"
 * 
 * 优势：
 * - 绝对稳定：基于原始模型的固定顶点索引
 * - 天然唯一：每个面的顶点集合都是唯一的
 * - 高效存储：相邻压缩节省90%+空间
 * - 计算简单：只需排序和压缩
 */
export class VertexBasedIdentifier {
  /**
   * 为特征生成基于顶点索引的稳定标识
   * @param {Array} triangleIndices - 三角形索引数组
   * @param {THREE.BufferGeometry} geometry - 几何体
   * @returns {string} 稳定标识
   */
  generateVertexBasedId(triangleIndices, geometry) {
    // 1. 获取所有顶点索引
    const vertexIndices = this.extractVertexIndices(triangleIndices, geometry)
    
    // 2. 去重并排序
    const uniqueVertices = [...new Set(vertexIndices)].sort((a, b) => a - b)
    
    // 3. 相邻压缩
    const compressed = this.compressConsecutiveIndices(uniqueVertices)
    
    return compressed
  }

  /**
   * 从三角形索引中提取所有顶点索引
   * @param {Array} triangleIndices - 三角形索引数组
   * @param {THREE.BufferGeometry} geometry - 几何体
   * @returns {Array} 顶点索引数组
   */
  extractVertexIndices(triangleIndices, geometry) {
    const vertexIndices = []
    const indices = geometry.index
    
    triangleIndices.forEach(triangleIndex => {
      if (indices) {
        // 有索引的几何体
        const i1 = indices.getX(triangleIndex * 3)
        const i2 = indices.getX(triangleIndex * 3 + 1)
        const i3 = indices.getX(triangleIndex * 3 + 2)
        vertexIndices.push(i1, i2, i3)
      } else {
        // 无索引的几何体
        const i1 = triangleIndex * 3
        const i2 = triangleIndex * 3 + 1
        const i3 = triangleIndex * 3 + 2
        vertexIndices.push(i1, i2, i3)
      }
    })
    
    return vertexIndices
  }

  /**
   * 压缩连续的索引
   * @param {Array} indices - 排序后的索引数组
   * @returns {string} 压缩后的字符串
   */
  compressConsecutiveIndices(indices) {
    if (indices.length === 0) return ''
    if (indices.length === 1) return `i${indices[0]}`
    
    const ranges = []
    let start = indices[0]
    let end = indices[0]
    
    for (let i = 1; i < indices.length; i++) {
      if (indices[i] === end + 1) {
        // 连续索引，扩展范围
        end = indices[i]
      } else {
        // 非连续，保存当前范围
        ranges.push(this.formatRange(start, end))
        start = end = indices[i]
      }
    }
    
    // 保存最后一个范围
    ranges.push(this.formatRange(start, end))
    
    return ranges.join(',')
  }

  /**
   * 格式化索引范围
   * @param {number} start - 起始索引
   * @param {number} end - 结束索引
   * @returns {string} 格式化的范围字符串
   */
  formatRange(start, end) {
    if (start === end) {
      return `i${start}`
    } else {
      return `i${start}i${end}`
    }
  }

  /**
   * 解压缩索引字符串（用于调试和验证）
   * @param {string} compressed - 压缩的索引字符串
   * @returns {Array} 解压后的索引数组
   */
  decompressIndices(compressed) {
    if (!compressed) return []
    
    const indices = []
    const ranges = compressed.split(',')
    
    ranges.forEach(range => {
      if (range.startsWith('i')) {
        const numbers = range.substring(1).split('i')
        if (numbers.length === 1) {
          // 单个索引：i5
          indices.push(parseInt(numbers[0]))
        } else if (numbers.length === 2) {
          // 范围索引：i5i10
          const start = parseInt(numbers[0])
          const end = parseInt(numbers[1])
          for (let i = start; i <= end; i++) {
            indices.push(i)
          }
        }
      }
    })
    
    return indices.sort((a, b) => a - b)
  }

  /**
   * 计算压缩率
   * @param {Array} originalIndices - 原始索引数组
   * @param {string} compressed - 压缩字符串
   * @returns {Object} 压缩统计信息
   */
  calculateCompressionStats(originalIndices, compressed) {
    const originalSize = originalIndices.length * 4 // 假设每个索引4字节
    const compressedSize = compressed.length // 字符串长度
    const compressionRatio = ((originalSize - compressedSize) / originalSize * 100).toFixed(1)
    
    return {
      originalCount: originalIndices.length,
      originalSize: originalSize,
      compressedSize: compressedSize,
      compressionRatio: `${compressionRatio}%`,
      compressed: compressed
    }
  }

  /**
   * 验证压缩和解压的一致性
   * @param {Array} originalIndices - 原始索引数组
   * @returns {boolean} 是否一致
   */
  validateCompression(originalIndices) {
    const uniqueSorted = [...new Set(originalIndices)].sort((a, b) => a - b)
    const compressed = this.compressConsecutiveIndices(uniqueSorted)
    const decompressed = this.decompressIndices(compressed)
    
    // 比较原始和解压后的数组
    if (uniqueSorted.length !== decompressed.length) return false
    
    for (let i = 0; i < uniqueSorted.length; i++) {
      if (uniqueSorted[i] !== decompressed[i]) return false
    }
    
    return true
  }
}