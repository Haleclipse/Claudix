import { signal } from "alien-signals";
import { AsyncQueue } from "./AsyncQueue";
import { EventEmitter } from "../utils/events";
import { PermissionRequest } from "../core/PermissionRequest";
import type { PermissionResult, PermissionMode } from "@anthropic-ai/claude-agent-sdk";
import type {
  ExtensionRequestResponse,
  ExtensionToWebViewMessage,
  GetClaudeStateResponse,
  InitResponse,
  RequestMessage,
  ToolPermissionRequest,
  WebViewToExtensionMessage,
  WebViewRequest,
  ShowNotificationRequest,
} from "../../../shared/messages";

type ConnectionState = "connecting" | "connected" | "disconnected";

interface RequestHandler {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
}

/**
 * WebView ↔ Extension 传输抽象基类
 * - 使用 alien-signals 管理状态（统一架构）
 */
export abstract class BaseTransport {
  readonly state = signal<ConnectionState>("connecting");
  readonly isVisible = signal(true);
  readonly permissionRequests = signal<PermissionRequest[]>([]);
  readonly config = signal<InitResponse["state"] | undefined>(undefined);
  readonly claudeConfig = signal<GetClaudeStateResponse["config"] | undefined>(undefined);

  get opened(): Promise<void> {
    return Promise.resolve();
  }
  get closed(): Promise<void> {
    return Promise.resolve();
  }

  readonly permissionRequested: EventEmitter<PermissionRequest> =
    new EventEmitter<PermissionRequest>();

  protected readonly fromHost = new AsyncQueue<ExtensionToWebViewMessage>();
  protected readonly streams = new Map<string, AsyncQueue<any>>();
  protected readonly outstandingRequests = new Map<string, RequestHandler>();

  constructor(
    protected readonly atMentionEvents: EventEmitter<string>,
    protected readonly selectionChangedEvents: EventEmitter<any>
  ) {
    void this.readMessages();
  }

  protected abstract send(message: WebViewToExtensionMessage): void;

  async initialize(): Promise<void> {
    const initResponse = await this.sendRequest<InitResponse>({ type: "init" });
    this.config({
      defaultCwd: initResponse.state.defaultCwd,
      openNewInTab: initResponse.state.openNewInTab ?? false,
      modelSetting: initResponse.state.modelSetting,
      platform: initResponse.state.platform,
      thinkingLevel: initResponse.state.thinkingLevel,
      initialPermissionMode: initResponse.state.initialPermissionMode,
    } as InitResponse["state"]);

    const claudeState = await this.sendRequest<GetClaudeStateResponse>({
      type: "get_claude_state",
    });
    this.claudeConfig(claudeState.config);
    this.state("connected");
  }

  launchClaude(
    channelId: string,
    resume?: string,
    cwd?: string,
    model?: string,
    permissionMode?: PermissionMode,
    thinkingLevel?: string
  ): AsyncQueue<any> {
    const queue = new AsyncQueue<any>();
    this.streams.set(channelId, queue);
    this.send({
      type: "launch_claude",
      channelId,
      resume,
      cwd,
      model,
      permissionMode,
      thinkingLevel,
    });
    return queue;
  }

  sendInput(channelId: string, message: any, done: boolean): void {
    this.send({ type: "io_message", channelId, message, done });
  }

  interruptClaude(channelId: string): void {
    this.send({ type: "interrupt_claude", channelId });
  }

  openFile(filePath: string, location?: any): Promise<any> {
    return this.sendRequest({ type: "open_file", filePath, location });
  }
  openConfigFile(configType: string): Promise<any> {
    return this.sendRequest({ type: "open_config_file", configType });
  }
  getMcpServers(channelId?: string): Promise<any> {
    return this.sendRequest({ type: "get_mcp_servers" }, channelId);
  }

  async openContent(
    content: string,
    fileName: string,
    editable: boolean,
    signal?: AbortSignal
  ): Promise<string | undefined> {
    const response = await this.sendRequest(
      { type: "open_content", content, fileName, editable },
      undefined,
      signal
    );
    return (response as any).updatedContent;
  }

  async openDiff(
    originalFilePath: string,
    newFilePath: string,
    edits: any[],
    supportMultiEdits: boolean,
    signal?: AbortSignal
  ): Promise<any[]> {
    const response = await this.sendRequest(
      {
        type: "open_diff",
        originalFilePath,
        newFilePath,
        edits,
        supportMultiEdits,
      },
      undefined,
      signal
    );
    return (response as any).newEdits;
  }

  async setPermissionMode(channelId: string, mode: PermissionMode): Promise<boolean> {
    const response = await this.sendRequest(
      { type: "set_permission_mode", mode },
      channelId
    );
    return !!(response as any).success;
  }

  async setModel(channelId: string, model: any): Promise<any> {
    return this.sendRequest({ type: "set_model", model }, channelId);
  }

  async setThinkingLevel(channelId: string, thinkingLevel: string): Promise<void> {
    await this.sendRequest({ type: "set_thinking_level", channelId, thinkingLevel }, channelId);
  }

