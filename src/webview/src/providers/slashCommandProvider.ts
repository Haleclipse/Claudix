import type { CommandAction } from '../core/AppContext'
import type { RuntimeInstance } from '../composables/useRuntime'
import type { DropdownItemType } from '../types/dropdown'

/**
 * Slash Command 数据提供者
 *
 * 从 CommandRegistry 获取并过滤 slash commands
 */

// 带 section 信息的命令
export interface CommandWithSection extends CommandAction {
  section: string
}

/**
 * 获取 slash commands
 *
 * @param query 搜索查询（可选）
 * @param runtime Runtime 实例
 * @param _signal 未使用,仅为保持接口一致性
 * @returns 命令列表
 */
export function getSlashCommands(
  query: string,
  runtime: RuntimeInstance | undefined,
  _signal?: AbortSignal
): CommandAction[] {
  if (!runtime) return []

  const commandsBySection = runtime.appContext.commandRegistry.getCommandsBySection()
  const allCommands = commandsBySection['Slash Commands'] || []

  // 如果没有查询，返回所有命令
  if (!query || !query.trim()) return allCommands

  // 过滤命令：匹配 label 或 description
  const lowerQuery = query.toLowerCase()
  return allCommands.filter(cmd =>
    cmd.label.toLowerCase().includes(lowerQuery) ||
    cmd.description?.toLowerCase().includes(lowerQuery)
  )
}

/**
 * 获取带分组信息的 slash commands（用于 ButtonArea）
 *
 * @param query 搜索查询（可选）
 * @param runtime Runtime 实例
 * @returns 带分组信息的命令列表
 */
export function getSlashCommandsWithSection(
  query: string,
  runtime: RuntimeInstance | undefined
): CommandWithSection[] {
  if (!runtime) return []

  const commandsBySection = runtime.appContext.commandRegistry.getCommandsBySection()
  const results: CommandWithSection[] = []

  const SECTION_ORDER = ['Slash Commands'] as const

  // 遍历分组
  for (const section of SECTION_ORDER) {
    const commands = commandsBySection[section]
    if (!commands || commands.length === 0) continue

    // 过滤命令
    const lowerQuery = query.toLowerCase()
    const filteredCommands = query
      ? commands.filter(cmd =>
          cmd.label.toLowerCase().includes(lowerQuery) ||
          cmd.description?.toLowerCase().includes(lowerQuery)
        )
      : commands

    // 添加分组信息
    for (const cmd of filteredCommands) {
      results.push({
        ...cmd,
        section
      })
    }
  }

  return results
}

/**
 * 将 CommandAction 转换为 DropdownItemType
 *
 * @param command 命令对象
 * @returns Dropdown 项
 */
export function commandToDropdownItem(command: CommandAction): DropdownItemType {
  return {
    id: command.id,
    label: command.label,
    detail: command.description,
    icon: 'codicon-symbol-method',
    type: 'command',
    data: { commandId: command.id, command }
  }
}

/**
 * 获取命令的图标
 *
 * @param command 命令对象
 * @returns 图标类名
 */
export function getCommandIcon(command: CommandAction): string | undefined {
  const label = command.label.toLowerCase()

  // Slash commands 使用默认图标
  if (label.startsWith('/')) {
    return 'codicon-symbol-method'
  }

  return undefined
}
