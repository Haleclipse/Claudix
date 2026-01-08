<template>
  <div
    class="mermaid-wrapper"
    @mouseenter="showActions = true"
    @mouseleave="showActions = false"
  >
    <MermaidBlockNode
      ref="mermaidRef"
      v-bind="$attrs"
      :show-header="true"
      :show-mode-toggle="false"
      :show-copy-button="false"
      :show-export-button="false"
      :show-fullscreen-button="true"
      :show-collapse-button="false"
      :show-zoom-controls="true"
      :enable-wheel-zoom="true"
      :is-strict="false"
      :is-dark="isDark"
      :worker-timeout-ms="WORKER_TIMEOUT_MS"
      :parse-timeout-ms="PARSE_TIMEOUT_MS"
      :render-timeout-ms="RENDER_TIMEOUT_MS"
      :full-render-timeout-ms="FULL_RENDER_TIMEOUT_MS"
      @open-modal="onOpenModal"
    >
      <!-- Empty slots to hide default content -->
      <template #header-left><span></span></template>
      <template #header-center><span></span></template>
    </MermaidBlockNode>

    <!-- Custom copy button positioned before the native fullscreen button -->
    <div class="action-buttons" :class="{ visible: showActions }">
      <button @click="copySource" :title="copied ? 'Copied!' : 'Copy source'">
        <span class="codicon" :class="copied ? 'codicon-check' : 'codicon-copy'"></span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * MermaidDiagram - Custom wrapper for markstream-vue's MermaidBlockNode
 *
 * This component uses a CSS hack approach to customize the library's UI:
 * - The library's header is kept enabled (required for fullscreen button to work)
 * - CSS transforms the header into floating action buttons on hover
 * - A custom copy button is positioned alongside the library's fullscreen button
 *
 * Security: `isStrict=false` is required to render all diagram types (bar charts,
 * Gantt charts, etc.). Strict mode uses securityLevel="strict" with DOM purification
 * that breaks these diagram types. Since this runs in VSCode's webview (already
 * sandboxed), loose security is acceptable here.
 *
 * Timeouts: Complex diagram types (xychart, gantt) use dynamic imports that may
 * take longer to load in the VSCode webview environment. We use increased timeout
 * values (5-15 seconds) compared to defaults (1.4-4 seconds) to prevent premature
 * timeout errors.
 *
 * The library uses Vue Teleport for the fullscreen modal, which is always rendered
 * regardless of header visibility. We hook into the @open-modal event to:
 * 1. Auto-scale the diagram to fit the fullscreen viewport
 * 2. Watch for modal close to reset the inline diagram zoom
 *
 * DOM selectors used here rely on markstream-vue's internal Tailwind classes.
 * If the library updates, these selectors may need adjustment.
 */
import { ref, useAttrs, nextTick, onUnmounted } from 'vue';
import { MermaidBlockNode } from 'markstream-vue';
import { useThemeDetector } from '../../utils/themeDetector';

// =============================================================================
// Configuration Constants
// =============================================================================

/** Padding around diagram in fullscreen modal (pixels) */
const FULLSCREEN_PADDING = 200;
/** Maximum auto-zoom scale (1.5 = 150%) */
const MAX_AUTO_ZOOM = 1.5;
/** Minimum scale threshold before auto-zoom activates (1.1 = 10% enlargement needed) */
const MIN_ZOOM_THRESHOLD = 1.1;
/** Dampening factor for zoom (0.7 = use 70% of calculated zoom) */
const ZOOM_DAMPENING_FACTOR = 0.7;
/** Zoom increment per click (library uses 0.1 per click, so 10 = 1x) */
const ZOOM_STEP_INCREMENT = 10;
/** Delay between zoom button clicks (ms) */
const CLICK_INTERVAL_MS = 20;
/** Delay before accessing modal after open event (ms) */
const MODAL_READY_DELAY_MS = 50;
/** Delay for SVG to render in modal before measuring (ms) */
const SVG_RENDER_DELAY_MS = 100;
/** Duration to show "Copied!" feedback (ms) */
const COPY_FEEDBACK_DURATION_MS = 2000;

