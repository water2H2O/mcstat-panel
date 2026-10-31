# mcstat-panel

把终端里的 `mcstat` 变成 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web UI 里的一块可视化面板：运行状态、CPU、内网穿透、世界与备份、实时日志，并且可以直接启动/停止/重启服务器、修改常用设置。

Host 端读取系统信息并暴露 `/mcstat` 下的 JSON / SSE 接口，Client 端用 React 渲染页面。没有构建步骤，也没有运行时依赖。

## 界面

左侧栏会多出一个「服务器状态」图标（面板 id 为 `mcstat`），点开后是：

- **顶部**：MOTD、运行状态、隧道地址 · Minecraft 版本 · Forge 版本、启动/停止/重启按钮、刷新时间
- **8 张卡片**：在线玩家 / CPU（带历史曲线）/ 内存（带进程占用条）/ 运行时长 / 世界大小 / 备份 / 内网穿透 / 卡顿警告
- **服务器设置**：难度、MOTD、最大玩家数、PVP、白名单、正版验证、视距、模拟距离；保存时服务器在运行会先停服、写配置、再启服（需确认）
- **主机**：发行版、内核、CPU 型号与核心数、1/5/15 分钟负载、服务器目录所在磁盘、主机运行时长
- **实时日志**：SSE 推流，支持暂停/继续、按级别过滤、关键字搜索；可选浏览器通知（玩家上下线、tick 卡顿）

危险操作（停止、重启、保存并重启）都会弹确认框，执行期间按钮禁用并显示进度。

## 安装

前提：DSH 的 Web profile，Linux + `systemd --user` + `journalctl`。

把仓库放到任意目录，然后让 DSH 里的 agent 执行：

```
plugin_manager install_bundle <仓库绝对路径>
```

安装会把该目录以 `link:` 方式挂进当前 profile，所以之后修改仓库内容、重新加载插件即可生效。装完后如果左侧栏没出现图标，刷新一下页面。

