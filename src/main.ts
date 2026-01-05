/**
 * 组件库打包导出入口
 * 单一入口设计 - 只暴露 EditorLayout
 */
import EditorLayout from './components/EditorLayout.vue'

// install 方法
const install = function (Vue: any, _options: Record<string, any> = {}) {
  if ((install as any).installed) return
  ;(install as any).installed = true

  Vue.component((EditorLayout as any).name, EditorLayout)
}

// 自动安装（浏览器环境且存在 Vue）
if (typeof window !== 'undefined' && (window as any).Vue) {
  install((window as any).Vue)
}

// 默认导出
export default {
  install,
  EditorLayout
}

// 具名导出
export { EditorLayout }
