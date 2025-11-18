<template>
  <!-- 输入框 - 三行布局结构 -->
  <div class="full-input-box" style="position: relative;">
    <!-- 附件列表（如果有附件） -->
    <div v-if="attachments && attachments.length > 0" class="attachments-list">
      <div
        v-for="attachment in attachments"
        :key="attachment.id"
        class="attachment-item"
      >
        <div class="icon-wrapper">
          <div class="attachment-icon">
            <FileIcon :file-name="attachment.fileName" :size="16" />
          </div>
          <button
            class="remove-button"
            @click.stop="handleRemoveAttachment(attachment.id)"
            :aria-label="`Remove ${attachment.fileName}`"
          >
            <span class="codicon codicon-close" />
          </button>
        </div>
        <span class="attachment-name">{{ attachment.fileName }}</span>
      </div>
    </div>

    <!-- 第一行：输入框区域 -->
    <div
      ref="textareaRef"
      contenteditable="true"
      class="aislash-editor-input custom-scroll-container"
      :data-placeholder="placeholder"
      style="min-height: 34px; max-height: 240px; resize: none; overflow-y: hidden; word-wrap: break-word; white-space: pre-wrap; width: 100%; height: 34px;"
      @input="handleInput"
      @keydown="handleKeydown"
      @paste="handlePaste"
      @dragover="handleDragOver"
      @drop="handleDrop"
    />

    <!-- 第二行：ButtonArea 组件 + TokenIndicator -->
    <ButtonArea
      :disabled="isSubmitDisabled"
      :loading="isLoading"
      :selected-model="selectedModel"
      :conversation-working="conversationWorking"
      :has-input-content="!!content.trim()"
      :show-progress="showProgress"
      :progress-percentage="progressPercentage"
      :thinking-level="thinkingLevel"
      :permission-mode="permissionMode"
      @submit="handleSubmit"
      @stop="handleStop"
      @add-attachment="handleAddFiles"
      @mention="handleMention"
      @thinking-toggle="() => emit('thinkingToggle')"
      @mode-select="(mode) => emit('modeSelect', mode)"
      @model-select="(modelId) => emit('modelSelect', modelId)"
    />

    <!-- Slash Command Dropdown -->
    <Dropdown
      v-if="slashCompletion.isOpen.value"
      :is-visible="slashCompletion.isOpen.value"
      :position="slashCompletion.position.value"
      :width="240"
      :should-auto-focus="false"
      :close-on-click-outside="false"
      :data-nav="slashCompletion.navigationMode.value"
      :selected-index="slashCompletion.activeIndex.value"
      :offset-y="-8"
      :offset-x="-8"
      :prefer-placement="'above'"
      @close="slashCompletion.close"
    >
      <template #content>
        <div @mouseleave="slashCompletion.handleMouseLeave">
          <template v-if="slashCompletion.items.value.length > 0">
            <template v-for="(item, index) in slashCompletion.items.value" :key="item.id">
              <DropdownItem
                :item="item"
                :index="index"
                :is-selected="index === slashCompletion.activeIndex.value"
                @click="slashCompletion.selectActive()"
                @mouseenter="slashCompletion.handleMouseEnter(index)"
              />
            </template>
          </template>
          <div v-else class="px-2 py-1 text-xs opacity-60">No matches</div>
        </div>
      </template>
    </Dropdown>

    <!-- @ 文件引用 Dropdown -->
    <Dropdown
      v-if="fileCompletion.isOpen.value"
      :is-visible="fileCompletion.isOpen.value"
      :position="fileCompletion.position.value"
      :width="320"
      :should-auto-focus="false"
      :close-on-click-outside="false"
      :data-nav="fileCompletion.navigationMode.value"
      :selected-index="fileCompletion.activeIndex.value"
      :offset-y="-8"
      :offset-x="-8"
      :prefer-placement="'above'"
      @close="fileCompletion.close"
    >
      <template #content>
        <div @mouseleave="fileCompletion.handleMouseLeave">
          <template v-if="fileCompletion.items.value.length > 0">
            <template v-for="(item, index) in fileCompletion.items.value" :key="item.id">
              <DropdownItem
                :item="item"
                :index="index"
                :is-selected="index === fileCompletion.activeIndex.value"
                @click="fileCompletion.selectActive()"
                @mouseenter="fileCompletion.handleMouseEnter(index)"
              >
                <template #icon v-if="'data' in item && item.data?.file">
                  <FileIcon
                    :file-name="item.data.file.name"
                    :is-directory="item.data.file.type === 'directory'"
                    :folder-path="item.data.file.path"
                    :size="16"
                  />
                </template>
              </DropdownItem>
            </template>
          </template>
          <div v-else class="px-2 py-1 text-xs opacity-60">No matches</div>
        </div>
      </template>
    </Dropdown>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, inject, onMounted, onUnmounted } from 'vue'
