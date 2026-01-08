import { signal, computed, effect } from 'alien-signals';
import type { BaseTransport } from '../transport/BaseTransport';
import type { PermissionRequest } from './PermissionRequest';
import type { ModelOption } from '../../../shared/messages';
import type { SessionSummary } from './types';
import type { PermissionMode } from '@anthropic-ai/claude-agent-sdk';
import { processAndAttachMessage /*, mergeConsecutiveReadMessages */ } from '../utils/messageUtils';
import { Message as MessageModel } from '../models/Message';
import type { Message } from '../models/Message';
import { StreamingController } from './StreamingController';

export interface SelectionRange {
  filePath: string;
  startLine: number;
  endLine: number;
  startColumn?: number;
  endColumn?: number;
  selectedText?: string;
}

export interface UsageData {
  totalTokens: number;
  totalCost: number;
  contextWindow: number;
}

export interface AttachmentPayload {
  fileName: string;
  mediaType: string;
  data: string;
  fileSize?: number;
}

const IMAGE_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;

export interface SessionOptions {
  isExplicit?: boolean;
  existingWorktree?: { name: string; path: string };
  resumeId?: string;
}

export interface SessionContext {
  currentSelection: ReturnType<typeof signal<SelectionRange | undefined>>;
  commandRegistry: { registerAction: (...args: any[]) => void };
  fileOpener: {
    open: (filePath: string, location?: any) => Promise<void> | void;
    openContent: (
      content: string,
      fileName: string,
      editable: boolean
    ) => Promise<string | undefined>;
  };
  showNotification?: (
    message: string,
    severity: 'info' | 'warning' | 'error',
    buttons?: string[],
    onlyIfNotVisible?: boolean
  ) => Promise<string | undefined>;
  startNewConversationTab?: (initialPrompt?: string) => boolean;
  renameTab?: (title: string) => boolean;
  openURL?: (url: string) => void;
}

export class Session {
  private readonly claudeChannelId = signal<string | undefined>(undefined);
  private currentConnectionPromise?: Promise<BaseTransport>;
  private lastSentSelection?: SelectionRange;
  private effectCleanup?: () => void;

  /**
   * Streaming controller for handling SDK stream events
   * CLEANUP: Disposed in dispose()
   */
  private readonly streamingController: StreamingController;

  readonly connection = signal<BaseTransport | undefined>(undefined);

  readonly busy = signal(false);
  readonly isLoading = signal(false);
  readonly error = signal<string | undefined>(undefined);
  readonly sessionId = signal<string | undefined>(undefined);
  readonly isExplicit = signal(false);
  readonly lastModifiedTime = signal<number>(Date.now());
  readonly messages = signal<Message[]>([]);
  readonly messageCount = signal<number>(0);
  readonly cwd = signal<string | undefined>(undefined);
  readonly permissionMode = signal<PermissionMode>('default');
  readonly summary = signal<string | undefined>(undefined);
  readonly modelSelection = signal<string | undefined>(undefined);
  readonly thinkingLevel = signal<string>('default_on');
  readonly todos = signal<any[]>([]);
  readonly worktree = signal<{ name: string; path: string } | undefined>(undefined);
  readonly selection = signal<SelectionRange | undefined>(undefined);
  readonly usageData = signal<UsageData>({
    totalTokens: 0,
    totalCost: 0,
    contextWindow: 200000
  });

  readonly claudeConfig = computed(() => {
    const conn = this.connection();
    return conn?.claudeConfig?.();
  });

  readonly config = computed(() => {
    const conn = this.connection();
    return conn?.config?.();
  });

  readonly permissionRequests = computed<PermissionRequest[]>(() => {
    const conn = this.connection();
    const channelId = this.claudeChannelId();
    if (!conn || !channelId) {
      return [];
    }

    return conn
      .permissionRequests()
      .filter((request) => request.channelId === channelId);
  });

  isOffline(): boolean {
    return (
      !this.connection() &&
      !!this.sessionId() &&
      this.messages().length === 0 &&
      !this.currentConnectionPromise
    );
  }

