# godlikecheng.github.io

个人小游戏合集站点，托管于 GitHub Pages。所有游戏均为纯原生 HTML5 Canvas + JavaScript 实现，零依赖、零构建，开箱即玩。

## 游戏入口

- 目录页面：<https://godlikecheng.github.io/>

## 游戏列表

| 游戏 | 在线试玩 | 说明文档 |
|------|----------|----------|
| 🎮 坦克大战（Tank Battle） | [立即试玩](https://godlikecheng.github.io/tank-battle/) | [游戏说明](doc/tank-battle.md) |
| 🍄 超级马力欧兄弟（Super Mario Bros） | [立即试玩](https://godlikecheng.github.io/super-mario-bros/) | [游戏说明](doc/super-mario-bros.md) |

更多游戏持续添加中……

## 目录结构

```text
.
├── index.html        # 目录页面：记录各游戏入口
├── doc/              # 各游戏的说明文档
│   ├── tank-battle.md
│   └── super-mario-bros.md
├── tank-battle/      # 游戏：坦克大战
│   ├── index.html
│   ├── css/
│   └── js/
├── super-mario-bros/ # 游戏：超级马力欧兄弟
│   ├── index.html
│   ├── css/
│   └── js/
└── README.md
```

## 本地运行

直接用浏览器打开根目录 `index.html`，或通过任意静态服务器启动（例如 `npx serve`）后访问目录页面进入对应游戏。
