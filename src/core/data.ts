const projectData = {
  baseModelUrl: '', // 初始模型url
  projectUrl: '', // 项目文件地址url
  projectName: '', //项目名称
  saveProjectApi: '', // 保存项目文件的接口
  saveModelApi: '', // 保存经过编辑后的模型的接口
  modelData: {
    // 模型数据, 字段需要对应catalogConfig的productType
    base: [
      {
        objId: '', // base-0
        productType: '', // 产品类型,
        productName: '', // 产品名称
        title: '',
        imgUrl: '',
        volume: '',
        surface: '',
        boundingBox: '',
        resource: '',
      },
    ],
    // 模型数据, 字段需要对应catalogConfig的productType
    glasses: [],
  },
  catalogConfig: [
    // 根据配置生成目录结构， 包含显示
    {
      groupLabel: '底座', // 一级菜单名称
      visible: true, // 菜单是否显示
      enableSearch: true, // 对应截图：控制是否显示搜索框
      groupLimit: 1, // 当前组最多可以添加多少个模型
      productType: 'base', // 产品分类
      productName: '底座', // 子分类标题
      itemLimit: 1, // 当前子分类模型数量限制
    },
    {
      groupLabel: '眼镜', // 一级菜单名称
      visible: false, // 菜单是否显示
      enableSearch: true, // 控制是否显示搜索框
      groupLimit: 1, // 最多可以添加多少个模型
      productType: 'glasses', // 产品分类
      productName: '眼镜', // 子分类标题
      itemLimit: 1, // 当前子分类模型数量限制
    },
  ],
};
