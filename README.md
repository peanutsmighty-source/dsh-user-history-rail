# User History Rail — 源码留档

ChatGPT 风格"右侧历史输入栅栏"功能的持久化源码留档。
**已升级为随 DSH 启动自动加载的持久化宿主插件**（见下方"持久化安装"）；
本目录保留完整源码，供重装/迁移使用。

## 功能

在 DSH Web GUI 对话区右边缘显示一列**常驻栅栏刻度**，每个刻度对应会话中你发过的一条历史输入：

- **悬停**：该刻度变长、颜色变黑，左侧弹出预览卡片（时间 + 部分输入 + 部分可见回答）
- **点击**：对话流平滑滚动到那条消息的位置，锚点来自 `conversation.chat.turnTail`
- 会话切换 / 新消息自动刷新（快照驱动，无延迟）
- 不显示 think / reasoning 推理内容，只显示可见输出

## 架构（持久化版 = 纯 Client）

与早期动态插件版的关键差异：

| 项 | 动态版（已弃） | 持久化版（当前） |
| --- | --- | --- |
| Host 半区 | `harness.handle` RPC 读会话日志 | **无**（harness/host 是动态插件专用注入，普通包不可用） |
| 数据来源 | `sessionQuery.readSurface`（全量日志） | **`useSession` 快照**（`chat.order` + `chat.nodes`），仅当前已加载窗口 |
| 挂载点 | `shell.overlay`（root 作用域） | `conversation.session.header.utilities`（session 作用域，自带 `useSession`） |
| 会话切换 | 缓存 + updatedAt 判断 | 会话作用域自动重挂载，状态天然清零 |
| 回答提取 | 日志 assistant/message 事件 | 快照中后续 `assistant-step` 节点的 `blocks`（仅 `kind==='text'`） |

已知限制：持久化版只列出**当前已加载窗口**内的消息；分页加载更早历史后列表自动补全。

## 文件

| 路径 | 说明 |
| --- | --- |
| `pkg/package.json` | 包清单：`dsh.client: { platform: "web" }`、`exports["./client"]` |
| `pkg/lib/index.js` | Host 半区（空 apply，仅为让 loader 行存在，供 client-modules 扫描） |
| `pkg/lib/client.js` | 预构建 browser bundle（手写 `window.__ModuleLoader__.load` 格式） |
| `README.md` | 本说明 |

## 持久化安装（已完成）

1. 包已装入 **profile 的 node_modules**（loader 从这里解析包名）：
   `C:\Users\WHO\.dsh\profiles\web\node_modules\dsh-user-history-rail\`
2. `~/.dsh/profiles/web/cordis.patch.yml` 已追加行：
   ```yaml
   - insert:
       - id: user-history-rail
         name: dsh-user-history-rail
   ```
3. 重启 DSH 后自动加载；浏览器 bundle 由 `dsh-client-modules` 经
   `/plugins/dsh-user-history-rail/client.js` 送达。

**重新安装/迁移步骤**（换机或清理后）：
1. 把 `pkg/` 复制到 `C:\Users\WHO\.dsh\profiles\web\node_modules\dsh-user-history-rail\`
2. 确认 `cordis.patch.yml` 里有上面那两行
3. 重启 DSH（见下方"重启方法"）

## 重启方法（重要）

沙箱内杀不掉 dsh 进程（`Get-NetTCPConnection` 看不到监听者、`Stop-Process` 被拒），
必须用**提权命令**（danger-full-access）执行 `_restart_dsh_persist.ps1`：
它杀 3080 持有者 → 等端口释放 → `node ...\bin.js web` 重新拉起 → 等端口恢复。
后台任务/脱离进程都会被清理或受限，不能用来重启。

## 注意事项

- **包必须装在 profile 的 node_modules**，不是 npx 缓存——loader 以 profile 为 baseUrl 解析包名。
- client bundle 为手写预构建格式，改动源码后需同步改写 `pkg/lib/client.js` 并重新复制安装 + 重启。
- 跳转：点击时按键查询 `data-chat-anchor-key`；未渲染的旧消息自动 `loadOlder` 加载更早历史后重试
  （最多 5 页），仍无则落到最近一条；控制台有 `[uhm]` 诊断日志。

## 实现要点

- **数据**：`useSession` 快照 → `chat.order` 顺序遍历；`user`/`steering` 节点取 `data.content`
  （仅 `type==='text'` 块）与 `data.time`；回答取该节点之后最近的 `assistant-step` 的 `data.blocks`
  （仅 `kind==='text'` 块，过滤 reasoning）
- **挂载**：`conversation.session.header.utilities`（会话作用域，自带 `useSession`/`sessionId`），
  `position: fixed` 浮动于右边缘；会话切换自动重挂载
- **跳转**：点击时 `document.querySelector('[data-chat-anchor-key="<nodeKey>"]')`（产品自身的滚动定位钩子）
  → `scrollIntoView`；未渲染的旧消息经 `sessions.binding(id).session.loadOlder()` 渐进加载更早历史后重试
  （最多 5 页）；仍无则落到最近一条已渲染消息
- **交互**：刻度命中区（26×10）大于可见栅栏（12px → 悬停 24px），鼠标移到加长末端仍保持选中；
  `onMouseMove` 按指针纵向位置实时选中最接近的刻度，列间滑动切换顺滑

## 演进历史

| 版本 | 变更 |
| --- | --- |
| 动态插件初版 `uhm-5/pkg-5` | 悬浮卡片式；`useSession()` 无参调用崩溃 |
| `uhm-5/pkg-7` | 修复 `useSession` 崩溃（传 selector） |
| `uhm-2/pkg-2` | DSH 重启后重建（改 id）；增加"≡"触发按钮 |
| `uhm-2/pkg-3` | 栅栏式 UI；`readSurface` + 缓存 + 预取消除加载延迟；回答配对 |
| `uhm-2/pkg-4` | 去包围卡片只留栅栏条；收起态更明显；过滤 reasoning 只显示可见输出 |
| `uhm-2/pkg-5` | 刻度常驻显示（不再缩成一根条） |
| `uhm-2/pkg-6` | 刻度更细(2px)、间距更大(10px)、灰色更淡 |
| `uhm-2/pkg-7` | 放大命中区（26×10），移到加长边缘仍保持选中 |
| `uhm-2/pkg-8` | 整体左移、灰色加深、未选中长度缩短 |
| `uhm-2/pkg-9` | 左移到 right:20px；`onMouseMove` 按纵向位置选中，滑动切换顺滑 |
| **持久化版 v1.0.0** | 纯 Client 包 `dsh-user-history-rail`（快照驱动、无 host RPC、随启动自动加载） |
