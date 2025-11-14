<template>
  <div class="button-area-container">
    <div class="button-row">
      <!-- Left Section: Dropdowns -->
      <div class="controls-section">
        <!-- Mode Select -->
        <ModeSelect
          :permission-mode="permissionMode"
          @mode-select="(mode) => emit('modeSelect', mode)"
        />

        <!-- Model Select -->
        <ModelSelect
          :selected-model="selectedModel"
          @model-select="(modelId) => emit('modelSelect', modelId)"
        />
      </div>

      <!-- Right Section: Token Indicator + Action Buttons -->
      <div class="actions-section">
        <!-- Token Indicator -->
        <TokenIndicator
          v-if="showProgress"
          :percentage="progressPercentage"
        />

        <!-- Thinking Toggle Button -->
        <button
          class="action-button think-button"
          :class="{ 'thinking-active': isThinkingOn }"
          data-responsive="hide-small"
          @click="handleThinkingToggle"
          :aria-label="isThinkingOn ? 'Thinking on' : 'Thinking off'"
          :title="isThinkingOn ? 'Thinking on' : 'Thinking off'"
        >
          <span class="codicon codicon-brain text-[16px]!" />
        </button>

        <!-- Command Button with Dropdown -->
        <DropdownTrigger
          ref="commandDropdownRef"
          :show-search="true"
          search-placeholder="Filter commands..."
          align="left"
          :selected-index="commandCompletion.activeIndex.value"
          :data-nav="commandCompletion.navigationMode.value"
          @open="handleDropdownOpen"
          @close="handleDropdownClose"
          @search="handleSearch"
        >
          <!-- 自定义触发器按钮 -->
          <template #trigger>
            <button
              class="action-button"
              data-responsive="hide-small"
              aria-label="Slash Commands"
            >
              <span class="codicon codicon-italic text-[16px]!" />
            </button>
          </template>

          <!-- 下拉内容 -->
          <template #content="{ close }">
            <div @mouseleave="commandCompletion.handleMouseLeave">
              <template v-for="(item, index) in commandCompletion.items.value" :key="item.id">
                <DropdownSeparator v-if="item.type === 'separator'" />
                <DropdownSectionHeader v-else-if="item.type === 'section-header'" :text="item.text" />
                <DropdownItem
                  v-else
                  :item="item"
                  :index="index"
                  :is-selected="index === commandCompletion.activeIndex.value"
                  @click="(item) => handleCommandClick(item, close)"
                  @mouseenter="commandCompletion.handleMouseEnter(index)"
                />
              </template>
            </div>
          </template>
        </DropdownTrigger>

        <!-- Mention Button with Dropdown -->
        <DropdownTrigger
          ref="mentionDropdownRef"
          :show-search="true"
          search-placeholder="Search files..."
          align="left"
          :selected-index="fileCompletion.activeIndex.value"
          :data-nav="fileCompletion.navigationMode.value"
          @open="handleMentionDropdownOpen"
          @close="handleMentionDropdownClose"
          @search="handleMentionSearch"
        >
          <!-- 自定义触发器按钮 -->
          <template #trigger>
            <button
              class="action-button"
              aria-label="Mention File"
            >
              <span class="codicon codicon-mention text-[16px]!" />
            </button>
          </template>

          <!-- 下拉内容 -->
          <template #content="{ close }">
            <div @mouseleave="fileCompletion.handleMouseLeave">
              <template v-for="(item, index) in fileCompletion.items.value" :key="item.id">
                <DropdownItem
                  :item="item"
                  :index="index"
                  :is-selected="index === fileCompletion.activeIndex.value"
                  @click="(item) => handleFileClick(item, close)"
                  @mouseenter="fileCompletion.handleMouseEnter(index)"
                >
                  <!-- 使用 FileIcon 组件显示文件图标 -->
                  <template #icon v-if="'data' in item && item.data?.file">
                    <FileIcon :file-name="item.data.file.name" :size="16" />
                  </template>
                </DropdownItem>
              </template>
            </div>
          </template>
        </DropdownTrigger>

        <!-- Sparkle Button -->
        <button
          class="action-button"
          @click="handleSparkleClick"
          aria-label="Sparkle"
        >
          <span class="codicon codicon-wand text-[16px]!" />
        </button>

        <!-- Attach File Button -->
        <button
          class="action-button"
          @click="handleAttachClick"
          aria-label="Attach File"
        >
          <span class="codicon codicon-attach text-[16px]!" />
          <input
            ref="fileInputRef"
            type="file"
            multiple
            style="display: none;"
            @change="handleFileUpload"
          >
        </button>

        <!-- Submit Button -->
        <button
          class="submit-button"
          @click="handleSubmit"
          :disabled="submitVariant === 'disabled'"
          :data-variant="submitVariant"
          :aria-label="submitVariant === 'stop' ? 'Stop Conversation' : 'Send Message'"
        >
          <span
            v-if="submitVariant === 'stop'"
            class="codicon codicon-debug-stop text-[12px]! bg-(--vscode-editor-background)e-[0.6] rounded-[1px]"
          />
          <span
            v-else
            class="codicon codicon-arrow-up-two text-[12px]!"
          />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PermissionMode } from '@anthropic-ai/claude-agent-sdk'
