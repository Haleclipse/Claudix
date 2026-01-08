<template>
  <!-- Pass wrapper to blocks that need reactive streaming/toolResult access -->
  <!-- tool_use: needs wrapper for toolResult Signal -->
  <!-- text/thinking: needs wrapper for streaming text Signal -->
  <component
    v-if="needsWrapper"
    :is="blockComponent"
    :block="block"
    :wrapper="wrapper"
    :context="context"
  />
  <!-- Other types don't need wrapper -->
  <component
    v-else
    :is="blockComponent"
    :block="block"
    :context="context"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ContentBlockType } from '../../models/ContentBlock';
import type { ContentBlockWrapper } from '../../models/ContentBlockWrapper';
import type { ToolContext } from '../../types/tool';

// 导入所有内容块组件
import TextBlock from './blocks/TextBlock.vue';
import ThinkingBlock from './blocks/ThinkingBlock.vue';
import ImageBlock from './blocks/ImageBlock.vue';
import DocumentBlock from './blocks/DocumentBlock.vue';
import InterruptBlock from './blocks/InterruptBlock.vue';
import SelectionBlock from './blocks/SelectionBlock.vue';
import OpenedFileBlock from './blocks/OpenedFileBlock.vue';
import DiagnosticsBlock from './blocks/DiagnosticsBlock.vue';
import ToolBlock from './blocks/ToolBlock.vue';
import ToolResultBlock from './blocks/ToolResultBlock.vue';
import UnknownBlock from './blocks/UnknownBlock.vue';

interface Props {
  block: ContentBlockType;
  context?: ToolContext;
  wrapper?: ContentBlockWrapper;
}

const props = defineProps<Props>();

// Blocks that need wrapper for reactive streaming or toolResult access
const needsWrapper = computed(() => {
  const type = props.block.type;
  return type === 'tool_use' || type === 'text' || type === 'thinking';
});

// Select component based on block.type
const blockComponent = computed(() => {
  switch (props.block.type) {
    case 'text':
      return TextBlock;
    case 'thinking':
      return ThinkingBlock;
    case 'image':
      return ImageBlock;
    case 'document':
      return DocumentBlock;
    case 'interrupt':
      return InterruptBlock;
    case 'selection':
      return SelectionBlock;
    case 'opened_file':
      return OpenedFileBlock;
    case 'diagnostics':
      return DiagnosticsBlock;
    case 'tool_use':
      return ToolBlock;
    case 'tool_result':
      return ToolResultBlock;
    default:
      return UnknownBlock;
  }
});
</script>
