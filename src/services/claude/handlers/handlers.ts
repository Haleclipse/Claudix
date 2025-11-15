/**
 * Claude Agent Handlers - 统一处理器文件
 *
 * 职责：处理所有来自 WebView 的请求
 * 依赖：通过 HandlerContext 注入所有服务
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execFile } from 'child_process';
import type {
    InitRequest,
    InitResponse,
    GetClaudeStateRequest,
    GetClaudeStateResponse,
    GetMcpServersRequest,
    GetMcpServersResponse,
    GetAssetUrisRequest,
    GetAssetUrisResponse,
    OpenFileRequest,
    OpenFileResponse,
    GetCurrentSelectionResponse,
    ShowNotificationRequest,
    ShowNotificationResponse,
    NewConversationTabRequest,
    NewConversationTabResponse,
    RenameTabRequest,
    RenameTabResponse,
    OpenDiffRequest,
    OpenDiffResponse,
    ListSessionsRequest,
    ListSessionsResponse,
    GetSessionRequest,
    GetSessionResponse,
    ExecRequest,
    ExecResponse,
    ListFilesRequest,
    ListFilesResponse,
    OpenContentRequest,
    OpenContentResponse,
    OpenURLRequest,
    OpenURLResponse,
    // GetAuthStatusRequest,
    // GetAuthStatusResponse,
    // LoginRequest,
    // LoginResponse,
    // SubmitOAuthCodeRequest,
    // SubmitOAuthCodeResponse,
    OpenConfigFileRequest,
    OpenConfigFileResponse,
    OpenClaudeInTerminalRequest,
    OpenClaudeInTerminalResponse,
} from '../../../shared/messages';
import type { HandlerContext } from './types';
import type { PermissionMode, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { AsyncStream } from '../transport/AsyncStream';

// ============================================================================
// 常量定义
// ============================================================================

const DEFAULT_EXCLUDE_PATTERNS = [
    '**/node_modules/**',
    '**/.git/**',
    '**/dist/**',
    '**/build/**',
    '**/.next/**',
    '**/.nuxt/**',
    '**/.DS_Store',
    '**/Thumbs.db',
    '**/*.log',
    '**/.env',
    '**/.env.*',
    '**/yarn-error.log',
    '**/npm-debug.log*'
] as const;

// ============================================================================
// Handler 实现
// ============================================================================

/**
 * 初始化请求
 */
export async function handleInit(
    _request: InitRequest,
    context: HandlerContext
): Promise<InitResponse> {
    const { configService, workspaceService, logService, agentService } = context;

    logService.info('[handleInit] 处理初始化请求');

    // TODO: 从 AuthManager 获取认证状态
    // const authStatus = null;

    // 获取模型设置
    const modelSetting = configService.getValue<string>('claudix.selectedModel') || 'default';

    // 获取默认工作目录
    const defaultCwd = workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath || process.cwd();

    // TODO: 从配置获取 openNewInTab
    const openNewInTab = false;

    // 获取 thinking level (默认值)
    const thinkingLevel = 'default_on';

    // 获取初始权限模式（默认 default）
    const initialPermissionModeSetting = configService.getValue<string>('claudix.initialPermissionMode');
    const initialPermissionMode: PermissionMode = (initialPermissionModeSetting as PermissionMode) || 'default';

    return {
        type: "init_response",
        state: {
            defaultCwd,
            openNewInTab,
            // authStatus,
            modelSetting,
            platform: process.platform,
            thinkingLevel,
            initialPermissionMode
        }
    };
}

/**
 * 获取 Claude 状态
 */
export async function handleGetClaudeState(
    _request: GetClaudeStateRequest,
    context: HandlerContext
): Promise<GetClaudeStateResponse> {
    const { logService } = context;

    logService.info('[handleGetClaudeState] 获取 Claude 状态');

    const config = await loadConfig(context);

    return {
        type: "get_claude_state_response",
        config
    };
}

/**
 * 获取 MCP 服务器
 */
export async function handleGetMcpServers(
    _request: GetMcpServersRequest,
    context: HandlerContext,
    channelId?: string
): Promise<GetMcpServersResponse> {
    return await getMcpServers(context, channelId);
}

/**
 * 获取资源 URI
 */
export async function handleGetAssetUris(
    _request: GetAssetUrisRequest,
    context: HandlerContext
): Promise<GetAssetUrisResponse> {
    return {
        type: "asset_uris_response",
        assetUris: getAssetUris(context)
    };
}

/**
 * 打开文件
 */