/**
 * Timeout values for mermaid rendering - increased from defaults to handle
 * complex diagram types (xychart, gantt) that require dynamic imports
 */
/** Worker timeout for diagram parsing (default: 1400ms) */
const WORKER_TIMEOUT_MS = 5000;
/** Parse timeout (default: 1800ms) */
const PARSE_TIMEOUT_MS = 6000;
/** Render timeout (default: 2500ms) */
const RENDER_TIMEOUT_MS = 8000;
/** Full render timeout (default: 4000ms) */
const FULL_RENDER_TIMEOUT_MS = 15000;

// =============================================================================
// Types
// =============================================================================

/** Node data passed via attrs from markstream-vue */
interface MermaidNode {
  content?: string;
  raw?: string;
}

/**
 * Props interface - empty as this component uses passthrough via v-bind="$attrs"
 * All props are forwarded to MermaidBlockNode (e.g., node, content, etc.)
 */
interface Props {}
defineProps<Props>();

// =============================================================================
// State
// =============================================================================

const attrs = useAttrs();
const { isDark } = useThemeDetector();
const mermaidRef = ref<InstanceType<typeof MermaidBlockNode> | null>(null);
const showActions = ref(false);
const copied = ref(false);

// Module-level refs for lifecycle cleanup
let modalObserver: MutationObserver | null = null;
let zoomTimers: ReturnType<typeof setTimeout>[] = [];

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Clear any pending zoom animation timers
 */
const clearZoomTimers = () => {
  zoomTimers.forEach(clearTimeout);
  zoomTimers = [];
};

/**
 * Find a button containing "%" text (the reset/zoom level button)
 */
const findResetButton = (container: Element): HTMLButtonElement | null => {
  const buttons = container.querySelectorAll('button');
  for (const btn of buttons) {
    if (btn.textContent?.includes('%')) {
      return btn as HTMLButtonElement;
    }
  }
  return null;
};

// =============================================================================
// Actions
// =============================================================================

const copySource = async () => {
  const node = attrs.node as MermaidNode | undefined;
  const source = node?.content || node?.raw || '';
  if (source) {
    await navigator.clipboard.writeText(source);
    copied.value = true;
    setTimeout(() => (copied.value = false), COPY_FEEDBACK_DURATION_MS);
  }
};

/**
 * Reset the inline diagram zoom to default (100%, centered)
 */
const resetInlineZoom = () => {
  const wrapper = mermaidRef.value?.$el;
  if (!wrapper) {
    console.warn('[MermaidDiagram] Cannot reset zoom: component ref not available');
    return;
  }

  // Find the hidden zoom controls (we hide them via CSS but they're still functional)
  const zoomControls = wrapper.querySelector('.absolute.top-2.right-2');
  if (!zoomControls) {
    console.warn('[MermaidDiagram] Zoom controls not found in inline view');
    return;
  }

  const resetBtn = findResetButton(zoomControls);
  if (resetBtn) {
    resetBtn.click();
  } else {
    console.warn('[MermaidDiagram] Reset button not found in zoom controls');
  }
};

/**
 * Watch for modal removal from DOM to reset inline diagram zoom
 */
const watchForModalClose = (modal: Element) => {
  // Disconnect any existing observer before creating a new one
  modalObserver?.disconnect();

  modalObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const removed of mutation.removedNodes) {
        if (removed === modal || (removed as Element).contains?.(modal)) {
          resetInlineZoom();
          modalObserver?.disconnect();
          modalObserver = null;
          return;
        }
      }
    }
  });

  modalObserver.observe(document.body, { childList: true, subtree: true });
};

/**
 * Handle fullscreen modal open - scale diagram to fit and set up close watcher
 */