import type { PermissionMode } from '@anthropic-ai/claude-agent-sdk'
import FileIcon from './FileIcon.vue'
import ButtonArea from './ButtonArea.vue'
import type { AttachmentItem } from '../types/attachment'
import { Dropdown, DropdownItem } from './Dropdown'
import { RuntimeKey } from '../composables/runtimeContext'
import { useCompletionDropdown } from '../composables/useCompletionDropdown'
import { getSlashCommands, commandToDropdownItem } from '../providers/slashCommandProvider'
import { getFileReferences, fileToDropdownItem } from '../providers/fileReferenceProvider'

interface Props {
  showProgress?: boolean
  progressPercentage?: number
  placeholder?: string
  readonly?: boolean
  showSearch?: boolean
  selectedModel?: string
  conversationWorking?: boolean
  attachments?: AttachmentItem[]
  thinkingLevel?: string
  permissionMode?: PermissionMode
}

interface Emits {
  (e: 'submit', content: string): void
  (e: 'queueMessage', content: string): void
  (e: 'stop'): void
  (e: 'input', content: string): void
  (e: 'attach'): void
  (e: 'addAttachment', files: FileList): void
  (e: 'removeAttachment', id: string): void
  (e: 'thinkingToggle'): void
  (e: 'modeSelect', mode: PermissionMode): void
  (e: 'modelSelect', modelId: string): void
}

const props = withDefaults(defineProps<Props>(), {
  showProgress: true,
  progressPercentage: 48.7,
  placeholder: 'Plan, @ for context, / for commands...',
  readonly: false,
  showSearch: false,
  selectedModel: 'claude-sonnet-4-5',
  conversationWorking: false,
  attachments: () => [],
  thinkingLevel: 'default_on',
  permissionMode: 'default'
})

const emit = defineEmits<Emits>()

const runtime = inject(RuntimeKey)

const content = ref('')
const isLoading = ref(false)
const textareaRef = ref<HTMLDivElement | null>(null)

const isSubmitDisabled = computed(() => {
  return !content.value.trim() || isLoading.value
})

// === 使用新的 Completion Dropdown Composable ===

// Slash Command 补全
const slashCompletion = useCompletionDropdown({
  mode: 'inline',
  trigger: '/',
  provider: (query, signal) => getSlashCommands(query, runtime, signal),
  toDropdownItem: commandToDropdownItem,
  onSelect: (command, query) => {
    if (query) {
      // 替换文本
      const updated = slashCompletion.replaceText(content.value, `${command.label} `)
      content.value = updated

      // 更新 DOM
      if (textareaRef.value) {
        textareaRef.value.textContent = updated
        placeCaretAtEnd(textareaRef.value)
      }

      // 触发输入事件
      emit('input', updated)
    }
  },
  anchorElement: textareaRef
})

// @ 文件引用补全
const fileCompletion = useCompletionDropdown({
  mode: 'inline',
  trigger: '@',
  provider: (query, signal) => getFileReferences(query, runtime, signal),
  toDropdownItem: fileToDropdownItem,
  onSelect: (file, query) => {
    if (query) {
      // 替换文本，插入文件路径
      const updated = fileCompletion.replaceText(content.value, `@${file.path} `)
      content.value = updated

      // 更新 DOM
      if (textareaRef.value) {
        textareaRef.value.textContent = updated
        placeCaretAtEnd(textareaRef.value)
      }

      // 触发输入事件
      emit('input', updated)
    }
  },
  anchorElement: textareaRef
})