  listSessions(): Promise<any> {
    return this.sendRequest({ type: "list_sessions_request" });
  }
  getSession(sessionId: string): Promise<any> {
    return this.sendRequest({ type: "get_session_request", sessionId });
  }
  listFiles(pattern?: string): Promise<any> {
    return this.sendRequest({ type: "list_files_request", pattern });
  }
  startNewConversationTab(initialPrompt?: string): Promise<any> {
    return this.sendRequest({
      type: "new_conversation_tab",
      initialPrompt,
    } as any);
  }
  renameTab(title: string): Promise<any> {
    return this.sendRequest({ type: "rename_tab", title } as any);
  }
  openClaudeInTerminal(): Promise<any> {
    return this.sendRequest({ type: "open_claude_in_terminal" });
  }
  openURL(url: string): void {
    void this.sendRequest({ type: "open_url", url });
  }
  exec(command: string, params: string[]): Promise<any> {
    return this.sendRequest({ type: "exec", command, params });
  }
  getCurrentSelection(): Promise<any> {
    return this.sendRequest({ type: "get_current_selection" });
  }
  getAssetUris(): Promise<any> {
    return this.sendRequest({ type: "get_asset_uris" });
  }

  showNotification(
    message: string,
    severity: ShowNotificationRequest["severity"],
    buttons?: string[],
    onlyIfNotVisible?: boolean
  ): Promise<string | undefined> {
    return this.sendRequest({
      type: "show_notification",
      message,
      severity,
      buttons,
      onlyIfNotVisible,
    }).then((r: any) => r.buttonValue);
  }

  onPermissionRequested(callback: (request: PermissionRequest) => void): void {
    this.permissionRequested.add(callback);
  }

  close(): void {
    /* no-op */
  }

  protected async sendRequest<TResponse = any>(
    request: WebViewRequest,
    channelId?: string,
    abortSignal?: AbortSignal
  ): Promise<TResponse> {
    const requestId = Math.random().toString(36).slice(2);
    const abortHandler = () => {
      this.cancelRequest(requestId);
    };
    if (abortSignal)
      abortSignal.addEventListener("abort", abortHandler, { once: true });

    return new Promise<TResponse>((resolve, reject) => {
      this.outstandingRequests.set(requestId, { resolve, reject });
      this.send({ type: "request", channelId, requestId, request });
    }).finally(() => {
      if (abortSignal) abortSignal.removeEventListener("abort", abortHandler);
    });
  }

  protected cancelRequest(requestId: string): void {
    this.send({ type: "cancel_request", targetRequestId: requestId });
  }

  private async readMessages(): Promise<void> {
    try {
      for await (const message of this.fromHost) {
        switch (message.type) {
          case "io_message": {
            const stream = this.streams.get(message.channelId);
            if (stream) stream.enqueue(message.message);
            else
              console.warn(
                `[BaseTransport] Missing stream for ${message.channelId}`
              );
            break;
          }
          case "close_channel": {
            const stream = this.streams.get(message.channelId);
            if (stream) {
              if (message.error) stream.error(new Error(message.error));
              stream.done();
              // 延迟删除，给尾部 io_message/result 留出时间片
              setTimeout(() => {
                this.streams.delete(message.channelId);
              }, 50);
            } else {
              this.streams.delete(message.channelId);
            }
            break;
          }
          case "request":
            await this.processRequest(message as RequestMessage);
            break;
          case "response": {
            const handler = this.outstandingRequests.get(message.requestId);
            if (!handler) {
              console.warn(
                `[BaseTransport] No handler for response ${message.requestId}`
              );
              break;
            }
            const response = (message as any).response;
            if (response && (response as any).type === "error")
              handler.reject(new Error((response as any).error));
            else handler.resolve(response);
            this.outstandingRequests.delete(message.requestId);
            break;
          }
          default:
            console.warn(
              `[BaseTransport] Unknown message type ${(message as any).type}`
            );
        }
      }
    } catch (error) {
      for (const stream of this.streams.values()) stream.error(error);
    } finally {
      for (const stream of this.streams.values()) stream.done();
      this.streams.clear();
    }
  }

  private async processRequest(message: RequestMessage): Promise<void> {
    const req: any = (message as any).request;
    switch (req.type) {
      case "tool_permission_request": {
        const response = await this.handleToolPermissionRequest(
          (message.channelId ?? "") as string,
          req as ToolPermissionRequest
        );
        this.send({ type: "response", requestId: message.requestId, response });
        break;
      }
      case "insert_at_mention": {
        if (this.isVisible()) this.atMentionEvents.emit(req.text);
        break;
      }
      case "selection_changed": {
        this.selectionChangedEvents.emit(req.selection);
        break;
      }
      case "visibility_changed": {
        this.isVisible(req.isVisible);
        break;
      }

      case "update_state": {
        this.config({
          defaultCwd: req.state.defaultCwd,
          openNewInTab: req.state.openNewInTab,
          modelSetting: req.state.modelSetting,
          platform: req.state.platform,
          thinkingLevel: req.state.thinkingLevel,
        } as InitResponse["state"]);
        this.claudeConfig(req.config);
        break;
      }
      default:
        console.warn("[BaseTransport] Unhandled request", req);
    }
  }

  private async handleToolPermissionRequest(
    channelId: string,
    request: ToolPermissionRequest
  ): Promise<ExtensionRequestResponse> {
    let trackedRequest: PermissionRequest | undefined;
    return new Promise<ExtensionRequestResponse>((resolve) => {
      const permissionRequest = new PermissionRequest(
        channelId,
        request.toolName,
        request.inputs,
        request.suggestions ?? []
      );
      trackedRequest = permissionRequest;

      permissionRequest.onResolved((resolution: PermissionResult) => {
        resolve({ type: "tool_permission_response", result: resolution });
        this.permissionRequests(
          this.permissionRequests().filter((i) => i !== permissionRequest)
        );
      });

      this.permissionRequests([
        ...this.permissionRequests(),
        permissionRequest,
      ]);
      this.permissionRequested.emit(permissionRequest);
    }).finally(() => {
      if (trackedRequest) {
        this.permissionRequests(
          this.permissionRequests().filter((i) => i !== trackedRequest)
        );
      }
    });
  }
}
