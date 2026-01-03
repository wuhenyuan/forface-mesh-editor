const config = {
  version: '',
  createTime: '',
  models: [{
    type: 'model',
    url: './model/1.obj',
    position: [0,0,0],
    scale: [0,0,0],
    rotation: [0,0,0],
  },
  {
    type: 'model',
    url: './model/2.stl',
    position: [0,0,0],
    scale: [0,0,0],
    rotation: [0,0,0],
  }
  ],
  texts: [
    {
      id: '文字1',
      type: 'Ailias',
      text: '我是文字内容',
      size: 33,
      depth: 3,
      effect: 'Embossed',
      color: '#ff00ff',
      position: [0, 0, 0],
      rotate: [0, 0, 0],
      wrap: 'surface Project',
      attachmentSurface: 'in0in1100'
    }
  ]
}