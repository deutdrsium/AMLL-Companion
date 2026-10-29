# 0.8.0：Liquid Glass 界面

0.8.0 收录当前已确认的 Liquid Glass 界面、连续超椭圆圆角和居中的悬浮歌词。按用户要求，后台帧率问题留待后续优化，本版未包含尚未完成的性能实验。

设计参考 Apple [Materials](https://developer.apple.com/design/human-interface-guidelines/materials) 和 [Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/)：把材质集中在操作层，面板内部不用多层玻璃叠加；设置、版本列表使用较深的底色保证可读性，媒体背景上的悬浮条使用更通透的底色。

技术方向参考调研中的 [liquid-glass-react](https://github.com/rdev/liquid-glass-react)、[Liquid Glass Studio](https://github.com/iyinchao/liquid-glass-studio) 的位移贴图与轮廓处理。本轮独立实现边缘法线位移，没有引入它们的运行时、源码或演示素材。`src/LiquidGlass.tsx` 只在尺寸变化时生成贴图，由 Chromium 的 SVG backdrop filter 处理实时背景；光点位置直接更新 CSS 变量，不触发 React 逐帧渲染。前景歌词仍由 AMLL 独立渲染。

已覆盖：主界面工具栏、播放控制、设置和歌词版本面板，以及悬浮歌词条。关闭悬浮背景时不会保留玻璃层。减少动态效果会关闭光点跟随；减少透明度和强制颜色有对应 CSS 处理。

验证：95 项单测、自动/手动歌词选择、元数据设置、9 个尺寸/缩放布局场景、真实 WebView2 中的菜单与悬浮窗交互、透明像素和折射开关截图对照。运行 `node tests/pill-native.mjs` 与 `powershell -NoProfile -ExecutionPolicy Bypass -File tests/pill-visual.ps1` 可复现预览截图和短时帧采样，产物位于 `test-results/glass/`。

限制：当前折射的是应用内背景，不包含桌面捕获；菜单弹出层、阴影和高光是 Windows/WebView2 上的近似实现，并非 Apple 原生材质。短时 RAF 采样不能代表 WPF 合成后的实际屏幕帧率或长时间 GPU 占用。
