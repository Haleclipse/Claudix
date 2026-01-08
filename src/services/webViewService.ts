/**
 * WebView 服务 / WebView Service
 *
 * 职责：
 * 1. 实现 vscode.WebviewViewProvider 接口
 * 2. 管理 WebView 实例和生命周期
 * 3. 生成 WebView HTML 内容
 * 4. 提供消息收发接口
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { createDecorator } from '../di/instantiation';
import { ILogService } from './logService';

export const IWebViewService = createDecorator<IWebViewService>('webViewService');

export type WebviewHost = 'sidebar' | 'editor';

export interface WebviewBootstrapConfig {
	host: WebviewHost;
	page?: string;
	id?: string;
}

export interface IWebViewService extends vscode.WebviewViewProvider {
	readonly _serviceBrand: undefined;

	/**
	 * 获取当前的 WebView 实例（用于部分需要 webviewUri 的场景）
	 */
	getWebView(): vscode.Webview | undefined;

	/**
	 * 向所有已注册 WebView 实例广播消息
	 */
	postMessage(message: any): void;

	/**
	 * 设置消息接收处理器，所有 WebView 的消息都会通过该处理器转发
	 */
	setMessageHandler(handler: (message: any) => void): void;

	/**
	 * 打开（或聚焦）主编辑器中的某个页面
	 *
	 * @param page 页面类型标识，例如 'settings'、'diff'
	 * @param title VSCode 标签标题
	 * @param instanceId 页面实例 ID，用于区分多标签（不传则默认为 page，实现单例）
	 */
	openEditorPage(page: string, title: string, instanceId?: string): void;
}

/**
 * WebView 服务实现
 */
export class WebViewService implements IWebViewService {
	readonly _serviceBrand: undefined;

	private readonly webviews = new Set<vscode.Webview>();
	private readonly webviewConfigs = new Map<vscode.Webview, WebviewBootstrapConfig>();
	private messageHandler?: (message: any) => void;
	private readonly editorPanels = new Map<string, vscode.WebviewPanel>();

	constructor(
		private readonly context: vscode.ExtensionContext,
		@ILogService private readonly logService: ILogService
	) {}

	/**
	 * 实现 WebviewViewProvider.resolveWebviewView（侧边栏宿主）
	 */
	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
	): void | Thenable<void> {
		this.logService.info('开始解析侧边栏 WebView 视图');

		this.registerWebview(webviewView.webview, {
			host: 'sidebar',
			page: 'chat'
		});

		// WebviewView 的销毁由 VSCode 管理，这里仅作日志记录
		webviewView.onDidDispose(
			() => {
				this.logService.info('侧边栏 WebView 视图已销毁');
			},
			undefined,
			this.context.subscriptions
		);

		this.logService.info('侧边栏 WebView 视图解析完成');
	}

	/**
	 * 获取当前的 WebView 实例
	 * 对于多 WebView 场景，这里返回任意一个可用实例（当前仅用于获取资源 URI）
	 */
	getWebView(): vscode.Webview | undefined {
		for (const webview of this.webviews) {
			return webview;
		}
		return undefined;
	}

	/**
	 * 广播消息到所有已注册的 WebView
	 */
	postMessage(message: any): void {
		// 目前 ClaudeAgentService 只需要与侧边栏聊天视图通信
		// 因此这里只向 host === 'sidebar' 且 page === 'chat' 的 WebView 发送消息
		if (this.webviews.size === 0) {
			this.logService.warn('[WebViewService] 当前没有可用的 WebView 实例，消息将被丢弃');
			return;
		}

		const payload = {
			type: 'from-extension',
			message
		};

		const toRemove: vscode.Webview[] = [];

		for (const webview of this.webviews) {
			const config = this.webviewConfigs.get(webview);
			if (!config || config.host !== 'sidebar' || (config.page && config.page !== 'chat')) {
				continue;
			}

			try {
				webview.postMessage(payload);
			} catch (error) {
				this.logService.warn('[WebViewService] 向 WebView 发送消息失败，将移除该实例', error as Error);
				toRemove.push(webview);
			}
		}

		for (const webview of toRemove) {
			this.webviews.delete(webview);
			this.webviewConfigs.delete(webview);
		}
	}

	/**
	 * 设置消息接收处理器
	 */
	setMessageHandler(handler: (message: any) => void): void {
		this.messageHandler = handler;
	}

	/**
	 * 打开（或聚焦）主编辑器中的某个页面
	 */
	openEditorPage(page: string, title: string, instanceId?: string): void {
		const key = instanceId || page;
		const existing = this.editorPanels.get(key);
		if (existing) {
			try {
				existing.reveal(vscode.ViewColumn.Active);
				this.logService.info(`[WebViewService] 复用已存在的编辑器面板: page=${page}, id=${key}`);
				return;
			} catch (error) {
				// 可能遇到已被释放但还没从映射中移除的面板
				this.logService.warn(
					`[WebViewService] 现有编辑器面板已失效，将重新创建: page=${page}, id=${key}`,
					error as Error
				);
				this.editorPanels.delete(key);
			}
		}

		this.logService.info(`[WebViewService] 创建主编辑器 WebView 面板: page=${page}, id=${key}`);

		const panel = vscode.window.createWebviewPanel(
			'claudix.pageView',
			title,
			vscode.ViewColumn.Active,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [
					vscode.Uri.file(path.join(this.context.extensionPath, 'dist')),
					vscode.Uri.file(path.join(this.context.extensionPath, 'resources'))
				]
			}
		);

		this.registerWebview(panel.webview, {
			host: 'editor',
			page,
			id: key
		});

		panel.onDidDispose(
			() => {
				this.webviews.delete(panel.webview);
				this.webviewConfigs.delete(panel.webview);
				this.editorPanels.delete(key);
				this.logService.info(`[WebViewService] 主编辑器 WebView 面板已销毁: page=${page}, id=${key}`);
			},
			undefined,
			this.context.subscriptions
		);

		this.editorPanels.set(key, panel);
	}

	/**
	 * 为给定 WebView 配置选项、消息通道和 HTML
	 */
	private registerWebview(webview: vscode.Webview, bootstrap: WebviewBootstrapConfig): void {
		// 配置 WebView 选项
		webview.options = {
			enableScripts: true,
			localResourceRoots: [
				vscode.Uri.file(path.join(this.context.extensionPath, 'dist')),
				vscode.Uri.file(path.join(this.context.extensionPath, 'resources'))
			]
		};

		// 保存实例及其配置
		this.webviews.add(webview);
		this.webviewConfigs.set(webview, bootstrap);

		// 连接消息处理器
		webview.onDidReceiveMessage(
			message => {
				this.logService.info(`[WebView → Extension] 收到消息: ${message.type}`);
				if (this.messageHandler) {
					this.messageHandler(message);
				}
			},
			undefined,
			this.context.subscriptions
		);

		// 设置 WebView HTML（根据开发/生产模式切换）
		webview.html = this.getHtmlForWebview(webview, bootstrap);
	}

	/**
	 * 生成 WebView HTML
	 */
	private getHtmlForWebview(webview: vscode.Webview, bootstrap: WebviewBootstrapConfig): string {
		const isDev = this.context.extensionMode === vscode.ExtensionMode.Development;
		const nonce = this.getNonce();

		if (isDev) {
			return this.getDevHtml(webview, nonce, bootstrap);
		}

		const extensionUri = vscode.Uri.file(this.context.extensionPath);
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(extensionUri, 'dist', 'media', 'main.js')
		);
		const styleUri = webview.asWebviewUri(
			vscode.Uri.joinPath(extensionUri, 'dist', 'media', 'style.css')
		);

		// CSP: 'unsafe-eval' and 'blob:' required for mermaid diagram rendering
		// Mermaid v10+ uses dynamic ESM imports and eval for diagram parsing
		// See: https://github.com/mermaid-js/mermaid/issues/5453
		const csp = [
			`default-src 'none';`,
			`img-src ${webview.cspSource} https: data:;`,
			`style-src ${webview.cspSource} 'unsafe-inline' https://*.vscode-cdn.net;`,
			`font-src ${webview.cspSource} data:;`,
			`script-src ${webview.cspSource} 'nonce-${nonce}' 'unsafe-eval' blob:;`,
			`connect-src ${webview.cspSource} https:;`,
			`worker-src ${webview.cspSource} blob:;`,
		].join(' ');

		const bootstrapScript = `
    <script nonce="${nonce}">
      window.CLAUDIX_BOOTSTRAP = ${JSON.stringify(bootstrap)};
    </script>`;

		return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Claudex Chat</title>
    <link href="${styleUri}" rel="stylesheet" />
    ${bootstrapScript}
