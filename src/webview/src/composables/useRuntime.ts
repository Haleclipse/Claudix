import { onMounted, onUnmounted } from 'vue';
import { signal, effect } from 'alien-signals';
import { ConnectionManager } from '../core/ConnectionManager';
import { AppContext } from '../core/AppContext';
import { SessionStore } from '../core/SessionStore';
import type { SelectionRange } from '../core/Session';
import { EventEmitter } from '../utils/events';
import { transport, atMentionEvents, selectionEvents } from '../core/runtimeTransport';

export interface RuntimeInstance {
  connectionManager: ConnectionManager;
  appContext: AppContext;
  sessionStore: SessionStore;
  atMentionEvents: EventEmitter<string>;
  selectionEvents: EventEmitter<any>;
}

export function useRuntime(): RuntimeInstance {
  // 复用全局 Transport 实例，确保同一 Webview 宿主只存在一条通信通道
  const connectionManager = new ConnectionManager(() => transport);
  const appContext = new AppContext(connectionManager);

  // 创建 alien-signal 用于 SessionContext
  // AppContext.currentSelection 是 alien-signal，SessionContext 也需要 alien-signal
  const currentSelectionSignal = signal<SelectionRange | undefined>(undefined);

  // 使用 alien-signals 的 effect 同步信号（Vue watch 无法追踪 alien-signal）
  const cleanupSelectionSync = effect(() => {
    currentSelectionSignal(appContext.currentSelection());
  });

  const sessionStore = new SessionStore(connectionManager, {
    commandRegistry: appContext.commandRegistry,
    currentSelection: currentSelectionSignal,
    fileOpener: appContext.fileOpener,
    showNotification: appContext.showNotification?.bind(appContext),
    startNewConversationTab: appContext.startNewConversationTab?.bind(appContext),
    renameTab: appContext.renameTab?.bind(appContext),
    openURL: appContext.openURL.bind(appContext)
  });

  selectionEvents.add((selection) => {
    appContext.currentSelection(selection ?? undefined);
  });

  // SessionStore 内部的 effect 会自动监听 connection 建立并拉取会话列表

  // 监听 claudeConfig 变化并注册 Slash Commands
  let slashCommandDisposers: Array<() => void> = [];

  const cleanupSlashCommands = effect(() => {
    const connection = connectionManager.connection();
    const claudeConfig = connection?.claudeConfig();

    // 清理旧的 Slash Commands
    slashCommandDisposers.forEach(dispose => dispose());
    slashCommandDisposers = [];

    // 注册新的 Slash Commands
    if (claudeConfig?.slashCommands && Array.isArray(claudeConfig.slashCommands)) {
      slashCommandDisposers = claudeConfig.slashCommands
        .filter((cmd: any) => typeof cmd?.name === 'string' && cmd.name)
        .map((cmd: any) => {
          return appContext.commandRegistry.registerAction(
            {
              id: `slash-command-${cmd.name}`,
              label: `/${cmd.name}`,
              description: typeof cmd?.description === 'string' ? cmd.description : undefined
            },
            'Slash Commands',
            () => {
              console.log('[Runtime] Execute slash command:', cmd.name);
              const activeSession = sessionStore.activeSession();
              if (activeSession) {
                void activeSession.send(`/${cmd.name}`, [], false);
              } else {
                console.warn('[Runtime] No active session to execute slash command');
              }
            }
          );
        });

      console.log('[Runtime] Registered', slashCommandDisposers.length, 'slash commands');
    }
  });

  onMounted(() => {
    let disposed = false;

    (async () => {
      const connection = await connectionManager.get();
      try { await connection.opened; } catch (e) { console.error('[runtime] open failed', e); return; }

      if (disposed) return;

      try {
        const selection = await connection.getCurrentSelection();
        if (!disposed) appContext.currentSelection(selection?.selection ?? undefined);
      } catch (e) { console.warn('[runtime] selection fetch failed', e); }

      try {
        const assets = await connection.getAssetUris();
        if (!disposed) appContext.assetUris(assets.assetUris);
      } catch (e) { console.warn('[runtime] assets fetch failed', e); }

      await sessionStore.listSessions();
      if (!disposed && !sessionStore.activeSession()) {
        await sessionStore.createSession({ isExplicit: false });
      }
    })();

    onUnmounted(() => {
      disposed = true;

      // 清理命令注册
      slashCommandDisposers.forEach(dispose => dispose());
      cleanupSlashCommands();
      cleanupSelectionSync();

      connectionManager.close();
    });
  });

  return { connectionManager, appContext, sessionStore, atMentionEvents, selectionEvents };
}

