// SPDX-License-Identifier: MIT
/**
 * Client half of the mcstat panel.
 *
 * Registers one entry in the sidebar panel list and renders the matching main
 * page: a live dashboard of the Minecraft server `mcstat` describes in the
 * terminal, with server control, editable settings, a streamed journal, and
 * optional browser notifications. Data comes from the Host half under `/mcstat`.
 */
window.__ModuleLoader__.load({
  id: '@local/mcstat-panel',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'mcstat';
    const PANEL_ID = 'mcstat';
    const STATS_PATH = '/mcstat/stats';
    const ACTION_PATH = '/mcstat/action';
    const CONFIG_PATH = '/mcstat/config';
    const STREAM_PATH = '/mcstat/logs/stream';
    const AI_PATH = '/mcstat/ai';
    const REFRESH_MS = 10000;
    const HISTORY_LIMIT = 60;
    const MAX_LOGS = 400;
    const LOG_ROWS = 200;
    const NOTIFY_KEY = 'mcstat.notify';

    const DIFFICULTIES = ['peaceful', 'easy', 'normal', 'hard'];
    const LEVELS = ['all', 'INFO', 'WARN', 'ERROR'];

    const ZH = {
      'panel.label': '服务器状态',
      'status.running': '运行中',
      'status.stopped': '未运行',
      'updated': '更新于 {time}',
      'loading': '正在读取服务器状态…',
      'error.title': '无法读取服务器状态',
      'error.retry': '重试',
      'error.stale': '刷新失败：{message}',
      'error.action': '操作失败：{message}',
      'players.title': '在线玩家',
      'players.value': '{count} 人',
      'players.none': '暂无玩家在线',
      'players.max': '上限 {max} 人',
      'cpu.title': 'CPU',
      'cpu.sub': '瞬时占用',
      'mem.title': '内存',
      'mem.sub': '系统 {used} / {total} GB · 剩余 {available} GB',
      'uptime.title': '运行时长',
      'uptime.sub': 'PID {pid} · 重启 {count} 次',
      'world.title': '世界大小',
      'world.sub': '存档 {name}',
      'backups.title': '备份',
      'backups.value': '{count} 个',
      'backups.sub': '{size} · 最近 {name}',
      'backups.empty': '暂无备份',
      'tunnel.title': '内网穿透',
      'tunnel.on': '已连接',
      'tunnel.off': '未运行',
      'tunnel.sub': '{address}',
      'lag.title': '卡顿警告',
      'lag.value': '{count} 次',
      'lag.sub': '最近 {minutes} 分钟 tick 落后',
      'action.start': '启动',
      'action.stop': '停止',
      'action.restart': '重启',
      'action.refresh': '刷新',
      'action.save': '保存',
      'action.saveRestart': '保存并重启',
      'action.starting': '启动中…',
      'action.stopping': '停止中…',
      'action.restarting': '重启中…',
      'action.saving': '保存中…',
      'done.start': '已发送启动请求，服务器正在启动',
      'done.stop': '服务器已停止',
      'done.restart': '服务器已重启',
      'done.config': '设置已保存，下次启动生效',
      'done.configRestart': '设置已保存，服务器已重启',
      'confirm.cancel': '取消',
      'confirm.stopTitle': '停止服务器？',
      'confirm.stopBody': '在线玩家会被断开，世界会先保存再关闭。',
      'confirm.restartTitle': '重启服务器？',
      'confirm.restartBody': '在线玩家会被断开，重启大约需要 1 分钟。',
      'confirm.saveTitle': '保存设置？',
      'confirm.saveLive': '保存需要停止并重新启动服务器，在线玩家会被断开，大约 1 分钟。',
      'confirm.saveStopped': '服务器当前未运行，设置会写入配置文件，下次启动生效。',
      'config.title': '服务器设置',
      'config.noteLive': '保存会重启服务器',
      'config.noteStopped': '下次启动生效',
      'config.difficulty': '难度',
      'config.motd': '服务器标语',
      'config.maxPlayers': '最大玩家数',
      'config.pvp': '允许 PVP',
      'config.whiteList': '白名单',
      'config.onlineMode': '正版验证',
      'config.viewDistance': '视距（区块）',
      'config.simulationDistance': '模拟距离（区块）',
      'config.reset': '还原',
      'config.errorMotd': '服务器标语不能为空，且最多 200 个字符',
      'config.errorRange': '数值需在 {min} 到 {max} 之间',
      'host.title': '主机',
      'host.os': '系统',
      'host.kernel': '内核',
      'host.cpu': '处理器',
      'host.load': '负载（1/5/15 分钟）',
      'host.disk': '磁盘（服务器目录）',
      'host.uptime': '主机运行',
      'logs.title': '最近日志',
      'logs.empty': '暂无日志',
      'logs.live': '实时',
      'logs.offline': '重连中',
      'logs.level': '日志级别',
      'logs.levelAll': '全部',
      'logs.search': '搜索日志',
      'logs.pause': '暂停',
      'logs.resume': '继续',
      'logs.notifyOn': '通知：开',
      'logs.notifyOff': '通知：关',
      'notify.join': '{name} 加入了游戏',
      'notify.leave': '{name} 离开了游戏',
      'notify.lag': '服务器出现 tick 卡顿',
      'notify.denied': '浏览器未授予通知权限',
      'notify.unsupported': '当前浏览器不支持通知',
      'stopped.title': '服务器未运行',
      'stopped.hint': '在终端执行下面的命令启动服务器',
      'meta.version': '版本',
      'meta.forge': 'Forge',
      'meta.port': '端口',
      'meta.difficulty': '难度',
      'meta.mods': '模组',
      'meta.onlineMode': '正版验证',
      'meta.level': '存档',
      'meta.on': '开启',
      'meta.off': '关闭',
      'difficulty.peaceful': '和平',
      'difficulty.easy': '简单',
      'difficulty.normal': '普通',
      'difficulty.hard': '困难',
      'ai.title': 'DS 辅助管理',
      'ai.description': '开启后由 DeepSeek 每 {minutes} 分钟检查一次服务器状态与日志，并把发现的问题列在下面；只发送状态摘要和最近告警，不会上传完整日志。',
      'ai.enabled': '已开启',
      'ai.disabled': '已关闭',
      'ai.analyze': '立即分析',
      'ai.analyzing': '分析中…',
      'ai.none': '还没有分析结果',
      'ai.lastRun': '上次分析 {time} · {model}',
      'ai.error': '分析失败：{message}',
      'ai.level.ok': '正常',
      'ai.level.warn': '注意',
      'ai.level.error': '有问题',
      'ai.level.unknown': '未知',
      'host.unit': '服务单元',
      'host.serverDir': '服务器目录',
      'unit.day': '天',
      'list.separator': '、',
      'dash': '—',
    };

    const EN = {
      'panel.label': 'Server status',
      'status.running': 'Running',
      'status.stopped': 'Stopped',
      'updated': 'Updated {time}',
      'loading': 'Reading server status…',
      'error.title': 'Could not read server status',
      'error.retry': 'Retry',
      'error.stale': 'Refresh failed: {message}',
      'error.action': 'Action failed: {message}',
      'players.title': 'Players online',
      'players.value': '{count}',
      'players.none': 'No players online',
      'players.max': 'limit {max}',
      'cpu.title': 'CPU',
      'cpu.sub': 'instantaneous load',
      'mem.title': 'Memory',
      'mem.sub': 'System {used} / {total} GB · {available} GB free',
      'uptime.title': 'Uptime',
      'uptime.sub': 'PID {pid} · {count} restarts',
      'world.title': 'World size',
      'world.sub': 'level {name}',
      'backups.title': 'Backups',
      'backups.value': '{count}',
      'backups.sub': '{size} · latest {name}',
      'backups.empty': 'No backups yet',
      'tunnel.title': 'Tunnel',
      'tunnel.on': 'Connected',
      'tunnel.off': 'Down',
      'tunnel.sub': '{address}',
      'lag.title': 'Tick warnings',
      'lag.value': '{count}',
      'lag.sub': 'behind in the last {minutes} min',
      'action.start': 'Start',
      'action.stop': 'Stop',
      'action.restart': 'Restart',
      'action.refresh': 'Refresh',
      'action.save': 'Save',
      'action.saveRestart': 'Save and restart',
      'action.starting': 'Starting…',
      'action.stopping': 'Stopping…',
      'action.restarting': 'Restarting…',
      'action.saving': 'Saving…',
      'done.start': 'Start requested; the server is booting',
      'done.stop': 'Server stopped',
      'done.restart': 'Server restarted',
      'done.config': 'Settings saved; they apply on the next start',
      'done.configRestart': 'Settings saved; the server was restarted',
      'confirm.cancel': 'Cancel',
      'confirm.stopTitle': 'Stop the server?',
      'confirm.stopBody': 'Online players are disconnected; the world is saved first.',
      'confirm.restartTitle': 'Restart the server?',
      'confirm.restartBody': 'Online players are disconnected; this takes about a minute.',
      'confirm.saveTitle': 'Save settings?',
      'confirm.saveLive': 'Saving stops and restarts the server; players are disconnected for about a minute.',
      'confirm.saveStopped': 'The server is stopped; the file is updated and applies on the next start.',
      'config.title': 'Server settings',
      'config.noteLive': 'saving restarts the server',
      'config.noteStopped': 'applies on next start',
      'config.difficulty': 'Difficulty',
      'config.motd': 'MOTD',
      'config.maxPlayers': 'Max players',
      'config.pvp': 'PvP',
      'config.whiteList': 'Whitelist',
      'config.onlineMode': 'Online mode',
      'config.viewDistance': 'View distance (chunks)',
      'config.simulationDistance': 'Simulation distance (chunks)',
      'config.reset': 'Reset',
      'config.errorMotd': 'MOTD must be 1-200 characters',
      'config.errorRange': 'Value must be between {min} and {max}',
      'host.title': 'Host',
      'host.os': 'OS',
      'host.kernel': 'Kernel',
      'host.cpu': 'CPU',
      'host.load': 'Load (1/5/15 min)',
      'host.disk': 'Disk (server dir)',
      'host.uptime': 'Host uptime',
      'logs.title': 'Recent log',
      'logs.empty': 'No log lines',
      'logs.live': 'Live',
      'logs.offline': 'Reconnecting',
      'logs.level': 'Level',
      'logs.levelAll': 'All',
      'logs.search': 'Search log',
      'logs.pause': 'Pause',
      'logs.resume': 'Resume',
      'logs.notifyOn': 'Notify: on',
      'logs.notifyOff': 'Notify: off',
      'notify.join': '{name} joined the game',
      'notify.leave': '{name} left the game',
      'notify.lag': 'The server is running behind',
      'notify.denied': 'Notification permission was not granted',
      'notify.unsupported': 'Notifications are not supported here',
      'stopped.title': 'Server is not running',
      'stopped.hint': 'Start it from a terminal with',
      'meta.version': 'Version',
      'meta.forge': 'Forge',
      'meta.port': 'Port',
      'meta.difficulty': 'Difficulty',
      'meta.mods': 'Mods',
      'meta.onlineMode': 'Online mode',
      'meta.level': 'Level',
      'meta.on': 'on',
      'meta.off': 'off',
      'difficulty.peaceful': 'Peaceful',
      'difficulty.easy': 'Easy',
      'difficulty.normal': 'Normal',
      'difficulty.hard': 'Hard',
      'ai.title': 'DS-assisted checks',
      'ai.description': 'When enabled, DeepSeek reviews the server status and logs every {minutes} minutes and lists problems below. Only a status digest and recent warnings are sent, never the full log.',
      'ai.enabled': 'On',
      'ai.disabled': 'Off',
      'ai.analyze': 'Check now',
      'ai.analyzing': 'Checking…',
      'ai.none': 'No check yet',
      'ai.lastRun': 'Last check {time} · {model}',
      'ai.error': 'Check failed: {message}',
      'ai.level.ok': 'OK',
      'ai.level.warn': 'Attention',
      'ai.level.error': 'Problem',
      'ai.level.unknown': 'Unknown',
      'host.unit': 'Service unit',
      'host.serverDir': 'Server directory',
      'unit.day': 'd',
      'list.separator': ', ',
      'dash': '—',
    };

    const CSS = `
.mcstat-page{display:flex;flex-direction:column;width:100%;min-width:0;height:100%;min-height:0;overflow:hidden;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);font-size:14px;line-height:1.6}
.mcstat-scroll{flex:1;min-height:0;overflow:auto;scrollbar-gutter:stable}
.mcstat-content{max-width:960px;margin:0 auto;padding:0 clamp(20px,4vw,44px) 48px}
.mcstat-heading{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:16px;padding-top:28px;margin-bottom:16px}
.mcstat-title{margin:0;font-size:20px;font-weight:500;line-height:28px;overflow-wrap:anywhere}
.mcstat-subtitle{margin:4px 0 0;color:var(--dsw-alias-label-secondary);font-size:13px;overflow-wrap:anywhere}
.mcstat-heading-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.mcstat-actions{display:flex;flex-wrap:wrap;gap:8px}
.mcstat-pill{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:13px;font-size:12px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.mcstat-pill--on{color:var(--dsw-alias-state-success-primary)}
.mcstat-pill--off{color:var(--dsw-alias-state-error-primary)}
.mcstat-dot{width:7px;height:7px;border-radius:50%;background:currentColor;flex:none}
.mcstat-updated{color:var(--dsw-alias-label-secondary);font-size:12px;font-variant-numeric:tabular-nums}
.mcstat-button{height:30px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:15px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;cursor:pointer;white-space:nowrap}
.mcstat-button:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}
.mcstat-button:disabled{opacity:.5;cursor:default}
.mcstat-button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.mcstat-button--primary{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base)}
.mcstat-button--danger{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}
.mcstat-alert{margin:0 0 12px;padding:10px 14px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-size:13px;overflow-wrap:anywhere}
.mcstat-alert--ok{color:var(--dsw-alias-state-success-primary)}
.mcstat-alert--error{color:var(--dsw-alias-state-error-primary)}
.mcstat-banner{display:flex;align-items:flex-start;gap:10px;margin:0 0 16px;padding:12px 14px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-size:13px}
.mcstat-banner strong{display:block;color:var(--dsw-alias-state-error-primary);font-weight:500}
.mcstat-banner p{margin:2px 0 0}
.mcstat-banner code{padding:1px 6px;border-radius:5px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px}
.mcstat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(212px,1fr));gap:12px}
.mcstat-card{min-width:0;padding:14px 16px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1)}
.mcstat-card-label{color:var(--dsw-alias-label-secondary);font-size:12px}
.mcstat-card-value{margin-top:6px;font-size:22px;font-weight:600;line-height:1.35;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.mcstat-card-value--on{color:var(--dsw-alias-state-success-primary)}
.mcstat-card-value--off{color:var(--dsw-alias-state-error-primary)}
.mcstat-card-value--warn{color:var(--dsw-alias-state-warn-primary)}
.mcstat-card-sub{margin-top:4px;color:var(--dsw-alias-label-secondary);font-size:12px;overflow-wrap:anywhere}
.mcstat-bar{height:4px;margin-top:10px;border-radius:2px;background:var(--dsw-alias-bg-layer-2);overflow:hidden}
.mcstat-bar-fill{height:100%;border-radius:2px;background:var(--dsw-alias-brand-primary)}
.mcstat-spark{display:block;width:100%;height:30px;margin-top:10px}
.mcstat-meta{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0 0}
.mcstat-chip{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-size:12px}
.mcstat-chip b{color:var(--dsw-alias-label-primary);font-weight:500;font-variant-numeric:tabular-nums}
.mcstat-section{margin-top:26px}
.mcstat-section-head{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:10px}
.mcstat-section-head h2{margin:0;font-size:14px;font-weight:500}
.mcstat-section-note{color:var(--dsw-alias-label-secondary);font-size:12px}
.mcstat-facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px 20px;margin:0;padding:14px 16px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1)}
.mcstat-facts dt{color:var(--dsw-alias-label-secondary);font-size:12px}
.mcstat-facts dd{margin:2px 0 0;font-size:13px;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
.mcstat-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px 16px;padding:14px 16px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1)}
.mcstat-field{display:flex;flex-direction:column;gap:6px;min-width:0}
.mcstat-field-label{color:var(--dsw-alias-label-secondary);font-size:12px}
.mcstat-input{height:30px;min-width:0;padding:0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px}
.mcstat-input:focus{outline:none;border-color:var(--dsw-alias-brand-primary)}
.mcstat-toggles{display:flex;flex-wrap:wrap;gap:8px 18px;grid-column:1/-1}
.mcstat-toggle{display:inline-flex;align-items:center;gap:8px;font-size:13px;color:var(--dsw-alias-label-primary);cursor:pointer}
.mcstat-toggle input{width:16px;height:16px;margin:0;accent-color:var(--dsw-alias-brand-primary)}
.mcstat-form-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:10px}
.mcstat-log{margin-top:26px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);overflow:hidden}
.mcstat-log-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;padding:10px 14px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.mcstat-log-head h2{margin:0;font-size:14px;font-weight:500}
.mcstat-log-hint{color:var(--dsw-alias-label-secondary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px}
.mcstat-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px 14px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.mcstat-toolbar .mcstat-input{height:28px}
.mcstat-toolbar .mcstat-button{height:28px;font-size:12px}
.mcstat-stream{display:inline-flex;align-items:center;gap:6px;margin-right:auto;font-size:12px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.mcstat-stream.is-live{color:var(--dsw-alias-state-success-primary)}
.mcstat-log-body{max-height:340px;overflow:auto;padding:6px 0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:1.7}
.mcstat-log-row{display:flex;gap:8px;padding:1px 14px;white-space:nowrap}
.mcstat-log-row:hover{background:var(--dsw-alias-bg-layer-2)}
.mcstat-log-time{flex:none;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.mcstat-log-level{flex:none;width:44px;color:var(--dsw-alias-label-secondary)}
.mcstat-log-level--warn{color:var(--dsw-alias-state-warn-primary)}
.mcstat-log-level--error{color:var(--dsw-alias-state-error-primary)}
.mcstat-log-text{min-width:0;overflow:hidden;text-overflow:ellipsis}
.mcstat-log-empty{padding:20px 14px;color:var(--dsw-alias-label-secondary);font-size:13px}
.mcstat-empty{margin-top:32px;padding:36px 24px;border:1px dashed var(--dsw-alias-border-l2);border-radius:12px;text-align:center;color:var(--dsw-alias-label-secondary);font-size:13px}
.mcstat-empty h2{margin:0 0 6px;color:var(--dsw-alias-label-primary);font-size:15px;font-weight:500}
.mcstat-empty p{margin:0 0 14px;overflow-wrap:anywhere}
.mcstat-overlay{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(0,0,0,.45)}
.mcstat-dialog{box-sizing:border-box;width:min(440px,100%);padding:20px;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary)}
.mcstat-dialog h2{margin:0 0 8px;font-size:15px;font-weight:500}
.mcstat-dialog p{margin:0 0 18px;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:1.6}
.mcstat-dialog-actions{display:flex;justify-content:flex-end;gap:8px}
.mcstat-ai{padding:14px 16px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1)}
.mcstat-ai-note{margin:0;color:var(--dsw-alias-label-secondary);font-size:12px}
.mcstat-ai-status{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;margin-top:12px;color:var(--dsw-alias-label-secondary);font-size:12px}
.mcstat-ai-verdict{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:10px;font-size:13px}
.mcstat-ai-badge{padding:1px 8px;border:1px solid currentColor;border-radius:10px;font-size:12px;white-space:nowrap}
.mcstat-ai-badge--ok{color:var(--dsw-alias-state-success-primary)}
.mcstat-ai-badge--warn{color:var(--dsw-alias-state-warn-primary)}
.mcstat-ai-badge--error{color:var(--dsw-alias-state-error-primary)}
.mcstat-ai-badge--unknown{color:var(--dsw-alias-label-secondary)}
.mcstat-ai-summary{overflow-wrap:anywhere}
.mcstat-ai-findings{margin:10px 0 0;padding-left:18px;font-size:13px}
.mcstat-ai-finding{margin:4px 0}
.mcstat-ai-finding strong{margin-right:6px;font-weight:500}
.mcstat-ai-finding--error strong{color:var(--dsw-alias-state-error-primary)}
.mcstat-ai-finding--warn strong{color:var(--dsw-alias-state-warn-primary)}
.mcstat-ai-finding span{color:var(--dsw-alias-label-secondary)}
.mcstat-ai-suggestions{margin:8px 0 0;padding-left:18px;color:var(--dsw-alias-label-secondary);font-size:12px}
.mcstat-ai-error{margin:10px 0 0;color:var(--dsw-alias-state-error-primary);font-size:12px}
`;

    let fallbackT = (key) => key;

    function pad2(value) {
      return String(value).padStart(2, '0');
    }

    function gigabytes(bytes) {
      return Number.isFinite(bytes) ? (bytes / 1073741824).toFixed(1) : '0.0';
    }

    function formatBytes(bytes) {
      if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
      const units = ['B', 'KB', 'MB', 'GB', 'TB'];
      let value = bytes;
      let unit = 0;
      while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
      }
      return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`;
    }

    function formatClock(milliseconds) {
      const date = new Date(milliseconds);
      if (Number.isNaN(date.getTime())) return '--:--:--';
      return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
    }

    function formatUptime(seconds, t) {
      if (!Number.isFinite(seconds) || seconds < 0) return t('dash');
      const days = Math.floor(seconds / 86400);
      const hours = Math.floor((seconds % 86400) / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const rest = Math.floor(seconds % 60);
      const clock = `${pad2(hours)}:${pad2(minutes)}:${pad2(rest)}`;
      return days > 0 ? `${days}${t('unit.day')} ${clock}` : clock;
    }

    function readNotifyPreference() {
      try {
        return window.localStorage.getItem(NOTIFY_KEY) === '1';
      } catch {
        return false;
      }
    }

    function storeNotifyPreference(value) {
      try {
        window.localStorage.setItem(NOTIFY_KEY, value ? '1' : '0');
      } catch {
        /* storage may be unavailable */
      }
    }

    function configFrom(server) {
      return {
        difficulty: server.difficulty || 'normal',
        motd: server.motd || '',
        maxPlayers: server.maxPlayers ?? 20,
        pvp: Boolean(server.pvp),
        whiteList: Boolean(server.whiteList),
        onlineMode: Boolean(server.onlineMode),
        viewDistance: server.viewDistance ?? 10,
        simulationDistance: server.simulationDistance ?? 10,
      };
    }

    function sameConfig(left, right) {
      return (
        left.difficulty === right.difficulty &&
        left.motd === right.motd &&
        String(left.maxPlayers) === String(right.maxPlayers) &&
        Boolean(left.pvp) === Boolean(right.pvp) &&
        Boolean(left.whiteList) === Boolean(right.whiteList) &&
        Boolean(left.onlineMode) === Boolean(right.onlineMode) &&
        String(left.viewDistance) === String(right.viewDistance) &&
        String(left.simulationDistance) === String(right.simulationDistance)
      );
    }

    function configChanges(draft, server) {
      const current = configFrom(server);
      const changes = {};
      if (draft.difficulty !== current.difficulty) changes.difficulty = draft.difficulty;
      if (String(draft.motd).trim() !== current.motd) changes.motd = String(draft.motd).trim();
      if (Number(draft.maxPlayers) !== current.maxPlayers) changes['max-players'] = Number(draft.maxPlayers);
      if (Boolean(draft.pvp) !== current.pvp) changes.pvp = Boolean(draft.pvp);
      if (Boolean(draft.whiteList) !== current.whiteList) changes['white-list'] = Boolean(draft.whiteList);
      if (Boolean(draft.onlineMode) !== current.onlineMode) changes['online-mode'] = Boolean(draft.onlineMode);
      if (Number(draft.viewDistance) !== current.viewDistance) changes['view-distance'] = Number(draft.viewDistance);
      if (Number(draft.simulationDistance) !== current.simulationDistance) {
        changes['simulation-distance'] = Number(draft.simulationDistance);
      }
      return changes;
    }

    function Sparkline({ values }) {
      const usable = values.filter((value) => Number.isFinite(value));
      if (usable.length < 2) {
        return h('div', { className: 'mcstat-spark', 'aria-hidden': true });
      }
      const max = Math.max(100, ...usable);
      const points = usable
        .map((value, index) => {
          const x = (index / (usable.length - 1)) * 100;
          const y = 29 - Math.max(0, Math.min(1, value / max)) * 27;
          return `${x.toFixed(2)},${y.toFixed(2)}`;
        })
        .join(' ');
      return h(
        'svg',
        { className: 'mcstat-spark', viewBox: '0 0 100 30', preserveAspectRatio: 'none', 'aria-hidden': true },
        h('polyline', {
          points,
          fill: 'none',
          stroke: 'var(--dsw-alias-brand-primary)',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          vectorEffect: 'non-scaling-stroke',
        }),
      );
    }

    function StatCard({ label, value, valueTone, sub, children }) {
      return h(
        'section',
        { className: 'mcstat-card' },
        h('div', { className: 'mcstat-card-label' }, label),
        h('div', { className: valueTone ? `mcstat-card-value mcstat-card-value--${valueTone}` : 'mcstat-card-value' }, value),
        sub === undefined || sub === null || sub === '' ? null : h('div', { className: 'mcstat-card-sub' }, sub),
        children === undefined ? null : children,
      );
    }

    function Bar({ ratio }) {
      const percent = Math.max(0, Math.min(1, Number(ratio) || 0)) * 100;
      return h(
        'div',
        { className: 'mcstat-bar', 'aria-hidden': true },
        h('div', { className: 'mcstat-bar-fill', style: { width: `${percent.toFixed(1)}%` } }),
      );
    }

    function StatChip({ name, value }) {
      return h('span', { className: 'mcstat-chip' }, `${name}`, h('b', null, value));
    }

    function Field({ label, children }) {
      return h('label', { className: 'mcstat-field' }, h('span', { className: 'mcstat-field-label' }, label), children);
    }

    function Toggle({ label, checked, onChange }) {
      return h(
        'label',
        { className: 'mcstat-toggle' },
        h('input', { type: 'checkbox', checked, onChange: (event) => onChange(event.target.checked) }),
        h('span', null, label),
      );
    }

    function ConfirmDialog({ t, dialog, onClose }) {
      const confirmRef = React.useRef(null);
      React.useEffect(() => {
        confirmRef.current?.focus();
        const onKeyDown = (event) => {
          if (event.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
      }, [onClose]);
      return h(
        'div',
        {
          className: 'mcstat-overlay',
          onClick: (event) => {
            if (event.target === event.currentTarget) onClose();
          },
        },
        h(
          'div',
          { className: 'mcstat-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'mcstat-dialog-title' },
          h('h2', { id: 'mcstat-dialog-title' }, dialog.title),
          h('p', null, dialog.message),
          h(
            'div',
            { className: 'mcstat-dialog-actions' },
            h('button', { type: 'button', className: 'mcstat-button', onClick: onClose }, t('confirm.cancel')),
            h(
              'button',
              {
                ref: confirmRef,
                type: 'button',
                className: dialog.danger ? 'mcstat-button mcstat-button--danger' : 'mcstat-button mcstat-button--primary',
                onClick: dialog.run,
              },
              dialog.confirmLabel,
            ),
          ),
        ),
      );
    }

    function StatsPage(props) {
      const t = props.t ?? fallbackT;
      const [state, setState] = React.useState({ phase: 'loading', data: null, error: null });
      const [history, setHistory] = React.useState([]);
      const [reloadKey, setReloadKey] = React.useState(0);
      const [logs, setLogs] = React.useState([]);
      const [stream, setStream] = React.useState('connecting');
      const [paused, setPaused] = React.useState(false);
      const [frozen, setFrozen] = React.useState(null);
      const [levelFilter, setLevelFilter] = React.useState('all');
      const [query, setQuery] = React.useState('');
      const [notify, setNotify] = React.useState(readNotifyPreference);
      const [busy, setBusy] = React.useState('');
      const [toast, setToast] = React.useState(null);
      const [dialog, setDialog] = React.useState(null);
      const [draft, setDraft] = React.useState(null);
      const [dirty, setDirty] = React.useState(false);
      const logRef = React.useRef(null);
      const firstLogScroll = React.useRef(true);
      const seeded = React.useRef(false);
      const notifyRef = React.useRef(notify);
      const lagNoticeAt = React.useRef(0);
      const data = state.data;

      React.useEffect(() => {
        let alive = true;
        let timer = 0;
        const poll = async () => {
          try {
            const response = await fetch(`${STATS_PATH}?t=${Date.now()}`, {
              cache: 'no-store',
              headers: { accept: 'application/json' },
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const payload = await response.json();
            if (payload === null || typeof payload !== 'object' || payload.ok !== true) {
              throw new Error(String(payload?.error ?? 'invalid payload'));
            }
            if (!alive) return;
            setState({ phase: 'ready', data: payload, error: null });
            setHistory((previous) => {
              const next = previous.concat([{ cpu: Number(payload.cpu) || 0 }]);
              return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
            });
          } catch (error) {
            if (!alive) return;
            setState((previous) => ({
              phase: previous.data === null ? 'error' : 'stale',
              data: previous.data,
              error: String(error?.message ?? error),
            }));
          }
        };
        poll();
        timer = window.setInterval(poll, REFRESH_MS);
        return () => {
          alive = false;
          window.clearInterval(timer);
        };
      }, [reloadKey]);

      React.useEffect(() => {
        if (seeded.current || data === null) return;
        seeded.current = true;
        if (Array.isArray(data.logs)) setLogs(data.logs);
      }, [data]);

      React.useEffect(() => {
        if (data === null || dirty) return;
        const next = configFrom(data.server || {});
        setDraft((previous) => (previous !== null && sameConfig(previous, next) ? previous : next));
      }, [data, dirty]);

      React.useEffect(() => {
        if (toast === null) return;
        const timer = window.setTimeout(() => setToast(null), 6000);
        return () => window.clearTimeout(timer);
      }, [toast]);

      React.useEffect(() => {
        notifyRef.current = notify;
      }, [notify]);

      const notifyRow = (row) => {
        if (!notifyRef.current) return;
        if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
        const match = /^(\S+) (joined|left) the game/.exec(row.text || '');
        if (match !== null) {
          new Notification(match[2] === 'joined' ? t('notify.join', { name: match[1] }) : t('notify.leave', { name: match[1] }));
          return;
        }
        if ((row.text || '').includes("Can't keep up") && Date.now() - lagNoticeAt.current > 60000) {
          lagNoticeAt.current = Date.now();
          new Notification(t('notify.lag'));
        }
      };

      React.useEffect(() => {
        const source = new EventSource(STREAM_PATH);
        setStream('connecting');
        source.onopen = () => setStream('open');
        source.onerror = () => setStream('offline');
        source.onmessage = (event) => {
          let row;
          try {
            row = JSON.parse(event.data);
          } catch {
            return;
          }
          setLogs((previous) => {
            const next = previous.concat([row]);
            return next.length > MAX_LOGS ? next.slice(next.length - MAX_LOGS) : next;
          });
          notifyRow(row);
        };
        return () => source.close();
        // The stream follows the panel's lifetime; rows are appended, never replaced.
      }, []);

      React.useEffect(() => {
        if (data === null || data.ai === undefined || data.ai.running !== true) return;
        const timer = window.setTimeout(() => setReloadKey((value) => value + 1), 2500);
        return () => window.clearTimeout(timer);
      }, [data]);

      const refresh = () => setReloadKey((value) => value + 1);

      const showToast = (tone, text) => setToast({ tone, text });

      const runAction = async (action) => {
        setDialog(null);
        setBusy(action);
        try {
          const response = await fetch(ACTION_PATH, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action }),
          });
          const payload = await response.json();
          if (!payload.ok) throw new Error(payload.error || 'failed');
          showToast('ok', t(`done.${action}`));
          refresh();
        } catch (error) {
          showToast('error', t('error.action', { message: String(error?.message ?? error) }));
        } finally {
          setBusy('');
        }
      };

      const requestAction = (action) => {
        if (action === 'start') {
          runAction('start');
          return;
        }
        setDialog({
          title: action === 'stop' ? t('confirm.stopTitle') : t('confirm.restartTitle'),
          message: action === 'stop' ? t('confirm.stopBody') : t('confirm.restartBody'),
          confirmLabel: action === 'stop' ? t('action.stop') : t('action.restart'),
          danger: true,
          run: () => runAction(action),
        });
      };

      const updateDraft = (patch) => {
        setDraft((previous) => ({ ...(previous || {}), ...patch }));
        setDirty(true);
      };

      const resetDraft = () => {
        if (data !== null) setDraft(configFrom(data.server || {}));
        setDirty(false);
      };

      const validateDraft = () => {
        const motd = String(draft.motd ?? '').trim();
        if (motd === '' || motd.length > 200) return t('config.errorMotd');
        for (const [key, min, max] of [
          ['maxPlayers', 1, 1000],
          ['viewDistance', 3, 32],
          ['simulationDistance', 3, 32],
        ]) {
          const value = Number(draft[key]);
          if (!Number.isInteger(value) || value < min || value > max) return t('config.errorRange', { min, max });
        }
        return null;
      };

      const runSave = async (changes) => {
        setDialog(null);
        setBusy('save');
        try {
          const response = await fetch(CONFIG_PATH, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ changes }),
          });
          const payload = await response.json();
          if (!payload.ok) throw new Error(payload.error || 'failed');
          setDirty(false);
          showToast('ok', payload.restarted ? t('done.configRestart') : t('done.config'));
          refresh();
        } catch (error) {
          showToast('error', t('error.action', { message: String(error?.message ?? error) }));
        } finally {
          setBusy('');
        }
      };

      const saveConfig = () => {
        if (draft === null || data === null) return;
        const invalid = validateDraft();
        if (invalid !== null) {
          showToast('error', invalid);
          return;
        }
        const changes = configChanges(draft, data.server || {});
        if (Object.keys(changes).length === 0) {
          setDirty(false);
          showToast('ok', t('done.config'));
          return;
        }
        const live = Boolean(data.live);
        setDialog({
          title: t('confirm.saveTitle'),
          message: live ? t('confirm.saveLive') : t('confirm.saveStopped'),
          confirmLabel: live ? t('action.saveRestart') : t('action.save'),
          danger: live,
          run: () => runSave(changes),
        });
      };

      const toggleAi = async (enabled) => {
        try {
          const response = await fetch(AI_PATH, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ enabled }),
          });
          const payload = await response.json();
          if (!payload.ok) throw new Error(payload.error || 'failed');
          refresh();
        } catch (error) {
          showToast('error', t('error.action', { message: String(error?.message ?? error) }));
        }
      };

      const analyzeNow = async () => {
        try {
          const response = await fetch(AI_PATH, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ analyze: true }),
          });
          const payload = await response.json();
          if (!payload.ok) throw new Error(payload.error || 'failed');
          refresh();
        } catch (error) {
          showToast('error', t('error.action', { message: String(error?.message ?? error) }));
        }
      };

      const togglePause = () => {
        if (paused) {
          setPaused(false);
          setFrozen(null);
        } else {
          setFrozen(logs);
          setPaused(true);
        }
      };

      const toggleNotify = () => {
        if (typeof Notification === 'undefined') {
          showToast('error', t('notify.unsupported'));
          return;
        }
        if (!notify) {
          Notification.requestPermission().then((permission) => {
            if (permission === 'granted') {
              setNotify(true);
              storeNotifyPreference(true);
            } else {
              showToast('error', t('notify.denied'));
            }
          });
          return;
        }
        setNotify(false);
        storeNotifyPreference(false);
      };

      const live = Boolean(data && data.live);
      const server = (data && data.server) || {};
      const unit = (data && data.unit) || {};
      const host = (data && data.host) || null;
      const memory = (data && data.memory) || {};
      const players = (data && data.players) || { count: 0, names: [] };
      const tunnel = (data && data.tunnel) || { active: false, address: null };
      const backups = (data && data.backups) || { count: 0, bytes: 0, latest: null };
      const lag = (data && data.lag) || { warnings: 0, windowMinutes: 10 };
      const ai = (data && data.ai) || { enabled: false, running: false, last: null, error: null, intervalMinutes: 5 };
      const settings = (data && data.settings) || null;
      const dash = t('dash');
      const busyLabel =
        busy === ''
          ? null
          : t(`action.${busy === 'save' ? 'saving' : busy === 'start' ? 'starting' : busy === 'stop' ? 'stopping' : 'restarting'}`);

      const statusText = data === null ? t('loading') : live ? t('status.running') : t('status.stopped');
      const subtitleParts = [];
      if (tunnel.address) subtitleParts.push(tunnel.address);
      if (server.version) subtitleParts.push(`Minecraft ${server.version}`);
      if (server.forge) subtitleParts.push(`Forge ${server.forge}`);

      const heading = h(
        'header',
        { className: 'mcstat-heading' },
        h(
          'div',
          { className: 'mcstat-heading-main' },
          h('h1', { className: 'mcstat-title' }, server.motd || t('panel.label')),
          subtitleParts.length > 0 ? h('p', { className: 'mcstat-subtitle' }, subtitleParts.join(' · ')) : null,
        ),
        h(
          'div',
          { className: 'mcstat-heading-actions' },
          h(
            'span',
            {
              className: `mcstat-pill ${data === null ? '' : live ? 'mcstat-pill--on' : 'mcstat-pill--off'}`,
              role: 'status',
            },
            h('span', { className: 'mcstat-dot' }),
            busyLabel ?? statusText,
          ),
          data === null
            ? null
            : h(
                'div',
                { className: 'mcstat-actions' },
                live
                  ? h('button', { type: 'button', className: 'mcstat-button', disabled: busy !== '', onClick: () => requestAction('stop') }, t('action.stop'))
                  : h(
                      'button',
                      {
                        type: 'button',
                        className: 'mcstat-button mcstat-button--primary',
                        disabled: busy !== '',
                        onClick: () => requestAction('start'),
                      },
                      t('action.start'),
                    ),
                live
                  ? h('button', { type: 'button', className: 'mcstat-button', disabled: busy !== '', onClick: () => requestAction('restart') }, t('action.restart'))
                  : null,
                h('button', { type: 'button', className: 'mcstat-button', disabled: busy !== '', onClick: refresh }, t('action.refresh')),
              ),
          data === null ? null : h('span', { className: 'mcstat-updated' }, t('updated', { time: formatClock(data.generatedAt) })),
        ),
      );

      const cards = data === null
        ? null
        : h(
            'div',
            { className: 'mcstat-grid' },
            h(StatCard, {
              label: t('players.title'),
              value: live ? t('players.value', { count: players.count }) : dash,
              sub: live
                ? players.count > 0
                  ? players.names.join(t('list.separator'))
                  : t('players.none')
                : t('players.max', { max: server.maxPlayers ?? 20 }),
            }),
            h(StatCard, {
              label: t('cpu.title'),
              value: live && data.cpu !== null && data.cpu !== undefined ? `${Number(data.cpu).toFixed(1)}%` : dash,
              sub: t('cpu.sub'),
              children: h(Sparkline, { values: history.map((point) => point.cpu) }),
            }),
            h(StatCard, {
              label: t('mem.title'),
              value: live && memory.processBytes ? formatBytes(memory.processBytes) : dash,
              sub: t('mem.sub', {
                used: gigabytes(memory.usedBytes),
                total: gigabytes(memory.totalBytes),
                available: gigabytes(memory.availableBytes),
              }),
              children: h(Bar, { ratio: memory.totalBytes ? (memory.processBytes || 0) / memory.totalBytes : 0 }),
            }),
            h(StatCard, {
              label: t('uptime.title'),
              value: live ? formatUptime(data.uptimeSeconds, t) : dash,
              sub: t('uptime.sub', { pid: unit.pid || dash, count: unit.restarts ?? 0 }),
            }),
            h(StatCard, {
              label: t('world.title'),
              value: formatBytes(data.world ? data.world.bytes : 0),
              sub: t('world.sub', { name: server.levelName || 'world' }),
            }),
            h(StatCard, {
              label: t('backups.title'),
              value: t('backups.value', { count: backups.count }),
              sub: backups.count > 0
                ? t('backups.sub', { size: formatBytes(backups.bytes), name: backups.latest || dash })
                : t('backups.empty'),
            }),
            h(StatCard, {
              label: t('tunnel.title'),
              value: tunnel.active ? t('tunnel.on') : t('tunnel.off'),
              valueTone: tunnel.active ? 'on' : 'off',
              sub: tunnel.address ? t('tunnel.sub', { address: tunnel.address }) : dash,
            }),
            h(StatCard, {
              label: t('lag.title'),
              value: t('lag.value', { count: lag.warnings }),
              valueTone: lag.warnings > 0 ? 'warn' : undefined,
              sub: t('lag.sub', { minutes: lag.windowMinutes }),
            }),
          );

      const meta = data === null
        ? null
        : h(
            'div',
            { className: 'mcstat-meta' },
            h(StatChip, { name: t('meta.version'), value: server.version || dash }),
            server.forge ? h(StatChip, { name: t('meta.forge'), value: server.forge }) : null,
            h(StatChip, { name: t('meta.port'), value: server.port || dash }),
            h(StatChip, { name: t('meta.difficulty'), value: t(`difficulty.${server.difficulty || 'normal'}`) }),
            h(StatChip, { name: t('meta.mods'), value: String(data.mods ?? 0) }),
            h(StatChip, { name: t('meta.onlineMode'), value: server.onlineMode ? t('meta.on') : t('meta.off') }),
            h(StatChip, { name: t('meta.level'), value: server.levelName || 'world' }),
          );

      const settingsFacts = settings === null
        ? []
        : [
            [t('host.unit'), settings.unit || dash],
            [t('host.serverDir'), settings.serverDir || dash],
          ];
      const hostFacts = host === null
        ? settingsFacts
        : [
            ...settingsFacts,
            [t('host.os'), host.os || dash],
            [t('host.kernel'), host.kernel || dash],
            [t('host.cpu'), host.cpuModel ? `${host.cpuModel} · ${host.cores}` : String(host.cores ?? dash)],
            [t('host.load'), Array.isArray(host.load) ? host.load.map((value) => Number(value).toFixed(2)).join(' / ') : dash],
            [
              t('host.disk'),
              host.disk
                ? `${formatBytes(host.disk.usedBytes)} / ${formatBytes(host.disk.totalBytes)}（${Math.round((host.disk.usedRatio || 0) * 100)}%）`
                : dash,
            ],
            [t('host.uptime'), formatUptime(host.uptimeSeconds, t)],
          ];

      const hostSection = hostFacts.length === 0
        ? null
        : h(
            'section',
            { className: 'mcstat-section' },
            h('div', { className: 'mcstat-section-head' }, h('h2', null, t('host.title'))),
            h(
              'dl',
              { className: 'mcstat-facts' },
              hostFacts.map(([name, value]) => h(React.Fragment, { key: name }, h('dt', null, name), h('dd', null, value))),
            ),
          );

      const aiSection = data === null
        ? null
        : h(
            'section',
            { className: 'mcstat-section' },
            h(
              'div',
              { className: 'mcstat-section-head' },
              h('h2', null, t('ai.title')),
              h(
                'label',
                { className: 'mcstat-toggle' },
                h('input', {
                  type: 'checkbox',
                  checked: ai.enabled === true,
                  onChange: (event) => toggleAi(event.target.checked),
                }),
                h('span', null, ai.enabled ? t('ai.enabled') : t('ai.disabled')),
              ),
            ),
            h(
              'div',
              { className: 'mcstat-ai' },
              h('p', { className: 'mcstat-ai-note' }, t('ai.description', { minutes: ai.intervalMinutes ?? 5 })),
              ai.enabled !== true
                ? null
                : h(
                    'div',
                    { className: 'mcstat-ai-status' },
                    h(
                      'span',
                      null,
                      ai.running === true
                        ? t('ai.analyzing')
                        : ai.last !== null && ai.last !== undefined
                          ? t('ai.lastRun', { time: formatClock(ai.last.at), model: `${ai.last.provider}/${ai.last.model}` })
                          : t('ai.none'),
                    ),
                    h(
                      'button',
                      { type: 'button', className: 'mcstat-button', disabled: ai.running === true, onClick: analyzeNow },
                      ai.running === true ? t('ai.analyzing') : t('ai.analyze'),
                    ),
                  ),
              ai.enabled === true && ai.last !== null && ai.last !== undefined
                ? h(
                    'div',
                    { className: 'mcstat-ai-verdict' },
                    h(
                      'span',
                      { className: `mcstat-ai-badge mcstat-ai-badge--${ai.last.level || 'unknown'}` },
                      t(`ai.level.${ai.last.level || 'unknown'}`),
                    ),
                    h('span', { className: 'mcstat-ai-summary' }, ai.last.summary),
                  )
                : null,
              ai.enabled === true && ai.last !== null && ai.last !== undefined && ai.last.findings.length > 0
                ? h(
                    'ul',
                    { className: 'mcstat-ai-findings' },
                    ai.last.findings.map((finding, index) =>
                      h(
                        'li',
                        { key: index, className: `mcstat-ai-finding mcstat-ai-finding--${finding.severity}` },
                        h('strong', null, finding.title),
                        h('span', null, finding.detail),
                      ),
                    ),
                  )
                : null,
              ai.enabled === true && ai.last !== null && ai.last !== undefined && ai.last.suggestions.length > 0
                ? h(
                    'ul',
                    { className: 'mcstat-ai-suggestions' },
                    ai.last.suggestions.map((suggestion, index) => h('li', { key: index }, suggestion)),
                  )
                : null,
              ai.enabled === true && ai.error ? h('p', { className: 'mcstat-ai-error' }, t('ai.error', { message: ai.error })) : null,
            ),
          );

      const settingsSection = draft === null
        ? null
        : h(
            'section',
            { className: 'mcstat-section' },
            h(
              'div',
              { className: 'mcstat-section-head' },
              h('h2', null, t('config.title')),
              h('span', { className: 'mcstat-section-note' }, live ? t('config.noteLive') : t('config.noteStopped')),
            ),
            h(
              'div',
              { className: 'mcstat-form' },
              h(
                Field,
                { label: t('config.difficulty') },
                h(
                  'select',
                  {
                    className: 'mcstat-input',
                    value: draft.difficulty,
                    onChange: (event) => updateDraft({ difficulty: event.target.value }),
                  },
                  DIFFICULTIES.map((value) => h('option', { key: value, value }, t(`difficulty.${value}`))),
                ),
              ),
              h(
                Field,
                { label: t('config.motd') },
                h('input', {
                  className: 'mcstat-input',
                  type: 'text',
                  maxLength: 200,
                  value: draft.motd,
                  onChange: (event) => updateDraft({ motd: event.target.value }),
                }),
              ),
              h(
                Field,
                { label: t('config.maxPlayers') },
                h('input', {
                  className: 'mcstat-input',
                  type: 'number',
                  min: 1,
                  max: 1000,
                  value: draft.maxPlayers,
                  onChange: (event) => updateDraft({ maxPlayers: event.target.value }),
                }),
              ),
              h(
                Field,
                { label: t('config.viewDistance') },
                h('input', {
                  className: 'mcstat-input',
                  type: 'number',
                  min: 3,
                  max: 32,
                  value: draft.viewDistance,
                  onChange: (event) => updateDraft({ viewDistance: event.target.value }),
                }),
              ),
              h(
                Field,
                { label: t('config.simulationDistance') },
                h('input', {
                  className: 'mcstat-input',
                  type: 'number',
                  min: 3,
                  max: 32,
                  value: draft.simulationDistance,
                  onChange: (event) => updateDraft({ simulationDistance: event.target.value }),
                }),
              ),
              h(
                'div',
                { className: 'mcstat-toggles' },
                h(Toggle, {
                  label: t('config.pvp'),
                  checked: Boolean(draft.pvp),
                  onChange: (value) => updateDraft({ pvp: value }),
                }),
                h(Toggle, {
                  label: t('config.whiteList'),
                  checked: Boolean(draft.whiteList),
                  onChange: (value) => updateDraft({ whiteList: value }),
                }),
                h(Toggle, {
                  label: t('config.onlineMode'),
                  checked: Boolean(draft.onlineMode),
                  onChange: (value) => updateDraft({ onlineMode: value }),
                }),
              ),
            ),
            h(
              'div',
              { className: 'mcstat-form-actions' },
              h(
                'button',
                { type: 'button', className: 'mcstat-button', disabled: !dirty || busy !== '', onClick: resetDraft },
                t('config.reset'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: dirty ? 'mcstat-button mcstat-button--primary' : 'mcstat-button',
                  disabled: !dirty || busy !== '',
                  onClick: saveConfig,
                },
                busy === 'save' ? t('action.saving') : t('action.save'),
              ),
            ),
          );

      const visibleLogs = frozen ?? logs;
      const filteredLogs = React.useMemo(() => {
        const needle = query.trim().toLowerCase();
        return visibleLogs.filter(
          (row) =>
            (levelFilter === 'all' || row.level === levelFilter) &&
            (needle === '' || String(row.text).toLowerCase().includes(needle)),
        );
      }, [visibleLogs, levelFilter, query]);
      const shownLogs = filteredLogs.slice(-LOG_ROWS);
      const newLines = paused && frozen !== null ? Math.max(0, logs.length - frozen.length) : 0;

      React.useEffect(() => {
        const node = logRef.current;
        if (node === null) return;
        const nearBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
        if (firstLogScroll.current || nearBottom) {
          node.scrollTop = node.scrollHeight;
          firstLogScroll.current = false;
        }
      }, [shownLogs]);

      const logSection = data === null
        ? null
        : h(
            'section',
            { className: 'mcstat-log' },
            h(
              'div',
              { className: 'mcstat-log-head' },
              h('h2', null, t('logs.title')),
              h('code', { className: 'mcstat-log-hint' }, `journalctl --user -u ${(data.unit && data.unit.name) || 'mc'} -f`),
            ),
            h(
              'div',
              { className: 'mcstat-toolbar' },
              h(
                'span',
                { className: `mcstat-stream ${stream === 'open' ? 'is-live' : ''}` },
                h('span', { className: 'mcstat-dot' }),
                stream === 'open' ? t('logs.live') : t('logs.offline'),
              ),
              h(
                'select',
                {
                  className: 'mcstat-input',
                  value: levelFilter,
                  'aria-label': t('logs.level'),
                  onChange: (event) => setLevelFilter(event.target.value),
                },
                LEVELS.map((value) => h('option', { key: value, value }, value === 'all' ? t('logs.levelAll') : value)),
              ),
              h('input', {
                className: 'mcstat-input',
                type: 'search',
                value: query,
                placeholder: t('logs.search'),
                'aria-label': t('logs.search'),
                onChange: (event) => setQuery(event.target.value),
              }),
              h(
                'button',
                { type: 'button', className: 'mcstat-button', onClick: togglePause },
                paused ? `${t('logs.resume')}${newLines > 0 ? ` (${newLines})` : ''}` : t('logs.pause'),
              ),
              h(
                'button',
                { type: 'button', className: 'mcstat-button', onClick: toggleNotify },
                notify ? t('logs.notifyOn') : t('logs.notifyOff'),
              ),
            ),
            shownLogs.length === 0
              ? h('div', { className: 'mcstat-log-empty' }, t('logs.empty'))
              : h(
                  'div',
                  { className: 'mcstat-log-body', ref: logRef },
                  shownLogs.map((row, index) =>
                    h(
                      'div',
                      { key: `${row.time}-${index}`, className: 'mcstat-log-row' },
                      h('span', { className: 'mcstat-log-time' }, row.time || '--:--:--'),
                      h(
                        'span',
                        {
                          className:
                            row.level === 'WARN'
                              ? 'mcstat-log-level mcstat-log-level--warn'
                              : row.level === 'ERROR' || row.level === 'FATAL'
                                ? 'mcstat-log-level mcstat-log-level--error'
                                : 'mcstat-log-level',
                        },
                        row.level || 'LOG',
                      ),
                      h(
                        'span',
                        { className: 'mcstat-log-text', title: row.source ? `${row.source}: ${row.text}` : row.text },
                        row.text,
                      ),
                    ),
                  ),
                ),
          );

      const alerts = [];
      if (toast !== null) {
        alerts.push(h('div', { className: `mcstat-alert mcstat-alert--${toast.tone}`, role: 'status', key: 'toast' }, toast.text));
      }
      if (data !== null && !live) {
        alerts.push(
          h(
            'div',
            { className: 'mcstat-banner', key: 'stopped' },
            h('div', null, h('strong', null, t('stopped.title')), h('p', null, t('stopped.hint'), ' ', h('code', null, `systemctl --user start ${(data.unit && data.unit.name) || 'mc'}`))),
          ),
        );
      }
      if (state.phase === 'stale') {
        alerts.push(
          h('div', { className: 'mcstat-banner', key: 'stale' }, h('div', null, h('p', null, t('error.stale', { message: state.error || '' })))),
        );
      }

      const body = data === null
        ? state.phase === 'error'
          ? h(
              'div',
              { className: 'mcstat-empty' },
              h('h2', null, t('error.title')),
              h('p', null, state.error || ''),
              h('button', { type: 'button', className: 'mcstat-button', onClick: refresh }, t('error.retry')),
            )
          : h('div', { className: 'mcstat-empty' }, t('loading'))
        : h(React.Fragment, null, alerts, cards, meta, aiSection, settingsSection, hostSection, logSection);

      return h(
        'div',
        { className: 'mcstat-page' },
        h('style', { key: 'mcstat-style' }, CSS),
        h('div', { className: 'mcstat-scroll' }, h('div', { className: 'mcstat-content' }, heading, body)),
        dialog === null ? null : h(ConfirmDialog, { t, dialog, onClose: () => setDialog(null) }),
      );
    }

    function PanelIcon({ size }) {
      const edge = Number.isFinite(size) ? size : 16;
      return h(
        'svg',
        { width: edge, height: edge, viewBox: '0 0 24 24', 'aria-hidden': true, focusable: 'false' },
        h('rect', { x: 3.5, y: 4.25, width: 17, height: 6.5, rx: 1.75, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 }),
        h('rect', { x: 3.5, y: 13.25, width: 17, height: 6.5, rx: 1.75, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 }),
        h('circle', { cx: 7.5, cy: 7.5, r: 1.1, fill: 'currentColor' }),
        h('circle', { cx: 7.5, cy: 16.5, r: 1.1, fill: 'currentColor' }),
        h('rect', { x: 11, y: 6.6, width: 6.5, height: 1.8, rx: 0.9, fill: 'currentColor', opacity: 0.75 }),
        h('rect', { x: 11, y: 15.6, width: 6.5, height: 1.8, rx: 0.9, fill: 'currentColor', opacity: 0.75 }),
      );
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const t = ctx.locale.bind(NS);
        fallbackT = t;
        ctx.effect(() => {
          const zh = ctx.locale.register(NS, 'zh', ZH);
          const en = ctx.locale.register(NS, 'en', EN);
          return () => {
            zh();
            en();
          };
        }, 'mcstat: dictionaries');
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID, locale: NS }, StatsPage));
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            { name: 'sidebar.panellist', id: PANEL_ID, order: 25, locale: NS, label: () => t('panel.label') },
            PanelIcon,
          ),
        );
      },
    };
  },
});
