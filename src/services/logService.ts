/**
 * 日志服务 / Log Service
 * 提供多级别日志记录功能
 */

import * as vscode from 'vscode';
import { createDecorator } from '../di/instantiation';

export const ILogService = createDecorator<ILogService>('logService');

export enum LogLevel {
	Trace = 0,
	Debug = 1,
	Info = 2,
	Warning = 3,
	Error = 4
}

export interface ILogService {
	readonly _serviceBrand: undefined;

	trace(message: string, ...args: any[]): void;
	debug(message: string, ...args: any[]): void;
	info(message: string, ...args: any[]): void;
	warn(message: string, ...args: any[]): void;
	error(message: string | Error, ...args: any[]): void;
	setLevel(level: LogLevel): void;
}

export class LogService implements ILogService {
	readonly _serviceBrand: undefined;

	private level: LogLevel = LogLevel.Info;
	private outputChannel: vscode.OutputChannel;

	constructor() {
		this.outputChannel = vscode.window.createOutputChannel('Claudix');
	}

	setLevel(level: LogLevel): void {
		this.level = level;
	}

	trace(message: string, ...args: any[]): void {
		if (this.level <= LogLevel.Trace) {
			this.log('TRACE', message, args);
		}
	}

	debug(message: string, ...args: any[]): void {
		if (this.level <= LogLevel.Debug) {
			this.log('DEBUG', message, args);
		}
	}

	info(message: string, ...args: any[]): void {
		if (this.level <= LogLevel.Info) {
			this.log('INFO', message, args);
		}
	}

	warn(message: string, ...args: any[]): void {
		if (this.level <= LogLevel.Warning) {
			this.log('WARN', message, args);
		}
	}

	error(message: string | Error, ...args: any[]): void {
		if (this.level <= LogLevel.Error) {
			const msg = message instanceof Error ? message.message : message;
			this.log('ERROR', msg, args);
			if (message instanceof Error && message.stack) {
				this.outputChannel.appendLine(message.stack);
			}
		}
	}

	private log(level: string, message: string, args: any[]): void {
		const timestamp = new Date().toISOString();
		const argsStr = args.length > 0 ? ' ' + JSON.stringify(args) : '';
		this.outputChannel.appendLine(`[${timestamp}] [${level}] ${message}${argsStr}`);
	}
}
