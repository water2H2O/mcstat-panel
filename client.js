// SPDX-License-Identifier: MIT
/**
 * Client half of the mcstat panel.
 *
 * Registers one entry in the sidebar panel list and renders the matching main
 * page: a live dashboard of the Minecraft server `mcstat` describes in the
 * terminal (service state, CPU, memory, players, world, backups, tunnel, lag,
 * and the journal tail). Data comes from the Host half's `/mcstat/stats` route.
 */
window.__ModuleLoader__.load({
  id: '@local/mcstat-panel',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'mcstat';
    const PANEL_ID = 'mcstat';
    const ENDPOINT = '/mcstat/stats';
    const REFRESH_MS = 10000;
    const HISTORY_LIMIT = 60;
    const LOG_ROWS = 40;

    const ZH = {
      'panel.label': '服务器状态',
      'status.running': '运行中',
      'status.stopped': '未运行',
      'status.unknown': '未知',
      'refresh': '刷新',
      'updated': '更新于 {time}',
      'loading': '正在读取服务器状态…',
      'error.title': '无法读取服务器状态',
      'error.retry': '重试',
      'error.stale': '刷新失败：{message}',
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
      'service.title': '服务',
      'service.on': '运行中',
      'service.off': '未运行',
      'service.sub': 'PID {pid}',
      'logs.title': '最近日志',
      'logs.empty': '暂无日志',
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
      'unit.day': '天',
      'list.separator': '、',
      'dash': '—',
    };

    const EN = {
      'panel.label': 'Server status',
      'status.running': 'Running',
      'status.stopped': 'Stopped',
      'status.unknown': 'Unknown',
      'refresh': 'Refresh',
      'updated': 'Updated {time}',
      'loading': 'Reading server status…',
      'error.title': 'Could not read server status',
      'error.retry': 'Retry',
      'error.stale': 'Refresh failed: {message}',
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
      'service.title': 'Service',
      'service.on': 'Running',
      'service.off': 'Stopped',
      'service.sub': 'PID {pid}',
      'logs.title': 'Recent log',
      'logs.empty': 'No log lines',
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
.mcstat-heading-actions{display:flex;flex-wrap:wrap;align-items:center;gap:10px}
.mcstat-pill{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:13px;font-size:12px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.mcstat-pill--on{color:var(--dsw-alias-state-success-primary)}
.mcstat-pill--off{color:var(--dsw-alias-state-error-primary)}
.mcstat-dot{width:7px;height:7px;border-radius:50%;background:currentColor;flex:none}
.mcstat-updated{color:var(--dsw-alias-label-secondary);font-size:12px;font-variant-numeric:tabular-nums}
.mcstat-button{height:30px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:15px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;cursor:pointer}
.mcstat-button:hover{background:var(--dsw-alias-bg-layer-2)}
.mcstat-button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
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
.mcstat-log{margin-top:24px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);overflow:hidden}
.mcstat-log-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;padding:10px 14px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.mcstat-log-head h2{margin:0;font-size:14px;font-weight:500}
.mcstat-log-hint{color:var(--dsw-alias-label-secondary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px}
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
.mcstat-empty code{color:var(--dsw-alias-label-secondary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
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
      const digits = value >= 100 ? 0 : 1;
      return `${value.toFixed(digits)} ${units[unit]}`;
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
        {
          className: 'mcstat-spark',
          viewBox: '0 0 100 30',
          preserveAspectRatio: 'none',
          'aria-hidden': true,
        },
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

    function StatsPage(props) {
      const t = props.t ?? fallbackT;
      const [state, setState] = React.useState({ phase: 'loading', data: null, error: null });
      const [history, setHistory] = React.useState([]);
      const [reloadKey, setReloadKey] = React.useState(0);
      const logRef = React.useRef(null);
      const firstLogScroll = React.useRef(true);
      const data = state.data;

      React.useEffect(() => {
        let alive = true;
        let timer = 0;
        const poll = async () => {
          try {
            const response = await fetch(`${ENDPOINT}?t=${Date.now()}`, {
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
        const node = logRef.current;
        if (node === null) return;
        const nearBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
        if (firstLogScroll.current || nearBottom) {
          node.scrollTop = node.scrollHeight;
          firstLogScroll.current = false;
        }
      }, [data === null ? null : data.logs]);

      const refresh = () => setReloadKey((value) => value + 1);

      const live = Boolean(data && data.live);
      const server = (data && data.server) || {};
      const unit = (data && data.unit) || {};
      const memory = (data && data.memory) || {};
      const players = (data && data.players) || { count: 0, names: [] };
      const tunnel = (data && data.tunnel) || { active: false, address: null };
      const backups = (data && data.backups) || { count: 0, bytes: 0, latest: null };
      const lag = (data && data.lag) || { warnings: 0, windowMinutes: 10 };
      const dash = t('dash');

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
            statusText,
          ),
          h('button', { type: 'button', className: 'mcstat-button', onClick: refresh }, t('refresh')),
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
            h(StatChip, {
              name: t('meta.difficulty'),
              value: t(`difficulty.${server.difficulty || 'normal'}`),
            }),
            h(StatChip, { name: t('meta.mods'), value: String(data.mods ?? 0) }),
            h(StatChip, {
              name: t('meta.onlineMode'),
              value: server.onlineMode ? t('meta.on') : t('meta.off'),
            }),
            h(StatChip, { name: t('meta.level'), value: server.levelName || 'world' }),
          );

      const logs = data === null ? [] : (data.logs || []).slice(-LOG_ROWS);
      const logSection = data === null
        ? null
        : h(
            'section',
            { className: 'mcstat-log' },
            h(
              'div',
              { className: 'mcstat-log-head' },
              h('h2', null, t('logs.title')),
              h('code', { className: 'mcstat-log-hint' }, 'journalctl --user -u mc -f'),
            ),
            logs.length === 0
              ? h('div', { className: 'mcstat-log-empty' }, t('logs.empty'))
              : h(
                  'div',
                  { className: 'mcstat-log-body', ref: logRef },
                  logs.map((row, index) =>
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

      const banner = data !== null && !live
        ? h(
            'div',
            { className: 'mcstat-banner' },
            h('div', null, h('strong', null, t('stopped.title')), h('p', null, t('stopped.hint'), ' ', h('code', null, 'systemctl --user start mc'))),
          )
        : state.phase === 'stale'
          ? h(
              'div',
              { className: 'mcstat-banner' },
              h('div', null, h('p', null, t('error.stale', { message: state.error || '' }))),
            )
          : null;

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
        : h(React.Fragment, null, banner, cards, meta, logSection);

      return h(
        'div',
        { className: 'mcstat-page' },
        h('style', { key: 'mcstat-style' }, CSS),
        h('div', { className: 'mcstat-scroll' }, h('div', { className: 'mcstat-content' }, heading, body)),
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
        ctx.slots.inject('main', () =>
          ctx.slots.register({ name: 'main', key: PANEL_ID, locale: NS }, StatsPage),
        );
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
