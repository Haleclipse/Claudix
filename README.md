# Claudix

English | [简体中文](README_CN.md)

![VS Code Extension](https://img.shields.io/badge/VS%20Code-Extension-blue?logo=visual-studio-code)
![Built with TypeScript](https://img.shields.io/badge/Built%20with-TypeScript-blue?logo=typescript)
![License](https://img.shields.io/badge/License-AGPL--3.0-blue)

![Powered by Claude Agent SDK](https://img.shields.io/badge/Powered%20by-Claude%20Agent%20SDK-orange)

A VSCode extension that brings Claude Code directly into your editor.

## Overview

Claude Code integrates Claude AI into VSCode, providing an interactive coding assistant with conversation history, tool integration, and intelligent code understanding.

## Features

- Interactive chat interface with Claude Code
- Session management and conversation history
- Intelligent file operations and code analysis
- Terminal command execution
- Permission-based tool access
- Support for multiple Claude models
- Real-time streaming responses
- Syntax highlighting and markdown rendering

## Installation

```bash
# Install dependencies
pnpm install

# Build the extension
pnpm build

# Package as VSIX
pnpm package
```

Install the generated `.vsix` file in VSCode through Extensions > Install from VSIX.

## Development

### Running in Development Mode

Start the development server with hot module replacement:

```bash
pnpm dev
```

This will concurrently start:
- Vite dev server (port 5173) for the webview
- esbuild watcher for the extension

### Debugging

Open the project in VSCode and use the debugging configurations:

#### Run Extension
Full build mode without HMR. The extension will be built from scratch before launching.

- Press `F5` or select "Run Extension" from the debug panel
- Suitable for production-like testing

#### Run Extension (HMR)
Development mode with hot module replacement for the webview.

- Select "Run Extension (HMR)" from the debug panel
- Webview changes will reload automatically without restarting the extension
- Faster iteration during development

### Build Commands

```bash
# Build everything
pnpm build

# Build extension only
pnpm build:extension

# Build webview only
pnpm build:webview

# Run tests
pnpm test

# Type checking
pnpm typecheck:all
```

## Usage

1. Open the Claude Code sidebar from the activity bar
2. Start a new conversation or continue from history
3. Ask questions, request code changes, or get help with your project
4. Review and approve tool operations when prompted

## Requirements

- VSCode >= 1.98.0
- Node.js >= 18.0.0

## Contributing

Contributions are welcome! If you would like to contribute to this project, please open an issue first to discuss your ideas or proposed changes.

## License

AGPL-3.0

## Star History

[![Star History](https://api.star-history.com/svg?repos=Haleclipse/Claudix&type=date&legend=top-left)](https://www.star-history.com/#Haleclipse/Claudix&type=date&legend=top-left)