export async function handleOpenFile(
    request: OpenFileRequest,
    context: HandlerContext
): Promise<OpenFileResponse> {
    const { logService } = context;
    const { filePath, location } = request;

    try {
        const resolvedPath = await resolveExistingPath(filePath, context);
        const stat = await fs.promises.stat(resolvedPath);
        const uri = vscode.Uri.file(resolvedPath);

        if (stat.isDirectory()) {
            await vscode.commands.executeCommand("revealInExplorer", uri);
            return { type: "open_file_response" };
        }

        const doc = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(doc, { preview: false });

        if (location) {
            const startLine = Math.max((location.startLine ?? 1) - 1, 0);
            const endLine = Math.max((location.endLine ?? location.startLine ?? 1) - 1, startLine);
            const startColumn = Math.max(location.startColumn ?? 0, 0);
            const endColumn = Math.max(location.endColumn ?? startColumn, startColumn);

            const range = new vscode.Range(
                new vscode.Position(startLine, startColumn),
                new vscode.Position(endLine, endColumn)
            );

            editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
            editor.selection = new vscode.Selection(range.start, range.end);
        }

        return { type: "open_file_response" };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logService.error(`[handleOpenFile] 打开文件失败: ${errorMsg}`);
        throw new Error(`Failed to open file: ${errorMsg}`);
    }
}

/**
 * 获取当前编辑器选区
 */
export async function handleGetCurrentSelection(
    context: HandlerContext
): Promise<GetCurrentSelectionResponse> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty || editor.document.uri.scheme !== "file") {
        return {
            type: "get_current_selection_response",
            selection: null
        };
    }

    const document = editor.document;
    const selection = editor.selection;

    return {
        type: "get_current_selection_response",
        selection: {
            filePath: document.uri.fsPath,
            startLine: selection.start.line + 1,
            endLine: selection.end.line + 1,
            startColumn: selection.start.character,
            endColumn: selection.end.character,
            selectedText: document.getText(selection)
        }
    };
}

/**
 * 显示通知
 */
export async function handleShowNotification(
    request: ShowNotificationRequest,
    context: HandlerContext
): Promise<ShowNotificationResponse> {
    const { message, severity, buttons = [] } = request;

    let result: string | undefined;
    switch (severity) {
        case "error":
            result = await vscode.window.showErrorMessage(message, ...buttons);
            break;
        case "warning":
            result = await vscode.window.showWarningMessage(message, ...buttons);
            break;
        case "info":
        default:
            result = await vscode.window.showInformationMessage(message, ...buttons);
            break;
    }

    return {
        type: "show_notification_response",
        buttonValue: result
    };
}

/**
 * 新建会话标签页（聚焦侧边栏）
 */
export async function handleNewConversationTab(
    _request: NewConversationTabRequest,
    context: HandlerContext
): Promise<NewConversationTabResponse> {
    const { logService } = context;

    try {
        await vscode.commands.executeCommand("claudix.chatView.focus");
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logService.warn(`Failed to focus chat view: ${message}`);
    }
    return {
        type: "new_conversation_tab_response"
    };
}

/**
 * 重命名标签（目前仅占位）
 */
export async function handleRenameTab(
    _request: RenameTabRequest,
    context: HandlerContext
): Promise<RenameTabResponse> {
    return {
        type: "rename_tab_response"
    };
}

/**
 * 打开 Diff 编辑器
 */
export async function handleOpenDiff(
    request: OpenDiffRequest,
    context: HandlerContext,
    signal: AbortSignal
): Promise<OpenDiffResponse> {
    const { logService, workspaceService } = context;
    const cwd = workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath || process.cwd();

    logService.info(`Opening diff for: ${request.originalFilePath}`);

    const originalPath = resolveFilePath(request.originalFilePath, cwd);
    const fallbackNewPath = request.newFilePath ? resolveFilePath(request.newFilePath, cwd) : undefined;

    if (signal.aborted) {
        return {
            type: "open_diff_response",
            newEdits: request.edits
        };
    }

    const rightPath = await prepareDiffRightFile(originalPath, fallbackNewPath, request.edits);

    const leftExists = await pathExists(originalPath);
    const leftPath = leftExists
        ? originalPath
        : await createTempFile(path.basename(request.originalFilePath || request.newFilePath || "untitled"), "");

    const leftUri = vscode.Uri.file(leftPath);
    const rightUri = vscode.Uri.file(rightPath);

    const diffTitle = `${path.basename(request.originalFilePath || request.newFilePath || rightPath)} (Claude)`;

    await vscode.commands.executeCommand(
        "vscode.diff",
        leftUri,
        rightUri,
        diffTitle,
        { preview: true }
    );

    return {
        type: "open_diff_response",
        newEdits: request.edits
    };
}

/**
 * 列出历史会话
 */
export async function handleListSessions(
    _request: ListSessionsRequest,
    context: HandlerContext
): Promise<ListSessionsResponse> {
    const { logService, sessionService, workspaceService } = context;

    try {
        const cwd = workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath || process.cwd();
        const sessions = await sessionService.listSessions(cwd);

        // 添加 worktree 和 isCurrentWorkspace 字段
        const sessionsWithMeta = sessions.map(session => ({
            ...session,
            worktree: undefined,
            isCurrentWorkspace: true
        }));

        return {
            type: "list_sessions_response",
            sessions: sessionsWithMeta
        };
    } catch (error) {
        logService.error(`Failed to list sessions: ${error}`);
        return {
            type: "list_sessions_response",
            sessions: []
        };
    }
}

