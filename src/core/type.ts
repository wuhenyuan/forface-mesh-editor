type ProductType = 'base' | 'glass' | 'earrings';
type EditorConfig = {
  baseModelUrl: string; // 初始模型url
  projectUrl: string; // 项目文件地址url
  projectName: string; //项目名称

  catalogConfig: {
    // 根据配置生成目录结构， 包含显示
    label: string; // 菜单名称
    icon?: string; // 菜单图标,内部预设图标,没有就使用内部默认的，或svg 或 base 64 图片格式
    visible: true; // 菜单是否显示
    enableSearch: true; // 控制是否显示搜索框
    itemLimits: number; // 此分类最多可以添加多少个模型
    productType: ProductType; // 产品类别
    productName: string; // 产品类别名字，比如底座，需要和ProductType 一一对已经
    pageSize?: number; // 每页有多少条数据
    totalItems?: number; // 此类型总共有多少数据，不传就认为初始化时候已经传递所有数据
  }[];
};

// 导出模型回调事件
type exportModelSuccess = (data: {
  file: Blob; // 对应格式文件的Blob
  objFormat: 'stl' | 'obj';
  fileFormat: 'stl';
  zip;
}) => void;

// 导出项目文件回调事件
type exportProjectSuccess = (data: { file: Blob; fileFormat: 'zip' }) => void;

// 修改项目名字成功回调
type projectNameSuccess = (result: { name: string; oldName: string }) => void;

type requestData = { productType: ''; page: 0 };

c;

//
type ModelData = {
  [key in keyof ProductType]: ModelInfo[];
};
