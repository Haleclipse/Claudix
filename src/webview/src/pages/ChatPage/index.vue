<script setup lang="ts">
import ChatHeader from './components/ChatHeader.vue';
import ChatMessageList from './components/ChatMessageList.vue';
import { ref, computed, inject, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { RuntimeKey } from '../../composables/runtimeContext';
import { useSession } from '../../composables/useSession';
import type { Session } from '../../core/Session';
import type { PermissionRequest } from '../../core/PermissionRequest';
import type { ToolContext } from '../../types/tool';
import type { AttachmentItem } from '../../types/attachment';
import { convertFileToAttachment } from '../../types/attachment';
import ChatInputBox from '../../components/ChatInputBox.vue';
import PermissionRequestModal from '../../components/PermissionRequestModal.vue';
import { useKeybinding } from '../../utils/useKeybinding';
import { useSignal } from '@gn8/alien-signals-vue';
import type { PermissionMode } from '@anthropic-ai/claude-agent-sdk';

const runtime = inject(RuntimeKey);
if (!runtime) throw new Error('[ChatPage] runtime not provided');

const toolContext = computed<ToolContext>(() => ({
  fileOpener: {
    open: (filePath: string, location?: any) => {
      void runtime.appContext.fileOpener.open(filePath, location);
    },
    openContent: (content: string, fileName: string, editable: boolean) => {
      return runtime.appContext.fileOpener.openContent(
        content,
        fileName,
        editable
      );
    },
  },
}));

// 订阅 activeSession（alien-signal → Vue ref）
const activeSessionRaw = useSignal<Session | undefined>(
  runtime.sessionStore.activeSession
);

// 使用 useSession 将 alien-signals 转换为 Vue Refs
const session = computed(() => {
  const raw = activeSessionRaw.value;
  return raw ? useSession(raw) : null;
});

// 现在所有访问都使用 Vue Ref（.value）
const title = computed(() => session.value?.summary.value || 'New Conversation');
const messages = computed<any[]>(() => session.value?.messages.value ?? []);
const isBusy = computed(() => session.value?.busy.value ?? false);
const permissionMode = computed(
  () => session.value?.permissionMode.value ?? 'default'
);
const permissionRequests = computed(
  () => session.value?.permissionRequests.value ?? []
);
const permissionRequestsLen = computed(() => permissionRequests.value.length);
const pendingPermission = computed(() => permissionRequests.value[0] as any);
const platform = computed(() => runtime.appContext.platform);

// 注册命令：permissionMode.toggle（在下方定义函数后再注册）

// 估算 Token 使用占比（基于 usageData）
const progressPercentage = computed(() => {
  const s = session.value;
  if (!s) return 0;

  const usage = s.usageData.value;
  const total = usage.totalTokens;
  const windowSize = usage.contextWindow || 200000;

  if (typeof total === 'number' && total > 0) {
    return Math.max(0, Math.min(100, (total / windowSize) * 100));
  }

  return 0;
});

// DOM refs
const messageListRef = ref<InstanceType<typeof ChatMessageList> | null>(null);

// 附件状态管理
const attachments = ref<AttachmentItem[]>([]);

// 记录上次消息数量，用于判断是否需要滚动
let prevCount = 0;

function scrollToBottom(): void {
  messageListRef.value?.scrollToBottom();
}

watch(session, async () => {
  // 切换会话：复位并滚动底部
  prevCount = 0;
  await nextTick();
  scrollToBottom();
});

// moved above

watch(
  () => messages.value.length,
  async len => {
    const increased = len > prevCount;
    prevCount = len;
    if (increased) {
      await nextTick();
      scrollToBottom();
    }
  }
);

watch(permissionRequestsLen, async () => {
  // 有权限请求出现时也确保滚动到底部
  await nextTick();
  scrollToBottom();
});

onMounted(async () => {
  prevCount = messages.value.length;
  await nextTick();
  scrollToBottom();
});

onUnmounted(() => {
  try { unregisterToggle?.(); } catch { }
});

async function newChat(): Promise<void> {
  if (!runtime) return;

  // 1. 先尝试通过 appContext.startNewConversationTab 创建新标签（多标签模式）
  if (runtime.appContext.startNewConversationTab()) {
    return;
  }

  // 2. 如果不是多标签模式，检查当前会话是否为空
  const currentMessages = messages.value;
  if (currentMessages.length === 0) {
    // 当前已经是空会话，无需创建新会话
    return;
  }

  // 3. 当前会话有内容，创建新会话
  await runtime.sessionStore.createSession({ isExplicit: true });
}

// ChatInput 事件处理
async function handleSubmit(content: string) {
  const s = session.value;
  const trimmed = (content || '').trim();
  if (!s || (!trimmed && attachments.value.length === 0) || isBusy.value) return;

  try {
    // 传递附件给 send 方法
    await s.send(trimmed || ' ', attachments.value);

    // 发送成功后清空附件
    attachments.value = [];
  } catch (e) {
    console.error('[ChatPage] send failed', e);
  }
}

async function handleToggleThinking() {
  const s = session.value;
  if (!s) return;

  const currentLevel = s.thinkingLevel.value;
  const newLevel = currentLevel === 'off' ? 'default_on' : 'off';

  await s.setThinkingLevel(newLevel);
}

async function handleModeSelect(mode: PermissionMode) {
  const s = session.value;
  if (!s) return;

  await s.setPermissionMode(mode);
}

// permissionMode.toggle：按固定顺序轮转
const togglePermissionMode = () => {
  const s = session.value;
  if (!s) return;
  const order: PermissionMode[] = ['default', 'acceptEdits', 'plan'];
  const cur = (s.permissionMode.value as PermissionMode) ?? 'default';
  const idx = Math.max(0, order.indexOf(cur));
  const next = order[(idx + 1) % order.length];
  void s.setPermissionMode(next);
};

// 现在注册命令（toggle 已定义）
const unregisterToggle = runtime.appContext.commandRegistry.registerAction(
  {
    id: 'permissionMode.toggle',
    label: 'Toggle Permission Mode',
    description: 'Cycle permission mode in fixed order'
  },
  'App Shortcuts',
  () => {
    togglePermissionMode();
  }
);

// 注册快捷键：shift+tab → permissionMode.toggle（允许在输入区生效）
useKeybinding({
  keys: 'shift+tab',
  handler: togglePermissionMode,
  allowInEditable: true,
  priority: 100,
});

async function handleModelSelect(modelId: string) {
  const s = session.value;
  if (!s) return;

  await s.setModel({ value: modelId });
}

function handleStop() {
  const s = session.value;
  if (s) {
    // 方法已经在 useSession 中绑定，可以直接调用
    void s.interrupt();
  }
}

async function handleAddAttachment(files: FileList) {
  if (!files || files.length === 0) return;

  try {
    // 将所有文件转换为 AttachmentItem
    const conversions = await Promise.all(
      Array.from(files).map(convertFileToAttachment)
    );

    // 添加到附件列表
    attachments.value = [...attachments.value, ...conversions];

    console.log('[ChatPage] Added attachments:', conversions.map(a => a.fileName));
  } catch (e) {
    console.error('[ChatPage] Failed to convert files:', e);
  }
}

function handleRemoveAttachment(id: string) {
  attachments.value = attachments.value.filter(a => a.id !== id);
}

// Permission modal handler
function handleResolvePermission(request: PermissionRequest, allow: boolean) {
  try {
    if (allow) {
      request.accept(request.inputs);
    } else {
      request.reject('User denied', true);
    }
  } catch (e) {
    console.error('[ChatPage] permission resolve failed', e);
  }
}
</script>

<template>
  <div class="chat-page">
    <ChatHeader :title="title" @newChat="newChat" @menuClick="$emit('switchToSessions')" />
    <!-- 主体：消息容器 -->
    <div class="main">
      <ChatMessageList ref="messageListRef" :messages="messages" :is-busy="isBusy"
        :permission-requests-len="permissionRequestsLen" :platform="platform" :tool-context="toolContext"
        :permission-mode="permissionMode" />
      <div class="inputContainer">
        <PermissionRequestModal v-if="pendingPermission && toolContext" :request="pendingPermission"
          :context="toolContext" :on-resolve="handleResolvePermission" data-permission-panel="1" />
        <ChatInputBox :show-progress="true" :progress-percentage="progressPercentage" :conversation-working="isBusy"
          :attachments="attachments" :thinking-level="session?.thinkingLevel.value"
          :permission-mode="session?.permissionMode.value" :selected-model="session?.modelSelection.value"
          @submit="handleSubmit" @stop="handleStop" @add-attachment="handleAddAttachment"
          @remove-attachment="handleRemoveAttachment" @thinking-toggle="handleToggleThinking"
          @mode-select="handleModeSelect" @model-select="handleModelSelect" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-page {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}

/* 输入区域容器 */
.inputContainer {
  padding: 8px 12px 12px;
}

/* 底部对话框区域钉在底部 */
.main> :last-child {
  flex-shrink: 0;
  background-color: var(--vscode-sideBar-background);
  /* border-top: 1px solid var(--vscode-panel-border); */
  max-width: 1200px;
  width: 100%;
  align-self: center;
}
</style>