import { ref, computed, inject } from 'vue'
import TokenIndicator from './TokenIndicator.vue'
import ModeSelect from './ModeSelect.vue'
import ModelSelect from './ModelSelect.vue'
import FileIcon from './FileIcon.vue'
import { DropdownTrigger, DropdownItem, DropdownSeparator, DropdownSectionHeader } from './Dropdown'
import { RuntimeKey } from '../composables/runtimeContext'
import { useCompletionDropdown } from '../composables/useCompletionDropdown'
import { getSlashCommands, commandToDropdownItem } from '../providers/slashCommandProvider'
import { getFileReferences, fileToDropdownItem } from '../providers/fileReferenceProvider'

interface Props {
  disabled?: boolean
  loading?: boolean
  selectedModel?: string
  conversationWorking?: boolean
  hasInputContent?: boolean
  showProgress?: boolean
  progressPercentage?: number
  thinkingLevel?: string
  permissionMode?: PermissionMode
}

interface Emits {
  (e: 'submit'): void
  (e: 'stop'): void
  (e: 'attach'): void
  (e: 'addAttachment', files: FileList): void
  (e: 'mention', filePath?: string): void
  (e: 'thinkingToggle'): void
  (e: 'sparkle'): void
  (e: 'modeSelect', mode: PermissionMode): void
  (e: 'modelSelect', modelId: string): void
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  loading: false,
  selectedModel: 'claude-sonnet-4-5',
  conversationWorking: false,
  hasInputContent: false,
  showProgress: true,
  progressPercentage: 48.7,
  thinkingLevel: 'default_on',
  permissionMode: 'default'
})

const emit = defineEmits<Emits>()

const fileInputRef = ref<HTMLInputElement>()
const commandDropdownRef = ref<InstanceType<typeof DropdownTrigger>>()
const mentionDropdownRef = ref<InstanceType<typeof DropdownTrigger>>()

// 获取 runtime 以访问 CommandRegistry
const runtime = inject(RuntimeKey)

// === 使用新的 Completion Dropdown Composable ===

// Slash Command 补全
const commandCompletion = useCompletionDropdown({
  mode: 'manual',
  provider: (query) => getSlashCommands(query, runtime),
  toDropdownItem: commandToDropdownItem,
  onSelect: (command) => {
    // 执行命令
    if (runtime) {
      runtime.appContext.commandRegistry.executeCommand(command.id)
    }
    commandCompletion.close()
  },
  showSectionHeaders: false, // 目前不显示分组，保持简洁
  searchFields: ['label', 'description']
})

// @ 文件引用补全
const fileCompletion = useCompletionDropdown({
  mode: 'manual',
  provider: (query) => getFileReferences(query, runtime),
  toDropdownItem: fileToDropdownItem,
  onSelect: (file) => {
    // 触发 mention 事件并传递文件路径
    emit('mention', file.path)
    fileCompletion.close()
  },
  showSectionHeaders: false,
  searchFields: ['name', 'path']
})


const isThinkingOn = computed(() => props.thinkingLevel !== 'off')

const submitVariant = computed(() => {
  // 对齐 React：busy 时始终显示停止按钮
  if (props.conversationWorking) {
    return 'stop'
  }

  // 未 busy 且无输入 -> 禁用
  if (!props.hasInputContent) {
    return 'disabled'
  }

  // 其余 -> 可发送
  return 'enabled'
})

function handleSubmit() {
  if (submitVariant.value === 'stop') {
    emit('stop')
  } else if (submitVariant.value === 'enabled') {
    emit('submit')
  }
}

// Command dropdown handlers
function handleCommandClick(item: any, close: () => void) {
  console.log('Command clicked:', item)

  // 使用 commandCompletion 选择命令
  if (item.data?.command) {
    // 找到命令在列表中的索引并选择
    const index = commandCompletion.items.value.findIndex(i => i.id === item.id)
    if (index !== -1) {
      commandCompletion.selectIndex(index)
    }
  }

  // 关闭菜单
  close()
}