// 将光标移至末尾
function placeCaretAtEnd(node: HTMLElement) {
  const range = document.createRange()
  range.selectNodeContents(node)
  range.collapse(false)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

// 获取光标的客户端矩形
function getCaretClientRect(editable: HTMLElement | null): DOMRect | undefined {
  if (!editable) return undefined

  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return undefined

  const range = sel.getRangeAt(0).cloneRange()
  if (!editable.contains(range.startContainer)) return undefined

  // collapsed range 一般有 0 宽度，但有行高；用 getClientRects 优先
  const rects = range.getClientRects()
  const rect = rects[0] || range.getBoundingClientRect()
  if (!rect) return undefined

  // 兜底行高，避免 0 高导致 Dropdown 内部计算异常
  const lh = parseFloat(getComputedStyle(editable).lineHeight || '0') || 16
  const height = rect.height || lh

  return new DOMRect(rect.left, rect.top, rect.width, height)
}

// 根据字符偏移获取矩形（用于锚定在触发词开头）
function getRectAtCharOffset(editable: HTMLElement, charOffset: number): DOMRect | undefined {
  const walker = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT)
  let remaining = charOffset
  let node: Text | null = null

  while ((node = walker.nextNode() as Text | null)) {
    const len = node.textContent?.length ?? 0
    if (remaining <= len) {
      const range = document.createRange()
      range.setStart(node, Math.max(0, remaining))
      range.collapse(true)
      const rects = range.getClientRects()
      const rect = rects[0] || range.getBoundingClientRect()
      const lh = parseFloat(getComputedStyle(editable).lineHeight || '0') || 16
      const height = rect.height || lh
      return new DOMRect(rect.left, rect.top, rect.width, height)
    }
    remaining -= len
  }

  return undefined
}

// 更新 dropdown 位置
function updateDropdownPosition(
  completion: typeof slashCompletion | typeof fileCompletion,
  anchor: 'caret' | 'queryStart' = 'queryStart'
) {
  const el = textareaRef.value
  if (!el) return

  let rect: DOMRect | undefined

  // 优先锚定在触发词开头
  if (anchor === 'queryStart' && completion.triggerQuery.value) {
    rect = getRectAtCharOffset(el, completion.triggerQuery.value.start)
  }

  // 兜底：锚定在光标位置
  if (!rect && anchor === 'caret') {
    rect = getCaretClientRect(el)
  }

  // 最终兜底：使用输入框自身矩形
  if (!rect) {
    const r = el.getBoundingClientRect()
    rect = new DOMRect(r.left, r.top, r.width, r.height)
  }

  completion.updatePosition({
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height
  })
}

function handleInput(event: Event) {
  const target = event.target as HTMLDivElement
  const textContent = target.textContent || ''

  // 只有在完全没有内容时才清理 div
  if (textContent.length === 0) {
    target.innerHTML = ''
  }

  content.value = textContent
  emit('input', textContent)

  // 评估补全（slash 和 @）
  slashCompletion.evaluateQuery(textContent)
  fileCompletion.evaluateQuery(textContent)

  // 更新 dropdown 位置（锚定在触发词开头）
  if (slashCompletion.isOpen.value) {
    nextTick(() => {
      updateDropdownPosition(slashCompletion, 'queryStart')
    })
  }
  if (fileCompletion.isOpen.value) {
    nextTick(() => {
      updateDropdownPosition(fileCompletion, 'queryStart')
    })
  }

  // 自适应高度
  autoResizeTextarea()
}

function autoResizeTextarea() {
  if (!textareaRef.value) return

  nextTick(() => {
    const divElement = textareaRef.value!

    // 重置高度以获取准确的 scrollHeight
    divElement.style.height = '20px'

    // 计算所需高度
    const scrollHeight = divElement.scrollHeight
    const minHeight = 20
    const maxHeight = 240

    if (scrollHeight <= maxHeight) {
      // 内容未超出最大高度，调整高度并隐藏滚动条
      divElement.style.height = Math.max(scrollHeight, minHeight) + 'px'
      divElement.style.overflowY = 'hidden'
    } else {
      // 内容超出最大高度，设置最大高度并显示滚动条
      divElement.style.height = maxHeight + 'px'
      divElement.style.overflowY = 'auto'
    }
  })
}

