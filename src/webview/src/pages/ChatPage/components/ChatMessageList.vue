<script setup lang="ts">
import { ref } from 'vue';
import ClaudeWordmark from '@/components/ClaudeWordmark.vue';
import RandomTip from '@/components/RandomTip.vue';
import MessageRenderer from '@/components/Messages/MessageRenderer.vue';
import Spinner from '@/components/Messages/WaitingIndicator.vue';
import type { ToolContext } from '@/types/tool';
import type { PermissionMode } from '@anthropic-ai/claude-agent-sdk';

// Props
interface Props {
  messages: any[];
  isBusy: boolean;
  permissionRequestsLen: number;
  platform: string;
  toolContext: ToolContext;
  permissionMode: PermissionMode;
}

const props = defineProps<Props>();

// Refs
const endEl = ref<HTMLDivElement | null>(null);

// 暴露滚动方法供父组件调用
function scrollToBottom(): void {
  const end = endEl.value;
  if (!end) return;
  requestAnimationFrame(() => {
    try {
      end.scrollIntoView({ block: 'end' });
    } catch { }
  });
}

defineExpose({
  scrollToBottom
});
</script>

<template>
  <div :class="['messagesContainer', 'custom-scroll-container', { dimmed: permissionRequestsLen > 0 }]">
    <template v-if="messages.length === 0">
      <div class="emptyState">
        <div class="emptyWordmark">
          <ClaudeWordmark class="emptyWordmarkSvg" />
        </div>
        <RandomTip v-if="!isBusy" :platform="platform" />
      </div>
    </template>
    <template v-else>
      <MessageRenderer v-for="(m, i) in messages" :key="m?.id ?? i" :message="m" :context="toolContext" />
      <div v-if="isBusy" class="spinnerRow">
        <Spinner :size="16" :permission-mode="permissionMode" />
      </div>
      <div ref="endEl" class="scroll-anchor" />
    </template>
  </div>
</template>

<style scoped>
.messagesContainer {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px 0 12px;
  position: relative;
}

.messagesContainer.dimmed {
  filter: blur(1px);
  opacity: 0.5;
  pointer-events: none;
}

.scroll-anchor {
  height: 0;
  width: 0;
}

/* 空状态样式 */
.emptyState {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 32px 16px;
}

.emptyWordmark {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24px;
}
</style>