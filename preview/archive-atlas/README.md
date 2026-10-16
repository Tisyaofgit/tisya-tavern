# 缇斯亚档案馆独立预览

打开 dist/archive-atlas.html。零外部请求，演示数据，不写宿主档案。总览/图鉴/存档/基点，层切换、分类搜索、核心/档案/履历/关联、夜读和示例导出可操作。

UI 待用户审定；正式插件页面尚未挂载。数据服务与真实 book gateway 隔离测试见 tests/archive-system.test.js；权限投影与现有档案查询同源。不要将预览里为作者展示的完整 demo 数据直接发送到读者客户端。

构建：node preview/archive-atlas/build.mjs。需要当前运行环境的 fontTools/Brotli；从正式版 font/reading.part1–4.bin 重建字库并生成子集，不下载字体。模块打包器只接显式 named imports，无动态执行。构建结果包含正式 projection 模块和演示 UI，无外部资源。
