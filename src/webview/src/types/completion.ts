import type { Ref, ComputedRef } from 'vue'
import type { DropdownItemType } from './dropdown'

/**
 * 触发查询信息
 * 记录触发符、查询文本和位置范围
 */
export interface TriggerQuery {
  /** 查询文本（不包括触发符） */
  query: string
  /** 触发符在文本中的起始位置 */
  start: number
  /** 查询结束位置 */
  end: number
  /** 触发符（如 '/' 或 '@'） */
  trigger: string
}

/**
 * Dropdown 位置信息
 */
export interface DropdownPosition {
  top: number
  left: number
  width: number
  height: number
}

/**
 * 补全模式
 * - inline: 输入触发（如 /command, @file）
 * - manual: 手动触发（如按钮点击）
 */
export type CompletionMode = 'inline' | 'manual'

/**
 * 补全配置选项
 */
export interface CompletionConfig<T> {
  /** 补全模式 */
  mode: CompletionMode

  /** 触发符（inline 模式必需，如 '/' 或 '@'） */
  trigger?: string

  /** 数据提供者函数（支持可选的 AbortSignal 用于取消请求） */
  provider: (query: string, signal?: AbortSignal) => Promise<T[]> | T[]

  /** 将数据项转换为 DropdownItem 格式 */
  toDropdownItem: (item: T) => DropdownItemType

  /** 选择项的回调 */
  onSelect: (item: T, query?: TriggerQuery) => void

  /** 定位锚点元素（用于计算 dropdown 位置） */
  anchorElement?: Ref<HTMLElement | null>

  /** 是否显示分组标题（manual 模式） */
  showSectionHeaders?: boolean

  /** 搜索字段列表（用于过滤，manual 模式） */
  searchFields?: string[]

  /** 命令分组顺序（manual 模式，可选） */
  sectionOrder?: readonly string[]
}

/**
 * 补全 Dropdown 返回值
 */
export interface CompletionDropdown {
  /** 是否打开 */
  isOpen: Ref<boolean>

  /** Dropdown 项列表 */
  items: ComputedRef<DropdownItemType[]>

  /** 当前激活的索引 */
  activeIndex: Ref<number>

  /** Dropdown 位置 */
  position: ComputedRef<DropdownPosition>

  /** 当前查询文本 */
  query: Ref<string>

  /** 当前触发查询信息（inline 模式） */
  triggerQuery: Ref<TriggerQuery | undefined>

  /** 导航模式 */
  navigationMode: Ref<'keyboard' | 'mouse'>

  /** 打开 dropdown */
  open: () => void

  /** 关闭 dropdown */
  close: () => void

  /** 键盘事件处理 */
  handleKeydown: (event: KeyboardEvent) => void

  /** 选择当前激活项（用于点击触发等） */
  selectActive: () => void

  /** 按索引选择项（用于点击触发等） */
  selectIndex: (index: number) => void

  /** 搜索处理（manual 模式） */
  handleSearch: (term: string) => void

  /** 评估查询（inline 模式内部使用） */
  evaluateQuery: (text: string, caretOffset?: number) => void

  /** 文本替换（inline 模式） */
  replaceText: (text: string, replacement: string) => string

  /** 鼠标进入项（切换为 mouse 模式） */
  handleMouseEnter: (index: number) => void

  /** 鼠标离开菜单（复位索引） */
  handleMouseLeave: () => void

  /** 手动更新位置 */
  updatePosition: (pos: DropdownPosition) => void
}

/**
 * 键盘导航选项
 */
export interface KeyboardNavigationOptions {
  /** 是否打开 */
  isOpen: Ref<boolean>

  /** 项列表 */
  items: ComputedRef<any[]>

  /** 当前激活的索引 */
  activeIndex: Ref<number>

  /** 选择当前项的回调 */
  onSelect: (index: number) => void

  /** 关闭的回调 */
  onClose: () => void

  /** 是否支持 Tab 键选择 */
  supportTab?: boolean

  /** 是否支持 Escape 键关闭 */
  supportEscape?: boolean

  /** 导航发生时的回调（用于切换导航模式） */
  onNavigate?: () => void

  /** 翻页大小（默认 5） */
  pageSize?: number
}

/**
 * 触发检测选项
 */
export interface TriggerDetectionOptions {
  /** 触发符 */
  trigger: string

  /** 自定义正则表达式（可选） */
  customRegex?: RegExp
}
