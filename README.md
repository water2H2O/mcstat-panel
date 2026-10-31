# mcstat-panel

把终端里的 `mcstat` 变成 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web UI 里的一块可视化面板：运行状态、CPU、内存、在线玩家、世界大小、备份、内网穿透、卡顿警告，外加最近日志。

Host 端读取系统信息并输出 `GET /mcstat/stats`，Client 端用 React 渲染页面。没有构建步骤，也没有运行时依赖。

## 界面

左侧栏会多出一个「服务器状态」图标（面板 id 为 `mcstat`），点开后是：

- **顶部**：MOTD、运行状态徽标、隧道地址 · Minecraft 版本 · Forge 版本、最近刷新时间与手动刷新按钮
- **8 张卡片**：在线玩家 / CPU（带历史迷你曲线）/ 内存（带占进程比条形）/ 运行时长 / 世界大小 / 备份 / 内网穿透 / 卡顿警告
- **元信息**：版本、Forge、端口、难度、模组数、正版验证、存档名
- **最近日志**：60 行 journal，按级别着色，每 10 秒自动刷新

完全只读：不提供启动 / 停止 / 重启服务器这类会改变状态的按钮。

## 安装

前提：DSH 的 Web profile，Linux + `systemd --user` + `journalctl`。

把仓库放到任意目录，然后让 DSH 里的 agent 执行：

```
plugin_manager install_bundle <仓库绝对路径>
```

安装会把该目录以 `link:` 方式挂进当前 profile，所以之后修改仓库内容、重新加载插件即可生效。装完后如果左侧栏没出现图标，刷新一下页面。

卸载：在 Plugins 页面关掉 `@local/mcstat-panel`，或 `plugin_manager remove_bundle @local/mcstat-panel`。

## 配置

通过环境变量（DSH 进程的环境）调整，均有默认值：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `MCSTAT_UNIT` | `mc.service` | Minecraft 服务的 `systemd --user` 单元名 |
| `MCSTAT_TUNNEL_UNIT` | `natfrp.service` | frpc 隧道单元（SakuraFrp 默认值），留空则不检测隧道 |
| `MCSTAT_SERVER_DIR` | `~/server` | 服务器目录，读取 `world/`、`simplebackups/`、`server.properties`、`mods/` |
| `MCSTAT_TUNNEL_ADDRESS` | 空 | 日志里取不到隧道地址时的兜底显示 |

## 数据从哪来

| 面板项 | 来源 |
| --- | --- |
| 服务状态 / PID / 重启次数 | `systemctl --user show mc.service` |
| 运行时长 | `ps -o etime=` |
| CPU | `/proc/<pid>/stat` 两次采样（两次轮询之间的占用） |
| 内存 | `/proc/<pid>/status` 的 `VmRSS` + `/proc/meminfo` |
| 在线玩家 | `journalctl -u mc` 里的 joined/left 事件（从最近一次 `Done (...)` 之后计算） |
| 世界大小 | `du -sb <SERVER_DIR>/world` |
| 备份 | `<SERVER_DIR>/simplebackups/*.zip` 的数量与总字节 |
| 隧道 | `systemctl --user is-active <TUNNEL_UNIT>` + frpc 日志里打印的地址 |
| 卡顿 | 最近 10 分钟日志里的 `Can't keep up` |
| 版本 / 端口 / 难度 / 模组 | `server.properties`、日志、`mods/*.jar` |
| 日志 | `journalctl -u mc` 的最后 60 行 |

接口返回示例（截断）：

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
  "server": { "motd": "香草纪元 · 食旅纪行", "version": "1.20.1", "forge": "47.3.33", "port": "47060", "difficulty": "easy", "onlineMode": true, "levelName": "world", "maxPlayers": 20 },
  "mods": 398,
  "logs": [{ "time": "08:45:50", "level": "INFO", "source": "minecraft/MinecraftServer", "text": "..." }]
}
```

服务端有 4 秒缓存，多个页面同时打开不会重复采样；前端每 10 秒取一次。

## 已知限制

- 只支持 Linux + `systemd --user`；缺少 `systemctl` / `journalctl` 时页面仍能显示世界、备份等本地文件信息，但服务状态会是「未运行」。
- CPU 是**瞬时**占用（两次轮询之间），而 `mcstat` 用的是 `ps %cpu`（进程生命周期平均值），所以数字通常比 `mcstat` 小。
- 世界大小用 `du -sb` 的实际字节数，会比 `du -sh` 的块占用略小（如 691 MB vs 696M）。
- 隧道地址取 frpc 日志里最后一次打印的地址，和 `mcstat` 的口径一致；如果 frpc 同时跑多个隧道，它可能不是 Minecraft 那条，需要自己确认隧道配置。
- `/mcstat/stats` 是只读 JSON，但没有额外鉴权，暴露面取决于 DSH 的监听地址（默认仅有你的网络可达）。

## 开发

```
mcstat-panel/
├── index.js              # Host 半：采集 + /mcstat/stats 路由
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
node scripts/check.mjs
```

## English

A read-only status panel for a Minecraft server, rendered inside the DeepSeek Harness Web UI: service state, CPU, memory, online players, world size, backups, tunnel, tick warnings, and a live journal tail. A Host half collects the data and serves `GET /mcstat/stats`; a Client half registers a sidebar entry and the matching main panel. No build step, no runtime dependencies, Linux + `systemd --user` only.

## License

[MIT](LICENSE) © 2026 water2H2O
