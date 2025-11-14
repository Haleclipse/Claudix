<template>
  <div class="tool-message-wrapper">
    <!-- 自定义布局模式 -->
    <template v-if="isCustomLayout">
      <slot name="custom"></slot>
    </template>

    <!-- 标准布局模式 -->
    <template v-else>
      <!-- 主信息行 -->
      <div
        class="main-line"
        :class="{ 'is-expandable': hasExpandableContent }"
        @click="toggleExpand"
        @mouseenter="isHovered = true"
        @mouseleave="isHovered = false"
      >
        <!-- 工具图标 -->
        <button class="tool-icon-btn" :title="toolName">
          <span
            v-if="!isHovered || !hasExpandableContent"
            class="codicon"
            :class="toolIcon"
          ></span>
          <span
            v-else-if="isExpanded"
            class="codicon codicon-fold"
          ></span>
          <span
            v-else
            class="codicon codicon-chevron-up-down"
          ></span>
        </button>

        <!-- 主内容 -->
        <div class="main-content">
          <slot name="main"></slot>
        </div>

        <!-- 状态指示器 -->
        <ToolStatusIndicator
          v-if="indicatorState"
          :state="indicatorState"
          class="status-indicator-trailing"
        />
      </div>

      <!-- 展开内容 -->
      <div v-if="hasExpandableContent && isExpanded" class="expandable-content">
        <slot name="expandable"></slot>
      </div>
    </template>

    <!-- 权限审批按钮 -->
    <div v-if="permissionState === 'pending'" class="permission-actions">
      <button @click.stop="$emit('deny')" class="btn-reject">
        <span>Reject</span>
      </button>
      <button @click.stop="$emit('allow')" class="btn-accept">
        <span>Accept</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, useSlots } from 'vue';
import ToolStatusIndicator from './ToolStatusIndicator.vue';

interface Props {
  toolIcon?: string;
  toolName?: string;
  toolResult?: any;
  permissionState?: string;
  defaultExpanded?: boolean;
  isCustomLayout?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  defaultExpanded: false,
  isCustomLayout: false,
  toolIcon: 'codicon-tools',
  toolName: 'Tool',
});

defineEmits<{
  allow: [];
  deny: [];
}>();

const slots = useSlots();

// 检测是否有展开内容
const hasExpandableContent = computed(() => {
  return !!slots.expandable || !!props.toolResult?.is_error;
});

// 展开状态
const userToggled = ref(false);
const userToggledState = ref(false);

const isExpanded = computed({
  get: () => {
    // 优先使用用户手动切换的状态
    if (userToggled.value) {
      return userToggledState.value;
    }
    // 否则根据 defaultExpanded 或错误状态决定
    return props.defaultExpanded || !!props.toolResult?.is_error;
  },
  set: (value) => {
    userToggled.value = true;
    userToggledState.value = value;
  },
});

const isHovered = ref(false);

// 状态计算
const indicatorState = computed<'success' | 'error' | 'pending' | null>(() => {
  if (props.toolResult?.is_error) return 'error';
  if (props.permissionState === 'pending') return 'pending';
  if (props.toolResult) return 'success';
  return null;
});

// 切换展开
function toggleExpand() {
  if (hasExpandableContent.value) {
    isExpanded.value = !isExpanded.value;
  }
}
</script>

<style scoped>
.tool-message-wrapper {
  display: flex;
  flex-direction: column;
  padding: 0px;
}

.main-line {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 0;
  user-select: none;
}

.main-line.is-expandable {
  cursor: pointer;
}

.main-line.is-expandable:hover {
  background-color: color-mix(in srgb, var(--vscode-list-hoverBackground) 30%, transparent);
}

.tool-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  padding: 2px;
  color: var(--vscode-foreground);
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.tool-icon-btn .codicon {
  font-size: 16px;
}

.main-content {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.status-indicator-trailing {
  margin-left: auto;
}

.expandable-content {
  padding: 4px 0 0px 16px;
  margin-left: 10px;
  border-left: 1px solid var(--vscode-panel-border);
}

/* 权限审批按钮 */
.permission-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 8px 0 4px;
  margin-left: 26px;
}

.btn-reject,
.btn-accept {
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 0.9em;
  cursor: pointer;
  border: 1px solid var(--vscode-button-border);
}

.btn-reject {
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
}

.btn-reject:hover {
  background: var(--vscode-button-secondaryHoverBackground);
}

.btn-accept {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
}

.btn-accept:hover {
  background: var(--vscode-button-hoverBackground);
}
</style>
