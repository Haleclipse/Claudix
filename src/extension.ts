/**
 * VSCode Extension Entry Point
 */

import * as vscode from 'vscode';
import { InstantiationServiceBuilder } from './di/instantiationServiceBuilder';
import { registerServices, ILogService, IClaudeAgentService, IWebViewService } from './services/serviceRegistry';
import { VSCodeTransport } from './services/claude/transport/VSCodeTransport';

/**
 * Extension Activation
 */
export function activate(context: vscode.ExtensionContext) {
	// 1. Create service builder
	const builder = new InstantiationServiceBuilder();

	// 2. Register all services
	registerServices(builder, context);

	// 3. Seal the builder and create DI container
	const instantiationService = builder.seal();

	// 4. Log activation
	instantiationService.invokeFunction(accessor => {
		const logService = accessor.get(ILogService);
		logService.info('');
		logService.info('╔════════════════════════════════════════╗');
		logService.info('║         Claude Chat 扩展已激活           ║');
		logService.info('╚════════════════════════════════════════╝');
		logService.info('');
	});

	// 5. Connect services
	instantiationService.invokeFunction(accessor => {
		const logService = accessor.get(ILogService);
		const webViewService = accessor.get(IWebViewService);
		const claudeAgentService = accessor.get(IClaudeAgentService);
		const subscriptions = context.subscriptions;

		// Register WebView View Provider
		const webviewProvider = vscode.window.registerWebviewViewProvider(
			'claudix.chatView',
			webViewService,
			{
				webviewOptions: {
					retainContextWhenHidden: true
				}
			}
		);

		// Connect WebView messages to Claude Agent Service
		webViewService.setMessageHandler((message) => {
			claudeAgentService.fromClient(message);
		});

		// Create VSCode Transport
		const transport = instantiationService.createInstance(VSCodeTransport);

		// Set transport on Claude Agent Service
		claudeAgentService.setTransport(transport);

		// 监听选区变化并通知 WebView
		const sendSelectionUpdate = (editor?: vscode.TextEditor) => {
			const selection = editor?.selection;
			if (!editor || !selection || selection.isEmpty || editor.document.uri.scheme !== 'file') {
				transport.send({
					type: 'request',
					requestId: Math.random().toString(36).slice(2),
					request: { type: 'selection_changed', selection: null }
				});
				return;
			}
			const document = editor.document;
			transport.send({
				type: 'request',
				requestId: Math.random().toString(36).slice(2),
				request: {
					type: 'selection_changed',
					selection: {
						filePath: document.uri.fsPath,
						startLine: selection.start.line + 1,
						endLine: selection.end.line + 1,
						startColumn: selection.start.character,
						endColumn: selection.end.character
					}
				}
			});
		};

		const selectionDisposable = vscode.window.onDidChangeTextEditorSelection((event) => {
			sendSelectionUpdate(event.textEditor);
		});
		const activeEditorDisposable = vscode.window.onDidChangeActiveTextEditor((editor) => {
			sendSelectionUpdate(editor);
		});

		// Start message loop
		claudeAgentService.start();

		// Register disposables
		context.subscriptions.push(webviewProvider);
		context.subscriptions.push(selectionDisposable);
		context.subscriptions.push(activeEditorDisposable);
		context.subscriptions.push(
			vscode.commands.registerCommand('claudix.openSettings', async () => {
				await instantiationService.invokeFunction(accessorInner => {
					const webViewServiceInner = accessorInner.get(IWebViewService);
					const logServiceInner = accessorInner.get(ILogService);
					try {
						// Settings 页为单实例，不传 instanceId，使用 page 作为 key
						webViewServiceInner.openEditorPage('settings', 'Claudix Settings');
					} catch (error) {
						logServiceInner.error('[Command] 打开 Settings 页面失败', error);
					}
				});
			})
		);

		logService.info('✓ Claude Agent Service 已连接 Transport');
		logService.info('✓ WebView Service 已注册为 View Provider');
		logService.info('✓ Settings 命令已注册');
	});

	// 6. Register commands
	const showChatCommand = vscode.commands.registerCommand('claudix.showChat', () => {
		vscode.commands.executeCommand('claudix.chatView.focus');
	});

	context.subscriptions.push(showChatCommand);

	// 7. Log completion
	instantiationService.invokeFunction(accessor => {
		const logService = accessor.get(ILogService);
		logService.info('✓ Claude Chat 视图已注册');
		logService.info('');
	});

	// Return extension API (if needed to expose to other extensions)
	return {
		getInstantiationService: () => instantiationService
	};
}

/**
 * Extension Deactivation
 */
export function deactivate() {
	// Clean up resources
}
