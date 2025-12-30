/**
 * 组件库打包导出入口
 * 单一入口设计 - 只暴露 EditorLayout
 */
import EditorLayout from './components/EditorLayout.vue'

// install 方法
const install = function(Vue, options = {}) {
  if (install.installed) return
  install.installed = true

  Vue.component(EditorLayout.name, EditorLayout)
}

// 自动安装（浏览器环境且存在 Vue）
if (typeof window !== 'undefined' && window.Vue) {
  install(window.Vue)
}

// 默认导出
export default {
  install,
  EditorLayout
}

// 具名导出
export { EditorLayout }
