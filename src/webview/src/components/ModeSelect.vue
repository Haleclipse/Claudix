<template>
  <DropdownTrigger
    align="left"
    :close-on-click-outside="true"
  >
    <template #trigger>
      <div class="mode-dropdown">
        <div class="dropdown-content">
          <div :class="['codicon', selectedModeIcon, 'dropdown-icon', 'text-[14px]!']" />
          <div class="dropdown-text">
            <span class="dropdown-label">{{ selectedModeLabel }}</span>
          </div>
        </div>
        <div class="codicon codicon-chevron-up chevron-icon text-[12px]!" />
      </div>
    </template>

    <template #content="{ close }">
      <DropdownItem
        :item="{
          id: 'default',
          label: 'Default',
          icon: 'codicon-chat text-[14px]!',
          checked: permissionMode === 'default',
          type: 'default-mode'
        }"
        :is-selected="permissionMode === 'default'"
        :index="0"
        @click="(item) => handleModeSelect(item, close)"
      />
      <DropdownItem
        :item="{
          id: 'acceptEdits',
          label: 'Agent',
          icon: 'codicon-infinity text-[14px]!',
          checked: permissionMode === 'acceptEdits',
          type: 'agent-mode'
        }"
        :is-selected="permissionMode === 'acceptEdits'"
        :index="1"
        @click="(item) => handleModeSelect(item, close)"
      />
      <DropdownItem
        :item="{
          id: 'plan',
          label: 'Plan',
          icon: 'codicon-todos text-[14px]!',
          checked: permissionMode === 'plan',
          type: 'plan-mode'
        }"
        :is-selected="permissionMode === 'plan'"
        :index="2"
        @click="(item) => handleModeSelect(item, close)"
      />
      <DropdownItem
        :item="{
          id: 'bypassPermissions',
          label: 'Bypass',
          icon: 'codicon-warning text-[14px]!',
          checked: permissionMode === 'bypassPermissions',
          type: 'bypass-mode'
        }"
        :is-selected="permissionMode === 'bypassPermissions'"
        :index="3"
        @click="(item) => handleModeSelect(item, close)"
      />
    </template>
  </DropdownTrigger>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PermissionMode } from '@anthropic-ai/claude-agent-sdk'
import { DropdownTrigger, DropdownItem, type DropdownItemData } from './Dropdown'

interface Props {
  permissionMode?: PermissionMode
}

interface Emits {
  (e: 'modeSelect', mode: PermissionMode): void
}

const props = withDefaults(defineProps<Props>(), {
  permissionMode: 'default'
})

const emit = defineEmits<Emits>()

// 计算显示的模式名称
const selectedModeLabel = computed(() => {
  switch (props.permissionMode) {
    case 'acceptEdits':
      return 'Agent'
    case 'plan':
      return 'Plan'
    case 'bypassPermissions':
      return 'Bypass'
    case 'default':
      return 'Default'
    default:
      return 'Default'
  }
})

// 计算显示的图标
const selectedModeIcon = computed(() => {
  switch (props.permissionMode) {
    case 'acceptEdits':
      return 'codicon-infinity'
    case 'plan':
      return 'codicon-todos'
    case 'bypassPermissions':
      return 'codicon-warning'
    case 'default':
      return 'codicon-chat'
    default:
      return 'codicon-chat'
  }
})

function handleModeSelect(item: DropdownItemData, close: () => void) {
  console.log('Selected mode:', item)
  close()

  // 发送模式切换事件
  emit('modeSelect', item.id as PermissionMode)
}
</script>

<style scoped>
/* Mode 下拉样式 - 匹配 Agent 按钮样式 */
.mode-dropdown {
  display: flex;
  gap: 4px;
  font-size: 12px;
  align-items: center;
  line-height: 24px;
  min-width: 0;
  max-width: 100%;
  padding: 2px 4px 2px 6px;
  border-radius: 24px;
  flex-shrink: 0;
  cursor: pointer;
  border: none;
  background: color-mix(in srgb, var(--vscode-foreground) 20%, transparent);
  transition: background-color 0.2s ease;
  opacity: .8;
}

.mode-dropdown:hover {
  opacity: 1;
}

.dropdown-content {
  display: flex;
  align-items: center;
  gap: 3px;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}

.dropdown-icon {
  font-size: 14px;
  flex-shrink: 0;
  width: 15px;
  height: 15px;
  display: flex !important;
  align-items: center;
  justify-content: center;
  opacity: 0.5;
}

.dropdown-text {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 12px;
  display: flex;
  align-items: baseline;
  gap: 3px;
  height: 13px;
  font-weight: 400;
}

.dropdown-label {
  opacity: 0.8;
  max-width: 120px;
  overflow: hidden;
  height: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.chevron-icon {
  font-size: 9px;
  flex-shrink: 0;
  opacity: 0.5;
  color: var(--vscode-foreground);
}
</style>
