<template>
  <div class="assistant-message" :class="messageClasses">
    <template v-if="typeof message.message.content === 'string'">
      <ContentBlock :block="{ type: 'text', text: message.message.content }" :context="context" />
    </template>
    <template v-else>
      <ContentBlock
        v-for="(wrapper, index) in message.message.content"
        :key="index"
        :block="wrapper.content"
        :wrapper="wrapper"
        :context="context"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Message } from '../../models/Message';
import type { ToolContext } from '../../types/tool';
import ContentBlock from './ContentBlock.vue';

interface Props {
  message: Message;
  context: ToolContext;
}

const props = defineProps<Props>();

// 计算动态 class
const messageClasses = computed(() => {
  const content = props.message.message.content;

  // content 总是数组，检查是否包含 tool_use
  if (Array.isArray(content)) {
    const hasToolUse = content.some(wrapper => wrapper.content.type === 'tool_use');
    // 只有纯文本消息（没有 tool_use）才显示圆点
    return hasToolUse ? [] : ['prefix'];
  }

  return [];
});
</script>

<style scoped>
.assistant-message {
  display: block;
  outline: none;
  padding: 0px 16px 0.4rem;
  background-color: var(--vscode-sideBar-background);
  opacity: 1;
  font-size: 13px;
  line-height: 1.6;
  color: var(--vscode-editor-foreground);
  word-wrap: break-word;
  padding-left: 24px;
}

/* 只在纯文本消息时显示圆点 */
.assistant-message.prefix::before {
  content: "\25cf";
  position: absolute;
  left: 8px;
  padding-top: 2px;
  font-size: 10px;
  color: color-mix(in srgb, var(--vscode-foreground) 60%, transparent);
  z-index: 1;
}
</style>
