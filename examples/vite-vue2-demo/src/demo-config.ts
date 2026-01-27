const config: Record<string, any> = {
  feature: [
    {
      id: 'originModel',
      type: 'model',
      url: '/model.stl',
      position: [0, 0, 0],
      scale: [1, 1, 1],
      rotation: [0, 0, 0],
      boolean: 'union',
      meta: {
        type: 'origin',
      },
    },
  ],
};

export default config;

