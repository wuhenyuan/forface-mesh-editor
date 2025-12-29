export default {
    // 根据图片生成或导入的未经过编辑的模型地址
    originModelPath: '',
    // 底座模型地址
    baseModelPath: '',
    // 经过编辑后导出并上传到后端的地址，可直接最终打印的模型地址,需要手动按钮去上传
    finalModelPath: '',
    // 当前项目的状态, 可编辑的，可打印的
    status: 'editable',  // editable, printable
    // 版本标识 通过拼接属性字符串判定当前已经保存在后端用于打印的模型和当前编辑过后的模型是否需要更新，是否需要重新导出
    /**examples
     * 您有X个修改尚未上传，包括文字位置调整和底座大小更改,是否需要进行更改和更新
     */
    propIdentifier: '',
    // 导出的模型的属性
    finalModelConfig: {
        // 世界坐标
        position: [0, 0, 0],
        // 缩放比例
        scale: [1,1,1],
        // 旋转角度
        rotation: [0, 0, 0],
        // 表面积
        surface: 100,
        // 体积
        volume: 1000,
        // 包围盒
        boundingBox: [10, 10, 10]
    },
    // 底座模型配置，允许没有
    baseModelConfig: {
        position: [0, 0, 0],
        scale: [1,1,1],
        rotation: [0, 0, 0],
        surface: 100,
        volume: 1000,
        //aabb 包围盒
        boundingBox: [10, 10, 10],
        //obb 包围盒, 如果准的话，可以加，不准就不加
        obb:[10,10,10],

    },
    // 装饰配置，暂时没有
    decorations: [{}],
    // 文字配置
    texts: [{
        // id 
        id: '文字1',
        // uuid 标识， 查找管理
        index: 'random uuid',
        // 字体类型
        type: 'Ailias',
        // 文字内容
        text: '我是文字内容',
        // 字体大小
        size: 33,
        // 字体深度
        depth: 3,
        // 文字效果： 浮雕 / 刻字
        effect: 'Embossed', // 浮雕： Embossed， 刻字： Engraved
        // 字体颜色
        color: '#ff00ff',
        // 字体坐标
        position: [0, 0, 0],
        // 字体旋转
        rotate: [0, 0, 0],
        // 文字贴合方式： 法线贴合（纯前端不一定有方案），直接摁下去
        wrap: 'surface Project',
        // 在那个表面上添加文字，通过原始mesh的索引范围作为唯一id标识。。
        attachmentSurface: 'in0in1100'
    }],
    
    lookupTable: {},
    // 破面修补
    faceRepare: '0',
    // 模型优化操作
    modelOptimization: '0',

}