卸载：在 Plugins 页面关掉 `@local/mcstat-panel`，或 `plugin_manager remove_bundle @local/mcstat-panel`。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/mcstat/stats` | 一次完整快照（页面轮询，4 秒服务端缓存） |
| `GET` | `/mcstat/logs/stream` | SSE，每行日志一个 `data: {...}` 事件 |
| `POST` | `/mcstat/action` | `{ "action": "start" \| "stop" \| "restart" }` |
| `POST` | `/mcstat/config` | `{ "changes": { "difficulty": "hard", ... } }` |

写接口要求 `content-type: application/json`，并拒绝跨站浏览器的 `Origin`（跨源会先触发预检，从而挡住 CSRF）。它们没有额外的登录校验：能访问到 GUI 端口的人就能调用，部署时请确保该端口只在你信任的网络上（默认是 Tailscale/内网地址）。

`changes` 支持的键与取值范围：`difficulty`（`peaceful` / `easy` / `normal` / `hard`）、`motd`（1–200 字符）、`max-players`（1–1000）、`pvp` / `white-list` / `online-mode`（布尔）、`view-distance` / `simulation-distance`（3–32）。

写配置时，运行中的服务器会先 `systemctl stop`（避免 Minecraft 在退出保存时覆盖文件），写入后再 `start`；服务器本来就没运行则只写文件。

## Agent 工具

插件注册了 `mcstat_server` 工具，动作和页面按钮同源：

- `status`：返回状态摘要（服务、玩家、CPU/内存、世界与备份、隧道、卡顿、当前设置）
- `start` / `stop` / `restart`：控制系统单元
- `set_config`：配合 `difficulty`、`motd`、`maxPlayers`、`pvp`、`whiteList`、`onlineMode`、`viewDistance`、`simulationDistance` 修改设置

在对话里说「把难度改成困难」或「重启一下服务器」即可，不需要点到页面。

## 配置

通过环境变量（DSH 进程的环境）调整，均有默认值：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `MCSTAT_UNIT` | `mc.service` | Minecraft 服务的 `systemd --user` 单元名 |
| `MCSTAT_TUNNEL_UNIT` | `natfrp.service` | frpc 隧道单元（SakuraFrp 默认值），留空则不检测隧道 |
| `MCSTAT_SERVER_DIR` | `~/server` | 服务器目录，读写 `server.properties`，读取 `world/`、`simplebackups/`、`mods/` |
| `MCSTAT_TUNNEL_ADDRESS` | 空 | 日志里取不到隧道地址时的兜底显示 |

## 数据从哪来

| 面板项 | 来源 |
| --- | --- |
| 服务状态 / PID / 重启次数 | `systemctl --user show mc.service` |
| 运行时长 | `ps -o etime=` |
| CPU | `/proc/<pid>/stat` 两次采样（两次轮询之间的占用） |
| 内存 | `/proc/<pid>/status` 的 `VmRSS` + `/proc/meminfo` |
| 在线玩家 | `journalctl -u mc` 里当前运行期的 joined/left 事件（从进程启动时间起、最近一次 `Done (...)` 之后计算） |
| 世界大小 | `du -sb <SERVER_DIR>/world` |
| 备份 | `<SERVER_DIR>/simplebackups/*.zip` 的数量与总字节 |
| 隧道 | `systemctl --user is-active <TUNNEL_UNIT>` + frpc 日志里打印的地址 |
| 卡顿 | 最近 10 分钟日志里的 `Can't keep up` |
| 版本 / 端口 / 难度 / 模组 | `server.properties`、日志、`mods/*.jar` |
| 主机信息 | `/etc/os-release`、`os.release()`、`/proc/cpuinfo`、`os.loadavg()`、`/proc/uptime`、`df -B1` |
| 日志 | `journalctl -u mc`（快照 60 行，SSE 只推新行） |

`/mcstat/stats` 返回示例（截断）：

```json
{
  "ok": true,
  "generatedAt": 1793406040704,
  "unit": { "name": "mc.service", "state": "active", "active": true, "pid": 12329, "restarts": 0 },
  "live": true,
  "uptimeSeconds": 2856,
  "cpu": 12,
  "memory": { "processBytes": 7620000000, "totalBytes": 16473190400, "usedBytes": 11700000000, "availableBytes": 4700000000 },
  "players": { "count": 0, "names": [] },
  "world": { "bytes": 725034936 },
  "backups": { "count": 1, "bytes": 538960501, "latest": "world_2026-10-31_07-57-16.zip" },
  "tunnel": { "active": true, "address": "frp-cup.com:59363" },
  "lag": { "warnings": 0, "windowMinutes": 10 },
  "host": { "os": "Ubuntu 24.04.5 LTS", "kernel": "7.0.0-42-generic", "cpuModel": "13th Gen Intel(R) Core(TM) i5-13500H", "cores": 16, "load": [0.63, 0.86, 0.93], "uptimeSeconds": 42370.75, "disk": { "totalBytes": 110327558144, "usedBytes": 30918721536, "availableBytes": 73757224960, "usedRatio": 0.28 } },
  "server": { "motd": "香草纪元：食旅纪行", "version": "1.20.1", "forge": "47.3.33", "port": "47060", "difficulty": "easy", "onlineMode": true, "whiteList": false, "pvp": true, "maxPlayers": 20, "viewDistance": 6, "simulationDistance": 6, "levelName": "world" },
  "mods": 398,
  "logs": [{ "time": "08:45:50", "level": "INFO", "source": "minecraft/MinecraftServer", "text": "..." }]
}
```

## 已知限制

- 只支持 Linux + `systemd --user`；缺少 `systemctl` / `journalctl` 时页面仍能显示主机、世界、备份等本地信息，但服务状态会是「未运行」。
- CPU 是**瞬时**占用（两次轮询之间），而 `mcstat` 用的是 `ps %cpu`（进程生命周期平均值），所以数字通常比 `mcstat` 小。
- 世界大小用 `du -sb` 的实际字节数，会比 `du -sh` 的块占用略小（如 691 MB vs 696M）。
- 隧道地址取 frpc 日志里最后一次打印的地址，和 `mcstat` 的口径一致；如果 frpc 同时跑多个隧道，它可能不是 Minecraft 那条，需要自己确认隧道配置。
- 修改设置在服务器运行时需要重启，整合包启动约 40 秒；在线玩家会被断开。
- 每个打开页面的浏览器会各起一个 `journalctl -f` 子进程（SSE），关闭页面即回收。
- 在线玩家由日志重建：只统计当前运行期（从进程启动时间起）的 joined/left 事件，服务器重启后自动从空列表开始。

## 开发

```
mcstat-panel/
├── index.js              # Host 半：注册 HTTP 路由与 agent 工具
├── lib/
│   ├── system.js         # 单元名 / 目录等环境、子进程执行
│   ├── collect.js        # 采集快照、server.properties 读写
│   ├── actions.js        # 启动/停止/重启、设置校验与写入
│   ├── routes.js         # /mcstat 下的 JSON 与 SSE 路由
│   └── tool.js           # mcstat_server 工具定义
├── client.js             # Client 半：侧栏图标 + 面板页面（单文件，__ModuleLoader__）
├── package.json          # dsh.bundle / dsh.client 声明
├── cordis.patch.yml      # 插入插件行
├── locale/{en,zh}.json   # Plugins 页面里的标题与描述
├── icon.svg              # 插件图标
├── scripts/check.mjs     # 语法 / JSON / 图标检查
└── .github/workflows/check.yml
```

- 没有构建步骤：`client.js` 必须是一个 `window.__ModuleLoader__.load({ id, factory })` 文件，React 从浏览器模块表里 `require('react')`。
- 改 Host 代码后需要重新加载插件行（Plugins 页面关掉再打开该行，或重启 DSH）；改 Client 代码后刷新页面。
- 本地检查：

```bash
node scripts/check.mjs   # 语法 / JSON / 图标
node --test              # 单元测试（在线玩家重建等）
```

## English

A Minecraft server panel inside the DeepSeek Harness Web UI: live status (service, CPU, memory, players, world, backups, tunnel, tick warnings), host facts, an editable subset of `server.properties`, start/stop/restart, and a streamed journal with optional notifications. A Host half serves `/mcstat` (JSON + SSE) and registers a `mcstat_server` agent tool; a Client half registers the sidebar entry and the page. No build step, no runtime dependencies, Linux + `systemd --user` only.

## License

[MIT](LICENSE) © 2026 water2H2O