  constructor(
    private readonly connectionProvider: () => Promise<BaseTransport>,
    private readonly context: SessionContext,
    options: SessionOptions = {}
  ) {
    this.isExplicit(options.isExplicit ?? true);

    // Initialize streaming controller with callbacks
    this.streamingController = new StreamingController();
    this.setupStreamingCallbacks();

    effect(() => {
      this.selection(this.context.currentSelection());
    });
  }

  /**
   * Set up streaming controller callbacks
   */
  private setupStreamingCallbacks(): void {
    // Called when a new streaming message is created
    this.streamingController.setOnMessageCreated((message, _parentToolUseId) => {
      // Add streaming message to messages array
      this.messages([...this.messages(), message]);
    });

    // Called when a streaming message is finalized
    this.streamingController.setOnMessageFinalized((_message, _parentToolUseId) => {
      // Message is already in the array from onMessageCreated
      // Just trigger a re-render by updating the signal
      this.messages([...this.messages()]);
    });

    // Called when usage data is updated
    this.streamingController.setOnUsageUpdate((usage) => {
      this.updateUsage(usage);
    });
  }

  static fromServer(
    summary: SessionSummary,
    connectionProvider: () => Promise<BaseTransport>,
    context: SessionContext
  ): Session {
    const session = new Session(connectionProvider, context, { isExplicit: true });
    session.sessionId(summary.id);
    session.lastModifiedTime(summary.lastModified);
    session.summary(summary.summary);
    session.worktree(summary.worktree);
    session.messageCount(summary.messageCount ?? 0);  // 保存服务器返回的消息数量
    return session;
  }

  async getConnection(): Promise<BaseTransport> {
    const current = this.connection();
    if (current) {
      return current;
    }
    if (this.currentConnectionPromise) {
      return this.currentConnectionPromise;
    }

    this.currentConnectionPromise = this.connectionProvider().then((conn) => {
      this.connection(conn);
      return conn;
    });

    return this.currentConnectionPromise;
  }

  async preloadConnection(): Promise<void> {
    await this.getConnection();
    await this.launchClaude();
  }

  async loadFromServer(): Promise<void> {
    const sessionId = this.sessionId();
    if (!sessionId) return;

    this.isLoading(true);
    try {
      const connection = await this.getConnection();
      const response = await connection.getSession(sessionId);
      const accumulator: Message[] = [];
      for (const raw of response?.messages ?? []) {
        this.processMessage(raw);
        // 使用 processAndAttachMessage 来绑定 tool_result
        // 这样历史消息中的 tool_result 也会正确绑定到 tool_use
        processAndAttachMessage(accumulator, raw);
      }
      // 移除 ReadCoalesced 合并逻辑
      // this.messages(mergeConsecutiveReadMessages(accumulator));
      this.messages(accumulator);
      await this.launchClaude();
    } finally {
      this.isLoading(false);
    }
  }

  async send(
    input: string,
    attachments: AttachmentPayload[] = [],
    includeSelection = false
  ): Promise<void> {
    const connection = await this.getConnection();

    // 官方路线：不在 slash 命令时临时切换 thinkingLevel，保持会话一致性，
    // 由 SDK/服务端在 assistant 消息中提供 thinking/redacted_thinking 块以满足约束
    const isSlash = this.isSlashCommand(input);

    // 启动 channel（确保已带上当前 thinkingLevel）
    await this.launchClaude();

    const shouldIncludeSelection = includeSelection && !isSlash;
    let selectionPayload: SelectionRange | undefined;

    if (shouldIncludeSelection && !this.isSameSelection(this.lastSentSelection, this.selection())) {
      selectionPayload = this.selection();
      this.lastSentSelection = selectionPayload;
    }

    const userMessage = this.buildUserMessage(input, attachments, selectionPayload);
    const messageModel = MessageModel.fromRaw(userMessage);

    if (messageModel) {
      this.messages([...this.messages(), messageModel]);
    }

    if (!this.summary()) {
      this.summary(input);
    }
    this.isExplicit(false);
    this.lastModifiedTime(Date.now());
    this.busy(true);

    try {
      const channelId = this.claudeChannelId();
      if (!channelId) throw new Error('No active channel');
      connection.sendInput(channelId, userMessage, false);
    } catch (error) {
      this.busy(false);
      throw error;
    }
  }