const onOpenModal = () => {
  nextTick(() => {
    setTimeout(() => {
      const modal = document.querySelector('.fixed.inset-0.z-50');
      if (!modal) {
        console.warn('[MermaidDiagram] Fullscreen modal element not found');
        return;
      }

      // Watch for modal close to reset inline zoom
      watchForModalClose(modal);

      // First, reset zoom to get clean baseline
      const resetBtn = findResetButton(modal);
      if (resetBtn) {
        resetBtn.click();
      }

      // Then scale SVG to fit the modal
      setTimeout(() => {
        const modalContent = modal.querySelector('.w-full.h-full.flex');
        const svg = modal.querySelector('svg');

        if (!modalContent) {
          console.warn('[MermaidDiagram] Modal content container not found');
          return;
        }
        if (!svg) {
          console.warn('[MermaidDiagram] SVG element not found in modal');
          return;
        }

        const modalRect = modalContent.getBoundingClientRect();
        const svgRect = svg.getBoundingClientRect();

        // Calculate scale to fit with padding for controls
        const availableWidth = modalRect.width - FULLSCREEN_PADDING;
        const availableHeight = modalRect.height - FULLSCREEN_PADDING;

        const scaleX = availableWidth / svgRect.width;
        const scaleY = availableHeight / svgRect.height;
        const scale = Math.min(scaleX, scaleY, MAX_AUTO_ZOOM);

        // Only zoom if diagram needs notable enlargement
        if (scale > MIN_ZOOM_THRESHOLD) {
          const buttons = modal.querySelectorAll('button');
          // Library renders zoom-in as first button in modal controls
          const zoomInBtn = buttons[0] as HTMLButtonElement | undefined;

          if (!zoomInBtn) {
            console.warn('[MermaidDiagram] Zoom-in button not found in modal');
            return;
          }

          // Clear any previous zoom animation
          clearZoomTimers();

          // Apply dampened zoom for comfortable fit
          const targetScale = 1 + (scale - 1) * ZOOM_DAMPENING_FACTOR;
          const clicks = Math.round((targetScale - 1) * ZOOM_STEP_INCREMENT);

          for (let i = 0; i < clicks; i++) {
            zoomTimers.push(setTimeout(() => zoomInBtn.click(), i * CLICK_INTERVAL_MS));
          }
        }
      }, SVG_RENDER_DELAY_MS);
    }, MODAL_READY_DELAY_MS);
  });
};

// =============================================================================
// Lifecycle
// =============================================================================

onUnmounted(() => {
  // Clean up observer to prevent memory leaks
  if (modalObserver) {
    modalObserver.disconnect();
    modalObserver = null;
  }
  // Clear any pending zoom animation timers
  clearZoomTimers();
});
</script>

<style scoped>
.mermaid-wrapper {
  position: relative;
}

/* Transform header into floating buttons on the right */
.mermaid-wrapper :deep(.mermaid-block-header) {
  position: absolute;
  top: 0;
  right: 0;
  left: auto;
  width: auto;
  background: transparent !important;
  border: none !important;
  padding: 8px;
  z-index: 10;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.mermaid-wrapper:hover :deep(.mermaid-block-header) {
  opacity: 1;
}

/* Style the native fullscreen button to match VSCode */
.mermaid-wrapper :deep(.mermaid-block-header button) {
  background: var(--vscode-editor-background) !important;
  border: 1px solid var(--vscode-panel-border) !important;
  border-radius: 4px !important;
  color: var(--vscode-foreground) !important;
  opacity: 0.8;
}

.mermaid-wrapper :deep(.mermaid-block-header button:hover) {
  opacity: 1;
  background: var(--vscode-toolbar-hoverBackground) !important;
}

/* Hide the in-diagram zoom controls - header has fullscreen */
.mermaid-wrapper :deep(.absolute.top-2.right-2) {
  display: none;
}

/* Custom copy button on right side, next to fullscreen */
.action-buttons {
  position: absolute;
  top: 8px;
  right: 40px; /* Position to the left of the fullscreen button */
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s ease;
  z-index: 10;
}

.action-buttons.visible {
  opacity: 1;
}

.action-buttons button {
  background: var(--vscode-editor-background);
  border: 1px solid var(--vscode-panel-border);
  border-radius: 4px;
  padding: 8px; /* Match library's p-2 */
  cursor: pointer;
  color: var(--vscode-foreground);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.8;
  transition: opacity 0.15s, background 0.15s;
}

.action-buttons button .codicon {
  font-size: 12px; /* Match library's w-3 h-3 */
  width: 12px;
  height: 12px;
}

.action-buttons button:hover {
  opacity: 1;
  background: var(--vscode-toolbar-hoverBackground);
}
</style>
