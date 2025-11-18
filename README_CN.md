# Claudix

[English](README.md) | 简体中文

![VS Code Extension](https://img.shields.io/badge/VS%20Code-Extension-blue?logo=visual-studio-code)
![Built with TypeScript](https://img.shields.io/badge/Built%20with-TypeScript-blue?logo=typescript)
![License](https://img.shields.io/badge/License-AGPL--3.0-blue)

![Powered by Claude Agent SDK](https://img.shields.io/badge/Powered%20by-Claude%20Agent%20SDK-orange)

VSCode 扩展，将 Claude Code 直接集成到你的编辑器中。

## 概述

Claude Code 将 Claude AI 集成到 VSCode，提供具有对话历史、工具集成和智能代码理解的交互式编程助手。

## 功能特性

- 与 Claude Code 的交互式聊天界面
- 会话管理和对话历史
- 智能文件操作和代码分析
- 终端命令执行
- 基于权限的工具访问
- 支持多种 Claude 模型
- 实时流式响应
- 语法高亮和 Markdown 渲染

## 安装

```bash
# 安装依赖
pnpm install

# 构建扩展
pnpm build

# 打包为 VSIX
pnpm package
```

在 VSCode 中通过"扩展">"从 VSIX 安装"来安装生成的 `.vsix` 文件。

## 开发调试

### 启动开发模式

启动带有热模块替换的开发服务器：

```bash
pnpm dev
```

这将同时启动：
- Vite 开发服务器（端口 5173）用于 webview
- esbuild 监听器用于扩展

### 调试扩展

在 VSCode 中打开项目，使用以下调试配置：

#### Run Extension（运行扩展）
完整构建模式，不带热重载。启动前会从头构建扩展。

- 按 `F5` 或从调试面板选择"Run Extension"
- 适合类生产环境测试

#### Run Extension (HMR)（热重载模式）
开发模式，webview 支持热模块替换。

- 从调试面板选择"Run Extension (HMR)"
- webview 的更改会自动重新加载，无需重启扩展
- 开发时迭代更快

### 构建命令

```bash
# 构建所有内容
pnpm build

# 仅构建扩展
pnpm build:extension

# 仅构建 webview
pnpm build:webview

# 运行测试
pnpm test

# 类型检查
pnpm typecheck:all
```

## 使用方法

1. 从活动栏打开 Claude Code 侧边栏
2. 开始新对话或从历史记录继续
3. 提问、请求代码更改或获取项目帮助
4. 在提示时审查并批准工具操作

## 系统要求

- VSCode >= 1.98.0
- Node.js >= 18.0.0

## 贡献指南

欢迎贡献！如果你想为这个项目做出贡献，请先打开一个 issue 来讨论你的想法或建议的更改。

## 许可证

AGPL-3.0

## Star History

[![Star History](https://api.star-history.com/svg?repos=Haleclipse/Claudix&type=date&legend=top-left)](https://www.star-history.com/#Haleclipse/Claudix&type=date&legend=top-left)