function handleKeydown(event: KeyboardEvent) {
  // 优先处理补全菜单的键盘事件
  if (slashCompletion.isOpen.value) {
    slashCompletion.handleKeydown(event)
    return
  }

  // 处理文件引用补全的键盘事件
  if (fileCompletion.isOpen.value) {
    fileCompletion.handleKeydown(event)
    return
  }

  // 其他按键处理
  if (event.key === 'Enter' && !event.shiftKey) {
    // 检查是否正在输入法组合状态(中文输入法等)
    if (event.isComposing) {
      return
    }
    event.preventDefault()
    handleSubmit()
  }

  // 延迟检查内容是否为空（在按键处理后）
  if (event.key === 'Backspace' || event.key === 'Delete') {
    setTimeout(() => {
      const target = event.target as HTMLDivElement
      const textContent = target.textContent || ''
      if (textContent.length === 0) {
        target.innerHTML = ''
        content.value = ''
      }
    }, 0)
  }
}

function handlePaste(event: ClipboardEvent) {
  const clipboard = event.clipboardData
  if (!clipboard) {
    return
  }

  const items = clipboard.items
  if (!items || items.length === 0) {
    return
  }

  const files: File[] = []
  for (const item of Array.from(items)) {
    if (item.kind === 'file') {
      const file = item.getAsFile()
      if (file) {
        files.push(file)
      }
    }
  }

  if (files.length > 0) {
    event.preventDefault()
    // 创建 FileList-like 对象
    const dataTransfer = new DataTransfer()
    for (const file of files) {
      dataTransfer.items.add(file)
    }
    // 触发附件添加
    handleAddFiles(dataTransfer.files)
  }
}

function getWorkspaceRoot(): string | undefined {
  const r = runtime as any
  if (!r) return undefined

  try {
    const sessionStore = r.sessionStore
    const activeSession = sessionStore?.activeSession?.()
    const cwdFromSession = activeSession?.cwd?.()
    if (typeof cwdFromSession === 'string' && cwdFromSession) {
      return cwdFromSession
    }
  } catch {
    // ignore
  }

  try {
    const connection = r.connectionManager?.connection?.()
    const config = connection?.config?.()
    if (config?.defaultCwd && typeof config.defaultCwd === 'string') {
      return config.defaultCwd
    }
  } catch {
    // ignore
  }

  return undefined
}

function toWorkspaceRelativePath(absoluteOrMixedPath: string): string {
  const root = getWorkspaceRoot()
  if (!root) return absoluteOrMixedPath

  const normRoot = root.replace(/\\/g, '/').replace(/\/+$/, '')
  let normPath = absoluteOrMixedPath.replace(/\\/g, '/')

  // 处理 Windows 上 file:// URI 转换后形如 /C:/ 的情况
  if (normPath.startsWith('/') && /^[A-Za-z]:\//.test(normPath.slice(1))) {
    normPath = normPath.slice(1)
  }

  if (normPath === normRoot) {
    return ''
  }

  if (normPath.startsWith(normRoot + '/')) {
    return normPath.slice(normRoot.length + 1)
  }

  return absoluteOrMixedPath
}

function isFileDrop(event: DragEvent): boolean {
  const dataTransfer = event.dataTransfer
  if (!dataTransfer) return false

  const types = Array.from(dataTransfer.types || [])
  if (types.includes('Files')) return true
  if (types.includes('text/uri-list')) return true

  return false
}

