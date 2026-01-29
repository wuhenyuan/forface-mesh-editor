const config: Record<string, any> = {
  version: '',
  createTime: '',
  // exportModels: [{}],
  outputUrl: '',
  feature: [
    {
      id: 'originModel',
      type: 'model',
      // url: '/src/assets/model/cat.zip',
      url: '/src/assets/model/dag.zip',
      // url: '/src/assets/model/3dDog.zip',
      // url: '/src/assets/model/model/model.obj',
      // url: 'src/assets/model/model.zip',
      // url: '/src/assets/model/shiba.glb',
      position: [0, 0, 0],
      // scale: [10, 10, 10],
      scale: [0.1, 0.1, 0.1],
      rotation: [-Math.PI / 2, 0, 0],
      boolean: 'union',
      // 编辑器业务信息，业务强相关
      meta: {
        type: 'origin',
      },
    },
    // {
    //   type: 'model',
    //   url: '/src/assets/model/model.stl',
    //   position: [0, 0, 0],
    //   scale: [10, 10, 10],
    //   rotation: [0, 0, 0],
    //   boolean: 'union',
    //   // 编辑器业务信息，业务强相关
    //   meta: {
    //     type: 'base',
    //   },
    // },
    {
      id: '文字1',
      type: 'text',
      textType: 'Ailias',
      text: 'tesy 123',
      size: 4,
      depth: 2,
      boolean: 'substract',
      color: '#ff00ff',
      position: [5, 20, 0],
      rotate: [0, Math.PI/ 2, 0],
      scale: [1, 1, 1],
      wrap: 'surface Project',
    },
  ],
};

export default config;
