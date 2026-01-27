/**
 * 组件库打包入口
 * - 默认导出：EditorLayout
 * - 兼容插件方式：ForfaceMeshEditor / install
 */
import EditorLayout from './components/EditorLayout.vue';

export { EditorLayout };

export const install = function (Vue: any) {
  if ((install as any).installed) return;
  (install as any).installed = true;
  Vue.component((EditorLayout as any).name, EditorLayout);
};

export const ForfaceMeshEditor = {
  install,
  EditorLayout,
};

// 自动安装（script 标签引入场景）
if (typeof window !== 'undefined' && (window as any).Vue) {
  install((window as any).Vue);
}

export default EditorLayout;