</head>
<body>
    <div id="app"></div>
    <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
	}

	private getDevHtml(webview: vscode.Webview, nonce: string, bootstrap: WebviewBootstrapConfig): string {
		// 读取 dev server 地址（可通过环境变量覆盖）
		const devServer = process.env.VITE_DEV_SERVER_URL
			|| process.env.WEBVIEW_DEV_SERVER_URL
			|| `http://localhost:${process.env.VITE_DEV_PORT || 5173}`;

		let origin = '';
		let wsUrl = '';
		try {
			const u = new URL(devServer);
			origin = `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ''}`;
			const wsProtocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
			wsUrl = `${wsProtocol}//${u.hostname}${u.port ? `:${u.port}` : ''}`;
		} catch {
			origin = devServer; // 回退（尽量允许）
			wsUrl = 'ws://localhost:5173';
		}

		// Dev CSP: allows devServer + HMR websocket
		// 'unsafe-eval' and 'blob:' required for mermaid (see production CSP comment)
		const csp = [
			`default-src 'none';`,
			`img-src ${webview.cspSource} https: data:;`,
			`style-src ${webview.cspSource} 'unsafe-inline' ${origin} https://*.vscode-cdn.net;`,
			`font-src ${webview.cspSource} data: ${origin};`,
			`script-src ${webview.cspSource} 'nonce-${nonce}' 'unsafe-eval' ${origin} blob:;`,
			`connect-src ${webview.cspSource} ${origin} ${wsUrl} https:;`,
			`worker-src ${webview.cspSource} blob:;`,
		].join(' ');

		const client = `${origin}/@vite/client`;
		const entry = `${origin}/src/main.ts`;

		const bootstrapScript = `
    <script nonce="${nonce}">
      window.CLAUDIX_BOOTSTRAP = ${JSON.stringify(bootstrap)};
    </script>`;

		return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <base href="${origin}/" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Claudex Chat (Dev)</title>
    ${bootstrapScript}
</head>
<body>
    <div id="app"></div>
    <script type="module" nonce="${nonce}" src="${client}"></script>
    <script type="module" nonce="${nonce}" src="${entry}"></script>
</body>
</html>`;
	}

	/**
	 * 生成随机 nonce
	 */
	private getNonce(): string {
		let text = '';
		const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		for (let i = 0; i < 32; i++) {
			text += possible.charAt(Math.floor(Math.random() * possible.length));
		}
		return text;
	}
}
