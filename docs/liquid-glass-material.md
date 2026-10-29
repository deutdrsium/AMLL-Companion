# Liquid Glass 材质修订（0.8.0 之后）

本次按用户指定的两个项目修改实际光学实现，不再只调整玻璃的底色。版本号仍为 0.8.0，尚未重新发布版本包。

## 来源与适配

- [shayann07/liquidglass](https://github.com/shayann07/liquidglass/tree/0cbd5e24058d2fb3fffe45b72cd07915d4dcea6f)：将 `ports/skia/shaders/material.sksl` 中的超椭圆法线、Snell 折射轮廓和方向性边缘光照移植到 `shared/glass-optics.mjs`，生成 SVG 所需的位移和高光贴图。保留 Apache-2.0 许可及完整上游 NOTICE。未引入完整 Skia/CanvasKit 渲染器、手势系统或样例素材。
- [rdev/liquid-glass-react](https://github.com/rdev/liquid-glass-react/tree/ac48eab18d1f7f444ae30002d240cae29c863a21)：适配 `GlassFilter` 的 RGB 分通道折射及合成方法，只用于小型工具栏和播放控件，最大通道分离约 0.6 CSS px。保留 MIT 许可。大面积面板和悬浮条使用单次折射，避免多通道全屏中间纹理的开销。
- [Apple Materials](https://developer.apple.com/design/human-interface-guidelines/materials)：材质用于操作层，较大设置面板保持可读性，媒体上的悬浮条更清透。菜单项目不继续叠加玻璃。

## 与上一版的差别

旧版用普通圆角的距离场匹配超椭圆外形，角部折射和可见边缘不一致。新版按 CSS `superellipse(1.5)` 对应的指数生成轮廓；不支持该 CSS 时才使用圆角。Snell 折射沿边缘平滑衰减，中央不会发生拉伸。

模糊放在折射之前，保留折射之后的边缘细节。悬浮条仅使用 0.6 px 的散射，设置面板使用 14 px；减少固定深色底和均匀描边，改用主光、较弱反向光、薄暗边和 Fresnel 增亮。高光与折射来自相同几何轮廓，歌词不参与滤镜。

SVG 滤镜和位移图使用明确的局部像素尺寸，修复初次适配时百分比坐标造成的右侧/底部错位。贴图仅在布局变化时生成，不逐帧读取背景，不新增动画循环。Chromium 直接处理实时背景。

## 验证与边界

`npm test` 覆盖光学有限值、对称性、向内采样、中央不变形、超椭圆角部和定向高光；`node tests/pill-native.mjs` 检查真实 WebView2 的菜单、背景开关、AMLL 动效、显式滤镜坐标、减少透明度与强制颜色。`tests/pill-visual.ps1` 检查透明像素、软阴影和有/无折射截图差异。截图在 `test-results/glass/`，旧版截图保留于 `test-results/glass-before/`。

完整多通道大面积滤镜的试验曾只有约 68 FPS，已弃用。简化后同机悬浮条短时 RAF 采样为 143.5–144 FPS、P95 约 7.1 ms。98 项单测、原生交互检查及透明/阴影/折射像素检查通过。此数据仅代表浏览器动画回调，不等于 WPF 最终屏幕呈现率，未解决此前单独提出的前后台呈现差异。

这是 Windows/WebView2 的光学近似，不是 Apple 私有材质。没有 Apple 实机逐帧同场景对照，不能宣称像素级一致；也未移植上游完整的背景自适应调色或触摸形变。悬浮条折射应用内流动背景，不捕获桌面；本身经过弥散的背景细节较少，折射会比棋盘/条纹测试图上更克制。