function extractFilePathsFromDataTransfer(dataTransfer: DataTransfer): string[] {
  const paths: string[] = []

  const uriList = dataTransfer.getData('text/uri-list')
  if (uriList) {
    const lines = uriList
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))

    for (const line of lines) {
      try {
        const url = new URL(line)
        if (url.protocol === 'file:') {
          const decodedPath = decodeURIComponent(url.pathname)
          paths.push(toWorkspaceRelativePath(decodedPath))
        } else {
          paths.push(toWorkspaceRelativePath(line))
        }
      } catch {
        paths.push(toWorkspaceRelativePath(line))
      }
    }
  }

  if (paths.length === 0 && dataTransfer.files && dataTransfer.files.length > 0) {
    for (const file of Array.from(dataTransfer.files)) {
      const fileWithPath = file as File & { path?: string }
      if (fileWithPath.path) {
        paths.push(toWorkspaceRelativePath(fileWithPath.path))
      } else {
        paths.push(toWorkspaceRelativePath(file.name))
      }
    }
  }

  return paths
}

async function statPaths(
  paths: string[]
): Promise<Record<string, 'file' | 'directory' | 'other' | 'not_found'>> {
  const result: Record<string, 'file' | 'directory' | 'other' | 'not_found'> = {}
  if (!paths.length) return result

  const r = runtime as any
  if (!r) return result

  try {
    const connection = await r.connectionManager.get()
    const response = await connection.statPaths(paths)
    const entries = (response?.entries ?? []) as Array<{ path: string; type: any }>
    for (const entry of entries) {
      if (!entry || typeof entry.path !== 'string') continue
      const t = entry.type
      if (t === 'file' || t === 'directory' || t === 'other' || t === 'not_found') {
        result[entry.path] = t
      }
    }
  } catch (error) {
    console.warn('[ChatInputBox] statPaths failed:', error)
  }

  return result
}

function handleDragOver(event: DragEvent) {
  // 仅在按住 Shift 且为文件/URI 拖拽时拦截，避免干扰普通文本拖拽
  if (!event.shiftKey) return
  if (!isFileDrop(event)) return

  event.preventDefault()
}

async function handleDrop(event: DragEvent) {
  const dataTransfer = event.dataTransfer
  if (!dataTransfer) return

  // 按住 Shift 时，将资源管理器文件拖入视为“插入路径”
  if (!event.shiftKey) return
  if (!isFileDrop(event)) return

  event.preventDefault()

  const paths = extractFilePathsFromDataTransfer(dataTransfer)
  if (paths.length === 0) return

  const types = await statPaths(paths)

  const mentionText = paths
    .map(p => {
      const t = types[p]
      const isDir = t === 'directory'
      const normalized = isDir && !p.endsWith('/') ? `${p}/` : p
      return `@${normalized}`
    })
    .join(' ')

  const baseContent = content.value.trimEnd()
  const updatedContent = baseContent ? `${baseContent} ${mentionText} ` : `${mentionText} `

  content.value = updatedContent

  if (textareaRef.value) {
    textareaRef.value.textContent = updatedContent
    placeCaretAtEnd(textareaRef.value)
  }

  emit('input', updatedContent)
  autoResizeTextarea()

  nextTick(() => {
    textareaRef.value?.focus()
  })
}

function handleSubmit() {
  if (!content.value.trim()) return

  if (props.conversationWorking) {
    // 对话工作中，添加到队列
    emit('queueMessage', content.value)
  } else {
    // 对话未工作，直接发送
    emit('submit', content.value)
  }

  // 清空输入框
  content.value = ''
  if (textareaRef.value) {
    textareaRef.value.textContent = ''
  }
}

function handleStop() {
  emit('stop')
}

function handleMention(filePath?: string) {
  if (!filePath) return

  // 在光标位置插入 @文件路径
  const updatedContent = content.value + `@${filePath} `
  content.value = updatedContent

  // 更新 DOM
  if (textareaRef.value) {
    textareaRef.value.textContent = updatedContent
    placeCaretAtEnd(textareaRef.value)
  }

  // 触发输入事件
  emit('input', updatedContent)

  // 自动聚焦到输入框
  nextTick(() => {
    textareaRef.value?.focus()
  })
}

function handleAddFiles(files: FileList) {
  emit('addAttachment', files)
}

function handleRemoveAttachment(id: string) {
  emit('removeAttachment', id)
}