// File (Mention) dropdown handlers
function handleFileClick(item: any, close: () => void) {
  console.log('File clicked:', item)

  // 使用 fileCompletion 选择文件
  if (item.data?.file) {
    const index = fileCompletion.items.value.findIndex(i => i.id === item.id)
    if (index !== -1) {
      // 先设置 activeIndex，再调用 selectActive
      fileCompletion.activeIndex.value = index
      fileCompletion.selectActive()
    }
  }

  // 关闭菜单
  close()
}

function handleThinkingToggle() {
  emit('thinkingToggle')
}

function handleSparkleClick() {
  emit('sparkle')
}

function handleAttachClick() {
  fileInputRef.value?.click()
}

function handleFileUpload(event: Event) {
  const target = event.target as HTMLInputElement
  if (target.files && target.files.length > 0) {
    emit('addAttachment', target.files)
    // 清空 input，允许重复选择同一文件
    target.value = ''
  }
}

// Command dropdown - 打开时的处理
function handleDropdownOpen() {
  commandCompletion.open()
  // 添加键盘事件监听
  document.addEventListener('keydown', handleCommandKeydown)
}

// Command dropdown - 关闭时的处理
function handleDropdownClose() {
  commandCompletion.close()
  // 移除键盘事件监听
  document.removeEventListener('keydown', handleCommandKeydown)
}

// Command dropdown - 搜索事件处理
function handleSearch(term: string) {
  commandCompletion.handleSearch(term)
}

// Command dropdown - 键盘事件处理
function handleCommandKeydown(event: KeyboardEvent) {
  commandCompletion.handleKeydown(event)
}

// Mention dropdown - 打开时的处理
function handleMentionDropdownOpen() {
  fileCompletion.open()
  // 添加键盘事件监听
  document.addEventListener('keydown', handleMentionKeydown)
}

// Mention dropdown - 关闭时的处理
function handleMentionDropdownClose() {
  fileCompletion.close()
  // 移除键盘事件监听
  document.removeEventListener('keydown', handleMentionKeydown)
}

// Mention dropdown - 搜索事件处理
function handleMentionSearch(term: string) {
  fileCompletion.handleSearch(term)
}

// Mention dropdown - 键盘事件处理
function handleMentionKeydown(event: KeyboardEvent) {
  fileCompletion.handleKeydown(event)
}

</script>

<style scoped>
.button-area-container {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.25rem;
  flex-shrink: 0;
  cursor: auto;
  width: 100%;
  container-type: inline-size;
  container-name: toolbar;
}

.button-row {
  display: grid;
  grid-template-columns: 4fr 1fr;
  align-items: center;
  height: 28px;
  padding-right: 2px;
  box-sizing: border-box;
  flex: 1 1 0%;
  justify-content: space-between;
  width: 100%;
}

.controls-section {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-right: 6px;
  flex-shrink: 1;
  flex-grow: 0;
  min-width: 0;
  height: 20px;
  max-width: 100%;
}

.actions-section {
  display: flex;
  align-items: center;
  gap: 4px;
  justify-content: flex-end;
}

.action-button,
.submit-button {
  opacity: 0.5;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 17px;
  height: 17px;
  border: none;
  background: transparent;
  border-radius: 50%;
  cursor: pointer;
  transition: background-color 0.2s ease, opacity 0.2s ease;
  color: var(--vscode-foreground);
  position: relative;
}


.action-button:hover:not(:disabled) {
  opacity: 1;
}

.action-button:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.action-button.thinking-active {
  color: var(--vscode-button-secondaryForeground);
  opacity: 1;
}

/* Think 按钮专用：取消 hover opacity 效果，避免 off 状态下的误解 */
.action-button.think-button:hover:not(.thinking-active) {
  opacity: 0.5; /* 保持默认 opacity，不增加到 1 */
}

/* 激活状态下的 hover 可以保持 */
.action-button.think-button.thinking-active:hover {
  opacity: 1;
}

.submit-button {
  scale: 1.1;
}

.submit-button[data-variant="enabled"] {
  background-color: color-mix(in srgb, var(--vscode-editor-foreground) 80%, transparent);
  color: var(--vscode-editor-background);
  opacity: 1;
  outline: 1.5px solid color-mix(in srgb, var(--vscode-editor-foreground) 60%, transparent);
  outline-offset: 1px;
}

.submit-button[data-variant="disabled"] {
  background-color: color-mix(in srgb, var(--vscode-editor-foreground) 80%, transparent);
  color: var(--vscode-editor-background);
  opacity: 0.5;
  cursor: not-allowed;
}

.submit-button[data-variant="stop"] {
  background-color: color-mix(in srgb, var(--vscode-editor-foreground) 80%, transparent);
  color: var(--vscode-editor-background);
  opacity: 1;
  outline: 1.5px solid color-mix(in srgb, var(--vscode-editor-foreground) 60%, transparent);
  outline-offset: 1px;
}


.codicon-modifier-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
