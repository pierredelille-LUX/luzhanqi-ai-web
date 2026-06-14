# 中国陆战棋 AI 对战

这是一个纯静态 Web 版中国陆战棋应用，支持：

- 人类执红对战中级电脑棋手
- 本地双人对弈
- 固定布阵和随机布阵
- 传统暗棋规则：只显示己方棋子，对手排兵布阵隐藏
- 铁路、行营、军旗、地雷、炸弹、工兵排雷等核心规则
- Google ID 登录入口和按账号区分的本机棋局存档
- 浏览器直接运行，无自建后端服务依赖

## 本地运行

在项目目录启动任意静态服务器：

```sh
python3 -m http.server 8000
```

然后打开：

```text
http://127.0.0.1:8000/
```

## 规则取舍

本项目采用传统暗棋/军棋裁判规则。玩家只能看到己方棋子，对手棋子始终显示为暗子；战斗由程序自动判定，军衔大吃小、同级同归、炸弹同归、工兵排雷。行营内棋子不能被攻击；铁路上普通棋子可直线远行，工兵可沿铁路转弯；军旗被夺或一方无可行动棋子时结束。

人机模式下，电脑 AI 不直接按人类棋子军衔决策，而是按对方占位、是否移动过、位置压力和己方棋力做暗棋启发式判断。

## Google 登录与存档

项目已接入 Google Identity Services 前端登录入口。要启用真实 Google 登录，需要在 `config.js` 中填入你的 Web OAuth Client ID：

```js
window.LUZHANQI_GOOGLE_CLIENT_ID = "你的 Google OAuth Client ID";
```

OAuth 客户端需把 GitHub Pages 域名加入 Authorized JavaScript origins：

```text
https://pierredelille-lux.github.io
```

当前版本是纯静态 GitHub Pages 应用，棋局保存到浏览器 `localStorage`，并按 Google 用户 ID 或访客身份分槽保存。它适合在同一浏览器继续对局；若需要跨设备云端同步，需要再接入 Firebase/Firestore 或自建后端。

## 部署

应用已部署到 GitHub Pages，发布源为 `main` 分支根目录。

公网访问链接：

```text
https://pierredelille-lux.github.io/luzhanqi-ai-web/
```