  async launchClaude(): Promise<string> {
    const existingChannel = this.claudeChannelId();
    if (existingChannel) {
      return existingChannel;
    }

    this.error(undefined);
    const channelId = Math.random().toString(36).slice(2);
    this.claudeChannelId(channelId);

    const connection = await this.getConnection();

    if (!this.cwd()) {
      this.cwd(connection.config()?.defaultCwd);
    }

    if (!this.modelSelection()) {
      this.modelSelection(connection.config()?.modelSetting);
    }

    if (!this.thinkingLevel()) {
      this.thinkingLevel(connection.config()?.thinkingLevel || 'default_on');
    }

    const stream = connection.launchClaude(
      channelId,
      this.sessionId() ?? undefined,
      this.cwd() ?? undefined,
      this.modelSelection() ?? undefined,
      this.permissionMode(),
      this.thinkingLevel()
    );

    void this.readMessages(stream);
    return channelId;
  }

  async interrupt(): Promise<void> {
    const channelId = this.claudeChannelId();
    if (!channelId) {
      return;
    }
    const connection = await this.getConnection();
    connection.interruptClaude(channelId);
  }

  async restartClaude(): Promise<void> {
    await this.interrupt();
    this.claudeChannelId(undefined);
    this.busy(false);
    await this.launchClaude();
  }

  async listFiles(pattern?: string, signal?: AbortSignal): Promise<any> {
    const connection = await this.getConnection();
    return connection.listFiles(pattern, signal);
  }

  async setPermissionMode(mode: PermissionMode, applyToConnection = true): Promise<boolean> {
    const previous = this.permissionMode();
    this.permissionMode(mode);

    const channelId = this.claudeChannelId();
    if (!channelId || !applyToConnection) {
      return true;
    }
    const connection = await this.getConnection();
    const success = await connection.setPermissionMode(channelId, mode);
    if (!success) {
      this.permissionMode(previous);
    }
    return success;
  }

  async setModel(model: ModelOption): Promise<boolean> {
    const previous = this.modelSelection();
    this.modelSelection(model.value);

    const channelId = this.claudeChannelId();
    if (!channelId) {
      return true;
    }

    const connection = await this.getConnection();
    const response = await connection.setModel(channelId, model);

    if (!response?.success) {
      this.modelSelection(previous);
      return false;
    }

    return true;
  }

  async setThinkingLevel(level: string): Promise<void> {
    this.thinkingLevel(level);

    const channelId = this.claudeChannelId();
    if (!channelId) {
      return;
    }

    const connection = await this.getConnection();
    await connection.setThinkingLevel(channelId, level);
  }

  async getMcpServers(): Promise<any> {
    const connection = await this.getConnection();
    const channelId = await this.launchClaude();
    return connection.getMcpServers(channelId);
  }

  async openConfigFile(configType: string): Promise<void> {
    const connection = await this.getConnection();
    await connection.openConfigFile(configType);
  }

  onPermissionRequested(callback: (request: PermissionRequest) => void): () => void {
    const connection = this.connection();
    if (!connection) {
      return () => {};
    }

    return connection.permissionRequested.add((request) => {
      // 动态获取当前 channelId，避免闭包捕获旧值
      if (request.channelId === this.claudeChannelId()) {
        callback(request);
      }
    });
  }

  dispose(): void {
    // CLEANUP: Stop effect watchers
    if (this.effectCleanup) {
      this.effectCleanup();
    }

    // CLEANUP: Dispose streaming controller
    this.streamingController.dispose();
  }

  private async readMessages(stream: AsyncIterable<any>): Promise<void> {
    try {
      for await (const event of stream) {
        this.processIncomingMessage(event);
      }
    } catch (error) {
      this.error(error instanceof Error ? error.message : String(error));
      this.busy(false);
    } finally {
      this.claudeChannelId(undefined);
    }
  }