/**
 * 获取会话详情
 */
export async function handleGetSession(
    request: GetSessionRequest,
    context: HandlerContext
): Promise<GetSessionResponse> {
    const { logService, sessionService, workspaceService } = context;

    try {
        const cwd = workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath || process.cwd();
        const messages = await sessionService.getSession(request.sessionId, cwd);

        return {
            type: "get_session_response",
            messages
        };
    } catch (error) {
        logService.error(`Failed to get session: ${error}`);
        return {
            type: "get_session_response",
            messages: []
        };
    }
}

/**
 * 执行命令
 */
export async function handleExec(
    request: ExecRequest,
    context: HandlerContext
): Promise<ExecResponse> {
    const { workspaceService } = context;
    const cwd = workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath || process.cwd();
    const { command, params } = request;

    return new Promise<ExecResponse>((resolve) => {
        const { spawn } = require('child_process');
        let stdout = "";
        let stderr = "";

        const proc = spawn(command, params, {
            cwd,
            shell: false
        });

        proc.stdout?.on("data", (data: Buffer) => {
            stdout += data.toString();
        });

        proc.stderr?.on("data", (data: Buffer) => {
            stderr += data.toString();
        });

        proc.on("close", (code: number) => {
            resolve({
                type: "exec_response",
                stdout,
                stderr,
                exitCode: code || 0
            });
        });

        proc.on("error", (error: Error) => {
            resolve({
                type: "exec_response",
                stdout: "",
                stderr: error.message,
                exitCode: 1
            });
        });
    });
}

/**
 * 列出文件
 */
export async function handleListFiles(
    request: ListFilesRequest,
    context: HandlerContext
): Promise<ListFilesResponse> {
    const { pattern } = request;

    return {
        type: "list_files_response",
        files: await findFiles(pattern, context)
    };
}

/**
 * 打开内容（临时文件编辑）
 */
export async function handleOpenContent(
    request: OpenContentRequest,
    context: HandlerContext,
    signal: AbortSignal
): Promise<OpenContentResponse> {
    const { logService } = context;
    const { content, fileName, editable } = request;

    logService.info(`Opening content as: ${fileName} (editable: ${editable})`);

    if (!editable) {
        const document = await vscode.workspace.openTextDocument({
            content,
            language: detectLanguage(fileName)
        });
        await vscode.window.showTextDocument(document, { preview: true });

        return {
            type: "open_content_response"
        };
    }

    const tempPath = await createTempFile(fileName || "claude.txt", content);
    const tempUri = vscode.Uri.file(tempPath);
    const document = await vscode.workspace.openTextDocument(tempUri);
    await vscode.window.showTextDocument(document, { preview: false });

    const updatedContent = await waitForDocumentEdits(document, signal);

    return {
        type: "open_content_response",
        updatedContent
    };
}

/**
 * 打开 URL
 */
export async function handleOpenURL(
    request: OpenURLRequest,
    context: HandlerContext
): Promise<OpenURLResponse> {
    const { url } = request;

    try {
        await vscode.env.openExternal(vscode.Uri.parse(url));
        return { type: "open_url_response" };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to open URL: ${errorMsg}`);
    }
}

/**
 * 获取认证状态
 */
// export async function handleGetAuthStatus(
//     _request: GetAuthStatusRequest,
//     context: HandlerContext
// ): Promise<GetAuthStatusResponse> {
//     // TODO: 实现认证状态获取
//     // const status = authManager?.getAuthStatus();

//     return {
//         type: "get_auth_status_response",
//         status: null
//     };
// }

/**
 * 登录
 */
// export async function handleLogin(
//     request: LoginRequest,
//     context: HandlerContext
// ): Promise<LoginResponse> {
//     const { logService, agentService } = context;
//     const { method } = request;

//     // TODO: 实现认证流程
//     logService.info(`Login requested with method: ${method}`);

//     // 关闭所有现有通道
//     await agentService.closeAllChannelsWithCredentialChange();

//     return {
//         type: "login_response",
//         auth: {
//             authenticated: false
//         }
//     };
// }

/**
 * 提交 OAuth 代码
 */
// export async function handleSubmitOAuthCode(
//     request: SubmitOAuthCodeRequest,
//     context: HandlerContext
// ): Promise<SubmitOAuthCodeResponse> {
//     const { logService } = context;
//     const { code } = request;

//     // TODO: 实现 OAuth 代码提交
//     logService.info(`OAuth code submitted: ${code.substring(0, 10)}...`);

//     return {
//         type: "submit_oauth_code_response"
//     };
// }

/**
 * 打开配置文件
 */
export async function handleOpenConfigFile(
    request: OpenConfigFileRequest,
    context: HandlerContext
): Promise<OpenConfigFileResponse> {
    const { configType } = request;

    try {
        // VS Code 设置
        if (configType === "vscode") {
            await vscode.commands.executeCommand('workbench.action.openSettings', 'claudix');
        }
        // 用户配置文件
        else {
            const configPath = getConfigFilePath(configType);
            const uri = vscode.Uri.file(configPath);
            await vscode.window.showTextDocument(uri);
        }

        return { type: "open_config_file_response" };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to open config file: ${errorMsg}`);
    }
}