// 监听光标位置变化（仅在下拉菜单已打开时更新位置，避免重复触发请求）
function handleSelectionChange() {
  if (!content.value || !textareaRef.value) return

  // 仅在下拉菜单已打开时更新位置
  // 避免重复调用 evaluateQuery（已在 handleInput 中调用）
  if (slashCompletion.isOpen.value) {
    nextTick(() => {
      updateDropdownPosition(slashCompletion, 'queryStart')
    })
  }
  if (fileCompletion.isOpen.value) {
    nextTick(() => {
      updateDropdownPosition(fileCompletion, 'queryStart')
    })
  }
}

// 添加/移除 selectionchange 监听
onMounted(() => {
  document.addEventListener('selectionchange', handleSelectionChange)
})

onUnmounted(() => {
  document.removeEventListener('selectionchange', handleSelectionChange)
})

// 暴露方法：供父组件设置内容与聚焦
defineExpose({
  /** 设置输入框内容并同步内部状态 */
  setContent(text: string) {
    content.value = text || ''
    if (textareaRef.value) {
      textareaRef.value.textContent = content.value
    }
    autoResizeTextarea()
  },
  /** 聚焦到输入框 */
  focus() {
    nextTick(() => textareaRef.value?.focus())
  }
})

</script>

<style scoped>
/* 输入框基础样式 - 固定行高以稳定 caret 定位 */
.aislash-editor-input {
  line-height: 18px;
}

/* 移除输入框聚焦时的边框 */
.aislash-editor-input:focus {
  outline: none !important;
  border: none !important;
}

/* 移除父容器聚焦时的边框 */
.full-input-box:focus-within {
  border-color: var(--vscode-input-border) !important;
  outline: none !important;
}

/* Placeholder 样式 */
.aislash-editor-input:empty::before {
  content: attr(data-placeholder);
  color: var(--vscode-input-placeholderForeground);
  pointer-events: none;
  position: absolute;
}

.aislash-editor-input:focus:empty::before {
  content: attr(data-placeholder);
  color: var(--vscode-input-placeholderForeground);
  pointer-events: none;
}

/* 附件列表样式 - 水平排列的 pills */
.attachments-list {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  width: 100%;
  box-sizing: border-box;
  min-height: 20px;
  /* max-height: 44px; */
  overflow: hidden;
}

.attachment-item {
  display: inline-flex;
  align-items: center;
  padding-right: 4px;
  border: 1px solid var(--vscode-editorWidget-border);
  border-radius: 4px;
  font-size: 12px;
  flex-shrink: 0;
  max-width: 200px;
  cursor: pointer;
  transition: all 0.15s;
  position: relative;
  outline: none;
  line-height: 16px;
  height: 20px;
}

.attachment-item:hover {
  background-color: var(--vscode-list-hoverBackground);
  border-color: var(--vscode-focusBorder);
}

/* 图标和关闭按钮的重叠容器 */
.icon-wrapper {
  position: relative;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.attachment-icon {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  opacity: 1;
  transition: opacity 0.15s ease;
  scale: 0.8;
}

/* 确保图标样式正确应用（使用 :deep 穿透到 FileIcon 内部） */
.attachment-item .attachment-icon :deep(.mdi),
.attachment-item .attachment-icon :deep(.codicon) {
  color: var(--vscode-foreground);
  opacity: 0.8;
}

.attachment-name {
  flex-shrink: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--vscode-foreground);
  opacity: 1;
  max-width: 140px;
}

.attachment-size {
  display: none; /* 隐藏文件大小，保持简洁 */
}

.remove-button {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  background: none;
  border: none;
  border-radius: 2px;
  cursor: pointer;
  color: var(--vscode-foreground);
  opacity: 0;
  transition: opacity 0.15s ease;
}

.remove-button .codicon {
  font-size: 14px;
}

/* hover attachment-item 时切换图标和按钮的显示 */
.attachment-item:hover .attachment-icon {
  opacity: 0;
}

.attachment-item:hover .remove-button {
  opacity: 0.8;
}

.remove-button:hover {
  opacity: 1 !important;
}

</style>
