# dsh-user-history-rail

为 **DeepSeek Harness (DSH) Web GUI** 提供 ChatGPT 风格"右侧历史输入导航"的持久化插件：对话区右边缘常驻一列栅栏刻度，每条刻度对应你发过的一条历史输入，悬停预览、点击跳转。

纯客户端实现（快照驱动、零 RPC），作为随 DSH 启动自动加载的宿主插件安装。

## 功能特性

- **常驻栅栏刻度**：右边缘一列细栅栏，有几个历史输入就有几根，不占用布局空间
- **悬停预览**：刻度变长变黑，左侧弹出卡片显示**时间 + 部分输入 + 部分可见回答**（过滤 think / reasoning 推理内容）
- **点击跳转**：平滑滚动到对话流中该消息的位置；目标未渲染时自动**加载更早历史**后重试（最多 5 页），仍无则落到最近一条已渲染消息
- **会话感知**：随当前会话自动切换；新消息到达自动刷新刻度列表
- **顺滑交互**：命中区大于可见栅栏（移到加长末端仍保持选中）、按指针纵向位置实时切换、间隙不跳变
- **随启动自动加载**：无需手动创建/批准，重启 DSH 即生效

## 工作原理

- **挂载点**：`conversation.session.header.utilities`（会话作用域槽，自带 `useSession`/`sessionId`），`position: fixed` 浮动于右边缘；会话切换自动重挂载
- **数据**：从 `useSession` 的聊天快照提取——遍历 `chat.order`，取 `user`/`steering` 节点的文本（仅 `type:'text'` 块）与时间，回答取其后最近 `assistant-step` 的可见文本
- **跳转**：`document.querySelector('[data-chat-anchor-key="<nodeKey>"]')`（产品自身的节点定位钩子）→ `scrollIntoView`；未渲染目标经 `sessions.binding(id).session.loadOlder()` 渐进加载
- **交付**：浏览器半区是手写预构建 bundle（`window.__ModuleLoader__.load({id, factory})` 格式），由 `dsh-client-modules` 扫描包的 `dsh.client` 声明后经 `/plugins/<id>/client.js` 送达

## 安装

前置：DSH Web 部署（本插件面向该 GUI 的宿主配置文件体系）。

1. 将 `pkg/` 目录复制为
   `$DSH_HOME/profiles/web/node_modules/dsh-user-history-rail/`
   （loader 以 profile 目录为模块解析基准，包必须装在 profile 的 node_modules，而非 npx 缓存）
2. 在 `$DSH_HOME/profiles/web/cordis.patch.yml` 追加：
   ```yaml
   - insert:
       - id: user-history-rail
         name: dsh-user-history-rail
   ```
3. **重启 DSH**（见下方"重启注意"），刷新浏览器页面。

验证：打开页面源码应能看到 `window.__DSH_BOOT__` 包含 `dsh-user-history-rail`，且
`GET /plugins/dsh-user-history-rail/client.js` 返回 200。

## 使用

- 鼠标移到右边缘栅栏列 → 悬停某根刻度 → 变长变黑 + 左侧预览（时间 / 输入 / 回答）
- 点击刻度 → 对话流滚动到对应消息；旧消息会先自动加载历史再跳转
- 打开浏览器控制台可看到 `[uhm]` 前缀的诊断日志（跳转失败原因等）

## 开发与修改

- 源码即产物：`pkg/lib/client.js` 是手写 bundle（无 tsdown 等构建链），修改后同步改写该文件
- 修改后重新复制到 profile node_modules 并重启 DSH 生效
- 交互/跳转/数据逻辑见 `pkg/lib/client.js` 内注释与 README 工作原理

## 重启注意

- 沙箱内杀不掉 dsh 进程（`Get-NetTCPConnection` 看不到监听者、`Stop-Process` 被拒），
  需以**提权方式**运行 `scripts/restart-dsh.ps1`：杀 3080 持有者 → 等端口释放 →
  `node <runtime>/bin.js web` 重新拉起 → 等端口恢复
- 后台任务/脱离进程会被清理或受限，不能用于重启
- 脚本内的 node / DSH_HOME / runtime 路径为部署机特定值，迁移时按实际修改

## 项目结构

```
pkg/
  package.json          # 包清单：dsh.client { platform: "web" }、exports["./client"]
  lib/index.js          # Host 半区（空 apply，让 loader 行存在供 client-modules 扫描）
  lib/client.js         # 浏览器 bundle（预构建，手写 __ModuleLoader__.load 格式）
scripts/
  restart-dsh.ps1       # 部署机重启助手（提权运行）
README.md
LICENSE
```

## 已知限制

- 刻度列表仅覆盖**当前已加载窗口**内的消息；更早历史需在会话里手动加载后才会出现刻度
- 点击窗口外消息靠渐进加载（最多 5 页），极端长会话可能到不了最早的消息
- 预览只取可见文本（过滤 reasoning），不展示图片/工具调用详情
- 面向 DSH Web GUI 的特定槽位/钩子（`conversation.session.header.utilities`、`data-chat-anchor-key`），
  依赖产品内部结构，升级 DSH 版本后可能需要适配

## 变更日志

| 版本 | 说明 |
| --- | --- |
| v1.0.0 | 首个持久化版本：纯 Client、快照驱动、按键查询跳转 + loadOlder 渐进加载、随启动自动加载 |

早期动态插件迭代（`uhm-*`）的完整演进历史见 git 历史。

## 许可证

[MIT](LICENSE)