  private processIncomingMessage(event: any): void {
    // Route stream_event to streaming controller for real-time streaming
    if (event?.type === 'stream_event') {
      const streamEvent = event.event;
      const parentToolUseId = event.parent_tool_use_id ?? null;
      this.streamingController.handleStreamEvent(streamEvent, parentToolUseId);
      return; // Stream events are fully handled by controller
    }

    // 1. Get current messages array (as mutable copy)
    const currentMessages = [...this.messages()] as Message[];

    // 2. Process special messages (TodoWrite, usage, etc.)
    this.processMessage(event);

    // 3. Use utility function to process message:
    //    - Attach tool_result to tool_use (reactive update)
    //    - Convert raw event to Message and add to array
    processAndAttachMessage(currentMessages, event);

    // 4. Update messages signal
    this.messages(currentMessages);

    // 5. Update other state
    if (event?.type === 'system') {
      this.sessionId(event.session_id);
      if (event.subtype === 'init') {
        this.busy(true);
      }
    } else if (event?.type === 'result') {
      this.busy(false);
    }
  }

  /**
   * 处理特殊消息（TodoWrite, usage 统计）
   */
  private processMessage(event: any): void {
    if (
      event.type === 'assistant' &&
      event.message?.content &&
      Array.isArray(event.message.content)
    ) {
      // 处理 TodoWrite
      for (const block of event.message.content) {
        if (
          block.type === 'tool_use' &&
          block.name === 'TodoWrite' &&
          block.input &&
          typeof block.input === 'object' &&
          'todos' in block.input
        ) {
          this.todos(block.input.todos);
        }
      }

      // 处理 usage 统计
      if (event.message.usage) {
        this.updateUsage(event.message.usage);
      }
    }
  }

  /**
   * 更新 token 使用统计
   */
  private updateUsage(usage: any): void {
    const totalTokens =
      usage.input_tokens +
      (usage.cache_creation_input_tokens ?? 0) +
      (usage.cache_read_input_tokens ?? 0) +
      usage.output_tokens;

    const current = this.usageData();
    this.usageData({
      totalTokens,
      totalCost: current.totalCost,
      contextWindow: current.contextWindow
    });
  }

  private buildUserMessage(
    input: string,
    attachments: AttachmentPayload[],
    selection?: SelectionRange
  ): any {
    const content: any[] = [];

    if (selection?.selectedText) {
      content.push({
        type: 'text',
        text: `<ide_selection>The user selected the lines ${selection.startLine} to ${selection.endLine} from ${selection.filePath}:
${selection.selectedText}

This may or may not be related to the current task.</ide_selection>`
      });
    }

    for (const attachment of attachments) {
      const { fileName, mediaType, data } = attachment;
      if (!data) {
        console.error(`Attachment missing data: ${fileName}`);
        continue;
      }

      const normalizedType = (mediaType || 'application/octet-stream').toLowerCase();

      if (IMAGE_MEDIA_TYPES.includes(normalizedType as (typeof IMAGE_MEDIA_TYPES)[number])) {
        content.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: normalizedType,
            data
          }
        });
        continue;
      }

      if (normalizedType === 'text/plain') {
        try {
          const decoded = typeof globalThis.atob === 'function' ? globalThis.atob(data) : '';
          content.push({
            type: 'document',
            source: {
              type: 'text',
              media_type: 'text/plain',
              data: decoded
            },
            title: fileName
          });
          continue;
        } catch (error) {
          console.error('Failed to decode text attachment', error);
        }
      }

      if (normalizedType === 'application/pdf') {
        content.push({
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data
          },
          title: fileName
        });
        continue;
      }

      console.error(`Unsupported attachment type: ${fileName} (${normalizedType})`);
    }

    content.push({ type: 'text', text: input });

    return {
      type: 'user',
      session_id: '',
      parent_tool_use_id: null,
      message: {
        role: 'user',
        content
      }
    };
  }

  private isSlashCommand(input: string): boolean {
    return input.trim().startsWith('/');
  }

  private isSameSelection(a?: SelectionRange, b?: SelectionRange): boolean {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return (
      a.filePath === b.filePath &&
      a.startLine === b.startLine &&
      a.endLine === b.endLine &&
      a.startColumn === b.startColumn &&
      a.endColumn === b.endColumn &&
      a.selectedText === b.selectedText
    );
  }
}