/**
 * 在终端打开 Claude
 */
export async function handleOpenClaudeInTerminal(
    _request: OpenClaudeInTerminalRequest,
    context: HandlerContext
): Promise<OpenClaudeInTerminalResponse> {
    const { workspaceService } = context;
    const cwd = workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath || process.cwd();

    try {
        const terminal = vscode.window.createTerminal({
            name: "Claude Code",
            cwd
        });

        terminal.show();
        terminal.sendText("claude --help");

        return { type: "open_claude_in_terminal_response" };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to open terminal: ${errorMsg}`);
    }
}

// ============================================================================
// 配置和状态管理
// ============================================================================

/**
 * 加载配置缓存
 */
async function loadConfig(context: HandlerContext): Promise<any> {
    const { logService, sdkService, workspaceService } = context;

    logService.info("Loading config cache by launching Claude...");

    const inputStream = new AsyncStream<SDKUserMessage>();
    const cwd = workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath || process.cwd();

    const query = await sdkService.query({
        inputStream,
        resume: null,
        canUseTool: async () => ({
            behavior: "deny" as const,
            message: "Config loading only"
        }),
        model: "default",
        cwd,
        permissionMode: "default"
    });

    inputStream.done();

    const config = {
        slashCommands: await (query as any).supportedCommands?.() || [],
        models: await (query as any).supportedModels?.() || [],
        accountInfo: await (query as any).accountInfo?.() || null
    };

    logService.info(`  - Config: [${JSON.stringify(config)}]`);
    await query.return?.();

    return config;
}

/**
 * 获取 MCP 服务器状态
 */
async function getMcpServers(
    context: HandlerContext,
    channelId?: string
): Promise<GetMcpServersResponse> {
    const { logService, agentService } = context;

    if (!channelId) {
        throw new Error('Channel ID is required');
    }

    // TODO: 通过 agentService 获取 channel
    // const channel = agentService.getChannel(channelId);

    try {
        return {
            type: "get_mcp_servers_response",
            // mcpServers: await channel.query.mcpServerStatus?.() || []
            mcpServers: []
        };
    } catch (error) {
        logService.error(`Error fetching MCP servers: ${error}`);
        return {
            type: "get_mcp_servers_response",
            mcpServers: []
        };
    }
}

/**
 * 获取资源 URI
 */
function getAssetUris(context: HandlerContext): Record<string, { light: string; dark: string }> {
    const { webViewService } = context;
    const webview = webViewService.getWebView();

    if (!webview) {
        return {};
    }

    const assets = {
        clawd: {
            light: path.join("resources", "clawd.svg"),
            dark: path.join("resources", "clawd.svg")
        },
        "welcome-art": {
            light: path.join("resources", "welcome-art-light.svg"),
            dark: path.join("resources", "welcome-art-dark.svg")
        }
    } as const;

    // TODO: 获取 extensionPath
    const extensionPath = process.cwd();

    const toWebviewUri = (relativePath: string) =>
        webview.asWebviewUri(
            vscode.Uri.file(path.join(extensionPath, relativePath))
        ).toString();

    return Object.fromEntries(
        Object.entries(assets).map(([key, value]) => [
            key,
            {
                light: toWebviewUri(value.light),
                dark: toWebviewUri(value.dark)
            }
        ])
    );
}

// ============================================================================
// 辅助方法
// ============================================================================

function resolveFilePath(filePath: string, cwd: string): string {
    if (!filePath) {
        return cwd;
    }

    const expanded = filePath.startsWith("~")
        ? path.join(os.homedir(), filePath.slice(1))
        : filePath;

    const absolute = path.isAbsolute(expanded)
        ? expanded
        : path.join(cwd, expanded);

    return path.normalize(absolute);
}

async function resolveExistingPath(filePath: string, context: HandlerContext): Promise<string> {
    const { workspaceService } = context;
    const cwd = workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath || process.cwd();

    const absoluteCandidate = resolveFilePath(filePath, cwd);
    if (await pathExists(absoluteCandidate)) {
        return absoluteCandidate;
    }

    const matches = await findFiles(filePath, context);
    if (matches.length > 0) {
        const candidate = matches[0].path;
        const absolute = resolveFilePath(candidate, cwd);
        if (await pathExists(absolute)) {
            return absolute;
        }
    }

    return absoluteCandidate;
}

async function pathExists(target: string): Promise<boolean> {
    try {
        await fs.promises.access(target, fs.constants.F_OK);
        return true;
    } catch {
        return false;
    }
}

async function findFiles(pattern: string | undefined, context: HandlerContext): Promise<ListFilesResponse["files"]> {
    const { logService } = context;

    if (!pattern || !pattern.trim()) {
        return [];
    }

    try {
        // 先用 ripgrep 获取文件结果
        const fileResults = await findFilesWithRipgrep(pattern, context);

        // 从 pattern 推断锚点目录及最后一个查询 token
        const anchorInfo = parseAnchorFromPattern(pattern, context);
        const dirResults: ListFilesResponse["files"] = [];

        // B) 若存在锚点目录，列出其子目录（体验更好）
        if (anchorInfo?.anchorAbs) {
            const childDirs = await collectChildDirs(anchorInfo.anchorAbs, anchorInfo.lastToken, context);
            childDirs.sort((a, b) => a.name.localeCompare(b.name))
            dirResults.push(...childDirs);
        }

        // A) 由文件结果推导父目录（仅保留名称匹配 token 的目录以减少噪声）
        const derived = deriveParentDirsFromFiles(fileResults, context, anchorInfo.lastToken);
        dirResults.push(...derived);

        // 合并并去重（目录唯一按 path）
        const seen = new Set<string>();
        const dirMerged: ListFilesResponse["files"] = [];
        for (const d of dirResults) {
            if (d && d.type === 'directory' && !seen.has(d.path)) {
                seen.add(d.path);
                dirMerged.push(d);
            }
        }

        // 合并顺序：有锚点 → 目录在前，文件在后；无锚点 → 先文件，后目录
        const merged: ListFilesResponse["files"] = [];
        if (anchorInfo.anchorAbs) {
            merged.push(...dirMerged, ...fileResults);
        } else {
            merged.push(...fileResults, ...dirMerged);
        }
        if (merged.length > 200) merged.length = 200
        return merged;
    } catch (error) {
        logService.warn(`[findFiles] ripgrep failed, falling back: ${error instanceof Error ? error.message : String(error)}`);
        // fallback 同样合并目录
        const fileResults = await findFilesWithWorkspaceSearch(pattern, context);
        const anchorInfo = parseAnchorFromPattern(pattern, context);
        const dirResults: ListFilesResponse["files"] = [];
        if (anchorInfo?.anchorAbs) {
            const childDirs = await collectChildDirs(anchorInfo.anchorAbs, anchorInfo.lastToken, context);
            childDirs.sort((a, b) => a.name.localeCompare(b.name))
            dirResults.push(...childDirs);
        }
        dirResults.push(...deriveParentDirsFromFiles(fileResults, context, anchorInfo.lastToken));
        const seen = new Set<string>();
        const dirMerged: ListFilesResponse["files"] = [];
        for (const d of dirResults) {
            if (d && d.type === 'directory' && !seen.has(d.path)) {
                seen.add(d.path);
                dirMerged.push(d);
            }
        }
        const merged: ListFilesResponse["files"] = [];
        if (anchorInfo.anchorAbs) {
            merged.push(...dirMerged, ...fileResults);
        } else {
            merged.push(...fileResults, ...dirMerged);
        }
        if (merged.length > 200) merged.length = 200
        return merged;
    }
}

async function findFilesWithWorkspaceSearch(
    pattern: string,
    context: HandlerContext
): Promise<ListFilesResponse["files"]> {
    const { workspaceService } = context;
    const cwd = workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath || process.cwd();

    const include = pattern.includes("*") || pattern.includes("?")
        ? pattern
        : `**/${pattern}`;

    const excludePatterns = buildExcludePatterns();
    const excludeGlob = toExcludeGlob(excludePatterns);

    let uris: vscode.Uri[];
    try {
        uris = await vscode.workspace.findFiles(include, excludeGlob, 200);
    } catch {
        const fallbackGlob = toExcludeGlob(Array.from(DEFAULT_EXCLUDE_PATTERNS));
        uris = await vscode.workspace.findFiles(include, fallbackGlob, 200);
    }

    const results: ListFilesResponse["files"] = [];
    for (const uri of uris) {
        const fsPath = uri.fsPath;
        let type: "file" | "directory" = "file";
        try {
            const stat = await fs.promises.stat(fsPath);
            if (stat.isDirectory()) {
                type = "directory";
            }
        } catch {
            // ignore stat errors, default to file
        }

        const relative = toWorkspaceRelative(fsPath, cwd);
        results.push({
            path: relative,
            name: path.basename(fsPath),
            type
        });
    }

    return results;
}

async function findFilesWithRipgrep(
    pattern: string,
    context: HandlerContext
): Promise<ListFilesResponse["files"]> {
    const { workspaceService } = context;
    const cwd = workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath || process.cwd();

    const args = ["--files", "--follow", "--hidden"];
    const excludePatterns = buildExcludePatterns();
    for (const glob of excludePatterns) {
        args.push("--glob", `!${glob}`);
    }

    const rawPaths = await execRipgrep(args, cwd, context);
    const prioritized = prioritizeRipgrepResults(rawPaths, pattern, cwd);

    const results: ListFilesResponse["files"] = [];
    for (const entry of prioritized) {
        let type: "file" | "directory" = "file";
        try {
            const stat = await fs.promises.stat(entry.absolute);
            if (stat.isDirectory()) {
                type = "directory";
            }
        } catch {
            // ignore stat errors
        }

        results.push({
            path: entry.relative,
            name: path.basename(entry.absolute),
            type
        });
    }

    return results;
}

// 从查询 pattern 解析锚点目录与最后 token（如 'src/com' => anchor: 'src', lastToken: 'com'）
function parseAnchorFromPattern(pattern: string, context: HandlerContext): { anchorAbs?: string; lastToken: string } {
    const { workspaceService } = context;
    const cwd = workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath || process.cwd();
    const p = pattern.trim();
    const idx = p.lastIndexOf('/')
    if (idx > 0) {
        const anchor = p.slice(0, idx);
        const lastToken = p.slice(idx + 1);
        const anchorAbs = normalizeAbsolutePath(anchor, cwd);
        return { anchorAbs, lastToken };
    } else {
        // 无锚点，仅返回最后 token（整体作为 token）
        return { lastToken: p };
    }
}

// 由文件结果推导父目录列表
function deriveParentDirsFromFiles(
    files: ListFilesResponse["files"],
    context: HandlerContext,
    token?: string
): ListFilesResponse["files"] {
    const { workspaceService } = context;
    const cwd = workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath || process.cwd();
    const dirSet = new Set<string>();
    for (const f of files) {
        try {
            const rel = f.path || '';
            const abs = normalizeAbsolutePath(rel, cwd);
            const parent = path.dirname(abs);
            const relParent = toWorkspaceRelative(parent, cwd);
            if (relParent && !dirSet.has(relParent)) {
                dirSet.add(relParent);
            }
        } catch {}
    }
    const results: ListFilesResponse["files"] = [];
    // 排序稳定
    const sorted = Array.from(dirSet).sort((a, b) => a.localeCompare(b))
    let count = 0;
    const t = (token || '').toLowerCase()
    for (const rel of sorted) {
        // 无锚点时，仅输出名称包含 token 的目录，减少噪声
        if (t && !path.basename(rel).toLowerCase().includes(t)) continue;
        results.push({ path: rel, name: path.basename(rel), type: 'directory' });
        if (++count >= 200) break;
    }
    return results;
}

// 列出锚点目录下的子目录，按 lastToken 过滤
async function collectChildDirs(anchorAbs: string, lastToken: string, context: HandlerContext): Promise<ListFilesResponse["files"]> {
    const { workspaceService } = context;
    const cwd = workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath || process.cwd();
    const uri = vscode.Uri.file(anchorAbs);
    let entries: [string, vscode.FileType][] = [];
    try {
        entries = await vscode.workspace.fs.readDirectory(uri);
    } catch {
        return [];
    }
    const lower = (lastToken || '').toLowerCase();
    const results: ListFilesResponse["files"] = [];
    for (const [name, type] of entries) {
        if (type !== vscode.FileType.Directory) continue;
        if (lower && !name.toLowerCase().includes(lower)) continue;
        const abs = path.join(anchorAbs, name);
        const rel = toWorkspaceRelative(abs, cwd);
        results.push({ path: rel, name, type: 'directory' });
        if (results.length >= 200) break;
    }
    return results;
}

function buildExcludePatterns(): string[] {
    const patterns = new Set<string>(DEFAULT_EXCLUDE_PATTERNS);

    try {
        const searchConfig = vscode.workspace.getConfiguration("search");
        const filesConfig = vscode.workspace.getConfiguration("files");
        const searchExclude = (searchConfig.get<Record<string, boolean>>("exclude") ?? {});
        const filesExclude = (filesConfig.get<Record<string, boolean>>("exclude") ?? {});

        for (const [glob, enabled] of Object.entries(searchExclude)) {
            if (enabled && typeof glob === "string" && glob.length > 0) {
                patterns.add(glob);
            }
        }

        for (const [glob, enabled] of Object.entries(filesExclude)) {
            if (enabled && typeof glob === "string" && glob.length > 0) {
                patterns.add(glob);
            }
        }

        const useIgnoreFiles = searchConfig.get<boolean>("useIgnoreFiles", true);
        if (useIgnoreFiles) {
            const folders = vscode.workspace.workspaceFolders;
            if (folders) {
                for (const folder of folders) {
                    for (const entry of readGitignorePatterns(folder.uri.fsPath)) {
                        patterns.add(entry);
                    }
                }
            }
            for (const entry of readGlobalGitignorePatterns()) {
                patterns.add(entry);
            }
        }
    } catch (error) {
        // ignore errors
    }

    return Array.from(patterns);
}

function readGitignorePatterns(root: string): string[] {
    const entries: string[] = [];
    const localGitignore = path.join(root, ".gitignore");
    try {
        if (fs.existsSync(localGitignore)) {
            const content = fs.readFileSync(localGitignore, "utf8");
            entries.push(...parseGitignore(content));
        }
    } catch {
        // ignore errors
    }
    return entries;
}

function readGlobalGitignorePatterns(): string[] {
    const entries: string[] = [];
    const globalGitIgnore = path.join(os.homedir(), ".config", "git", "ignore");
    try {
        if (fs.existsSync(globalGitIgnore)) {
            const content = fs.readFileSync(globalGitIgnore, "utf8");
            entries.push(...parseGitignore(content));
        }
    } catch {
        // ignore errors
    }
    return entries;
}

function parseGitignore(content: string): string[] {
    const results: string[] = [];
    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#") || line.startsWith("!")) {
            continue;
        }

        let transformed = line;
        if (transformed.endsWith("/")) {
            transformed = `${transformed.slice(0, -1)}/**`;
        }
        if (transformed.startsWith("/")) {
            transformed = transformed.slice(1);
        } else {
            transformed = `**/${transformed}`;
        }
        results.push(transformed);
    }
    return results;
}

function toExcludeGlob(patterns: string[]): string | undefined {
    if (patterns.length === 0) {
        return undefined;
    }
    if (patterns.length === 1) {
        return patterns[0];
    }
    return `{${patterns.join(",")}}`;
}

function prioritizeRipgrepResults(
    paths: string[],
    pattern: string,
    cwd: string
): Array<{ absolute: string; relative: string }> {
    const cleaned = paths.filter(Boolean);
    const normalizedPattern = pattern.trim().toLowerCase();

    const scored = cleaned.map((raw, index) => {
        const absolute = normalizeAbsolutePath(raw.replace(/^\.\//, ""), cwd);
        const relative = toWorkspaceRelative(absolute, cwd);
        const lowerRelative = relative.toLowerCase();
        const lowerName = path.basename(relative).toLowerCase();
        let score = Number.MAX_SAFE_INTEGER;
        let matched = true;
        if (normalizedPattern.length > 0) {
            const pathIndex = lowerRelative.indexOf(normalizedPattern);
            const nameIndex = lowerName.indexOf(normalizedPattern);
            matched = pathIndex >= 0 || nameIndex >= 0;
            if (pathIndex >= 0) score = Math.min(score, pathIndex);
            if (nameIndex >= 0) score = Math.min(score, nameIndex / 2);
        } else {
            score = index;
        }

        if (!matched) return null as any; // 将未匹配项过滤掉

        const penalty = lowerRelative.includes("test") ? 1 : 0;
        return { absolute, relative, score, penalty };
    });
    const filtered = scored.filter(Boolean) as Array<{ absolute: string; relative: string; score: number; penalty: number }>;
    if (normalizedPattern.length > 0 && filtered.length === 0) {
        // 无匹配，直接返回空
        return [];
    }

    filtered.sort((a, b) => {
        if (a.score === b.score) {
            if (a.penalty !== b.penalty) {
                return a.penalty - b.penalty;
            }
            return a.relative.localeCompare(b.relative);
        }
        return a.score - b.score;
    });

    return filtered.slice(0, 200).map((entry) => ({
        absolute: entry.absolute,
        relative: entry.relative
    }));
}

function normalizeAbsolutePath(target: string, cwd: string): string {
    if (path.isAbsolute(target)) {
        return path.normalize(target);
    }
    return path.normalize(path.join(cwd, target));
}

function toWorkspaceRelative(absolutePath: string, cwd: string): string {
    const relative = path.relative(cwd, absolutePath);
    if (relative && !relative.startsWith("..")) {
        return relative;
    }
    return absolutePath;
}

let ripgrepCommandCache: { command: string; args: string[] } | undefined;

function getRipgrepCommand(): { command: string; args: string[] } {
    if (ripgrepCommandCache) {
        return ripgrepCommandCache;
    }

    const rootDir = path.resolve(__dirname, "..", "..", "..", "..");
    const vendorDir = path.join(rootDir, "vendor", "ripgrep");

    let command: string;
    if (process.platform === "win32") {
        command = path.join(vendorDir, "x64-win32", "rg.exe");
    } else {
        const platformKey = `${process.arch}-${process.platform}`;
        command = path.join(vendorDir, platformKey, "rg");
    }

    if (!fs.existsSync(command)) {
        command = "rg";
    }

    ripgrepCommandCache = { command, args: [] };
    return ripgrepCommandCache;
}

async function execRipgrep(
    args: string[],
    cwd: string,
    context: HandlerContext
): Promise<string[]> {
    const { logService } = context;
    const { command, args: defaultArgs } = getRipgrepCommand();

    return new Promise((resolve, reject) => {
        execFile(command, [...defaultArgs, ...args], {
            cwd,
            maxBuffer: 32 * 1024 * 1024,
            timeout: 15_000
        }, (error, stdout, stderr) => {
            if (!error) {
                resolve(stdout.split(/\r?\n/).filter(Boolean));
                return;
            }

            const code = (error as any)?.code;
            const signal = (error as any)?.signal;
            if (code === 1) {
                resolve([]);
                return;
            }

            if ((signal === "SIGTERM" || code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") && stdout) {
                resolve(stdout.split(/\r?\n/).filter(Boolean));
                return;
            }

            logService.warn(`[findFiles] ripgrep error: ${stderr || (error instanceof Error ? error.message : String(error))}`);
            reject(error);
        });
    });
}

function sanitizeFileName(fileName: string): string {
    const fallback = fileName && fileName.trim() ? fileName.trim() : "claude.txt";
    return fallback.replace(/[<>:\"/\\|?*\x00-\x1F]/g, "_");
}

async function createTempFile(fileName: string, content: string): Promise<string> {
    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "claude-"));
    const sanitized = sanitizeFileName(fileName);
    const filePath = path.join(tempDir, sanitized);
    await fs.promises.writeFile(filePath, content, "utf8");
    return filePath;
}

async function prepareDiffRightFile(
    originalPath: string,
    fallbackPath: string | undefined,
    edits: OpenDiffRequest["edits"]
): Promise<string> {
    let baseContent = "";

    if (await pathExists(originalPath)) {
        baseContent = await fs.promises.readFile(originalPath, "utf8");
    } else if (fallbackPath && await pathExists(fallbackPath)) {
        baseContent = await fs.promises.readFile(fallbackPath, "utf8");
    }

    let modified = baseContent;

    for (const edit of edits) {
        const oldString = edit.oldString ?? "";
        const newString = edit.newString ?? "";

        if (!oldString) {
            modified += newString;
            continue;
        }

        if (edit.replaceAll) {
            modified = modified.split(oldString).join(newString);
        } else {
            const index = modified.indexOf(oldString);
            if (index >= 0) {
                modified = `${modified.slice(0, index)}${newString}${modified.slice(index + oldString.length)}`;
            } else {
                modified += newString;
            }
        }
    }

    const baseName = path.basename(fallbackPath || originalPath || "claude.diff");
    const outputName = baseName.endsWith(".claude") ? baseName : `${baseName}.claude`;

    return createTempFile(outputName, modified);
}

async function waitForDocumentEdits(
    document: vscode.TextDocument,
    signal: AbortSignal
): Promise<string> {
    let currentText = document.getText();
    let resolved = false;

    return new Promise<string>((resolve) => {
        const disposables: vscode.Disposable[] = [];

        const cleanup = () => {
            if (!resolved) {
                resolved = true;
                disposables.forEach(d => d.dispose());
            }
        };

        disposables.push(
            vscode.workspace.onDidChangeTextDocument(event => {
                if (event.document.uri.toString() === document.uri.toString()) {
                    currentText = event.document.getText();
                }
            })
        );

        disposables.push(
            vscode.workspace.onDidSaveTextDocument(event => {
                if (event.uri.toString() === document.uri.toString()) {
                    currentText = event.getText();
                    cleanup();
                    resolve(currentText);
                }
            })
        );

        disposables.push(
            vscode.workspace.onDidCloseTextDocument(event => {
                if (event.uri.toString() === document.uri.toString()) {
                    cleanup();
                    resolve(currentText);
                }
            })
        );

        if (signal.aborted) {
            cleanup();
            resolve(currentText);
            return;
        }

        signal.addEventListener("abort", () => {
            cleanup();
            resolve(currentText);
        }, { once: true });
    });
}

function detectLanguage(fileName?: string): string {
    if (!fileName) {
        return "plaintext";
    }

    const ext = path.extname(fileName).toLowerCase();
    switch (ext) {
        case ".ts":
        case ".tsx":
            return "typescript";
        case ".js":
        case ".jsx":
            return "javascript";
        case ".json":
            return "json";
        case ".py":
            return "python";
        case ".java":
            return "java";
        case ".go":
            return "go";
        case ".rs":
            return "rust";
        case ".md":
            return "markdown";
        case ".sh":
            return "shellscript";
        case ".css":
            return "css";
        case ".html":
        case ".htm":
            return "html";
        default:
            return "plaintext";
    }
}

function getConfigFilePath(configType: string): string {
    const homeDir = os.homedir();

    switch (configType) {
        case "settings":
            return path.join(homeDir, ".claude", "settings.json");
        case "config":
            return path.join(homeDir, ".claude", "config.json");
        default:
            return path.join(homeDir, ".claude", `${configType}.json`);
    }
}
