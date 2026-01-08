/**
 * StreamingController - Event router for streaming message lifecycle
 *
 * Manages the complete lifecycle of Claude SDK streaming events with:
 * - Concurrent subagent stream support via parent_tool_use_id
 * - Adaptive timeouts based on content block type
 * - Cleanup on stream completion
 *
 * Simplified from state machine approach - SDK guarantees event ordering:
 * - message_start always first
 * - content_block_start -> content_block_delta* -> content_block_stop
 * - message_stop always last
 *
 * CLEANUP CONTRACT:
 * - dispose() MUST be called when controller is no longer needed
 * - All timers are cleared on stream completion
 */

import { ContentBlockWrapper } from '../models/ContentBlockWrapper';
import { Message } from '../models/Message';

// ============================================================================
// Types
// ============================================================================

/**
 * SDK stream event types
 */
export type StreamEventType =
  | 'message_start'
  | 'message_delta'
  | 'message_stop'
  | 'content_block_start'
  | 'content_block_delta'
  | 'content_block_stop'
  | 'ping'
  | 'error';

/**
 * Content block types for timeout calculation
 */
export type ContentBlockType = 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'image';

/**
 * Delta types within content_block_delta
 */
export type DeltaType = 'text_delta' | 'input_json_delta' | 'thinking_delta' | 'signature_delta';

/**
 * Stream context for a single agent (main or subagent)
 */
export interface StreamContext {
  parentToolUseId: string | null;
  message: Message;
  wrappers: Map<number, ContentBlockWrapper>;
  currentBlockIndex: number;
  currentBlockType: ContentBlockType | null;
  timeoutId: ReturnType<typeof setTimeout> | null;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Adaptive timeouts based on content block type
 */
const TIMEOUTS = {
  TEXT_BLOCK: 30_000,       // 30 seconds
  THINKING_BLOCK: 120_000,  // 2 minutes (extended thinking takes longer)
  TOOL_USE_BLOCK: 60_000,   // 1 minute (tool execution)
  DEFAULT: 30_000           // Default timeout
} as const;

// ============================================================================
// StreamingController
// ============================================================================

export class StreamingController {
  /**
   * Active streams keyed by parent_tool_use_id (null = main agent)
   */
  private readonly activeStreams = new Map<string | null, StreamContext>();

  /**
   * Disposed flag
   */
  private disposed = false;

  /**
   * Callback for when a new streaming message is created
   */
  private onMessageCreated?: (message: Message, parentToolUseId: string | null) => void;

  /**
   * Callback for when a message is finalized
   */
  private onMessageFinalized?: (message: Message, parentToolUseId: string | null) => void;

  /**
   * Callback for usage updates
   */
  private onUsageUpdate?: (usage: any) => void;

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Set callback for message creation
   */
  setOnMessageCreated(callback: (message: Message, parentToolUseId: string | null) => void): void {
    this.onMessageCreated = callback;
  }

  /**
   * Set callback for message finalization
   */
  setOnMessageFinalized(callback: (message: Message, parentToolUseId: string | null) => void): void {
    this.onMessageFinalized = callback;
  }

  /**
   * Set callback for usage updates
   */
  setOnUsageUpdate(callback: (usage: any) => void): void {
    this.onUsageUpdate = callback;
  }

  /**
   * Check if any stream is active
   */
  hasActiveStreams(): boolean {
    return this.activeStreams.size > 0;
  }

  /**
   * Handle an incoming stream event
   *
   * Routes events to the correct stream context based on parentToolUseId.
   *
   * @param event Raw SDK stream event
   * @param parentToolUseId Parent tool_use ID (null for main agent)
   */
  handleStreamEvent(event: any, parentToolUseId: string | null = null): void {
    if (this.disposed) {
      return;
    }

    const eventType = event.type as StreamEventType;

    switch (eventType) {
      case 'message_start':
        this.handleMessageStart(event, parentToolUseId);
        break;

      case 'content_block_start':
        this.handleContentBlockStart(event, parentToolUseId);
        break;

      case 'content_block_delta':
        this.handleContentBlockDelta(event, parentToolUseId);
        break;

      case 'content_block_stop':
        this.handleContentBlockStop(event, parentToolUseId);
        break;

      case 'message_delta':
        this.handleMessageDelta(event, parentToolUseId);
        break;

      case 'message_stop':
        this.handleMessageStop(event, parentToolUseId);
        break;

      case 'ping':
        this.handlePing(parentToolUseId);
        break;

      case 'error':
        this.handleError(event, parentToolUseId);
        break;
    }
  }

  /**
   * Cancel an active stream
   *
   * Updates message state to match handleTimeout/handleError behavior
   * so the UI correctly reflects the cancelled state.
   */
  cancel(parentToolUseId: string | null = null): void {
    const context = this.activeStreams.get(parentToolUseId);
    if (!context) {
      return;
    }

    // Finalize any active wrappers
    for (const wrapper of context.wrappers.values()) {
      if (wrapper.getIsStreaming()) {
        wrapper.finalizeStreaming();
      }
    }

    // Update message state (mirror handleTimeout/handleError)
    if (context.message) {
      context.message.markInterrupted();
      context.message.setStreaming(false);
    }

    this.disposeStreamContext(context);
    this.activeStreams.delete(parentToolUseId);
  }

  /**
   * CLEANUP: Dispose all resources
   *
   * MUST be called when the controller is no longer needed.
   */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;

    // Dispose all stream contexts
    for (const context of this.activeStreams.values()) {
      this.disposeStreamContext(context);
    }
    this.activeStreams.clear();

    // Clear callbacks
    this.onMessageCreated = undefined;
    this.onMessageFinalized = undefined;
    this.onUsageUpdate = undefined;
  }

  // ==========================================================================
  // Event Handlers
  // ==========================================================================

  private handleMessageStart(_event: any, parentToolUseId: string | null): void {
    // Create new stream context
    const context = this.createStreamContext(parentToolUseId);

    // Create streaming message
    const message = Message.createStreaming(parentToolUseId);
    context.message = message;

    // Start timeout
    this.setTimeoutForContext(context);

    // Notify callback
    this.onMessageCreated?.(message, parentToolUseId);
  }

  private handleContentBlockStart(event: any, parentToolUseId: string | null): void {
    const context = this.activeStreams.get(parentToolUseId);
    if (!context) {
      return;
    }

    const index = event.index ?? context.wrappers.size;
    const contentBlock = event.content_block;

    // Create wrapper (owns text signal directly)
    const wrapper = new ContentBlockWrapper(contentBlock);
    wrapper.startStreaming();

    context.wrappers.set(index, wrapper);
    context.currentBlockIndex = index;
    context.currentBlockType = this.getBlockType(contentBlock);

    // Add wrapper to message content
    this.addBlockToMessage(context.message, wrapper);

    // Reset timeout with block-type-appropriate duration
    this.setTimeoutForContext(context);
  }

  private handleContentBlockDelta(event: any, parentToolUseId: string | null): void {
    const context = this.activeStreams.get(parentToolUseId);
    if (!context) {
      return;
    }

    const index = event.index ?? context.currentBlockIndex;
    const wrapper = context.wrappers.get(index);
    if (!wrapper) {
      return;
    }

    const delta = event.delta;
    if (!delta) {
      return;
    }

    // Extract text from delta based on delta type
    // SDK delta types: text_delta, thinking_delta, input_json_delta
    let text = '';
    if (delta.type === 'text_delta' && delta.text) {
      text = delta.text;
    } else if (delta.type === 'thinking_delta' && delta.thinking) {
      text = delta.thinking;
    } else if (delta.type === 'input_json_delta' && delta.partial_json !== undefined) {
      // partial_json may be string or object - serialize if needed
      text = typeof delta.partial_json === 'string'
        ? delta.partial_json
        : JSON.stringify(delta.partial_json);
    }

    if (text) {
      wrapper.appendDelta(text);
    }

    // Reset timeout
    this.setTimeoutForContext(context);
  }

  private handleContentBlockStop(event: any, parentToolUseId: string | null): void {
    const context = this.activeStreams.get(parentToolUseId);
    if (!context) {
      return;
    }

    const index = event.index ?? context.currentBlockIndex;
    const wrapper = context.wrappers.get(index);

    if (wrapper) {
      wrapper.finalizeStreaming();
    }

    // Reset timeout
    this.setTimeoutForContext(context);
  }

  private handleMessageDelta(event: any, parentToolUseId: string | null): void {
    const context = this.activeStreams.get(parentToolUseId);
    if (!context) {
      return;
    }

    // Update usage if present
    if (event.usage && this.onUsageUpdate) {
      this.onUsageUpdate(event.usage);
    }

    // Reset timeout
    this.setTimeoutForContext(context);
  }

  private handleMessageStop(_event: any, parentToolUseId: string | null): void {
    const context = this.activeStreams.get(parentToolUseId);
    if (!context) {
      return;
    }

    // Finalize all remaining blocks
    for (const wrapper of context.wrappers.values()) {
      if (wrapper.getIsStreaming()) {
        wrapper.finalizeStreaming();
      }
    }

    // Mark message as no longer streaming
    context.message.setStreaming(false);

    // CLEANUP: Clear timeout
    this.clearTimeout(context);

    // Notify callback
    this.onMessageFinalized?.(context.message, parentToolUseId);

    // CLEANUP: Remove from active streams
    this.activeStreams.delete(parentToolUseId);
  }

  private handlePing(parentToolUseId: string | null): void {
    const context = this.activeStreams.get(parentToolUseId);
    if (!context) {
      return;
    }

    // Reset timeout
    this.setTimeoutForContext(context);
  }

  private handleError(event: any, parentToolUseId: string | null): void {
    const context = this.activeStreams.get(parentToolUseId);
    if (!context) {
      return;
    }

    // CLEANUP: Clear timeout
    this.clearTimeout(context);

    // Mark message as interrupted but preserve content
    const errorMessage = event.error?.message ?? 'Stream error';
    context.message.setError(errorMessage);

    // Finalize remaining wrappers
    for (const wrapper of context.wrappers.values()) {
      if (wrapper.getIsStreaming()) {
        wrapper.finalizeStreaming();
      }
    }

    // CLEANUP: Remove from active streams
    this.activeStreams.delete(parentToolUseId);
  }

  // ==========================================================================
  // Context Management
  // ==========================================================================

  private createStreamContext(parentToolUseId: string | null): StreamContext {
    const context: StreamContext = {
      parentToolUseId,
      message: null as any, // Will be set in handleMessageStart
      wrappers: new Map(),
      currentBlockIndex: -1,
      currentBlockType: null,
      timeoutId: null
    };

    this.activeStreams.set(parentToolUseId, context);
    return context;
  }

  /**
   * CLEANUP: Dispose a single stream context
   */
  private disposeStreamContext(context: StreamContext): void {
    this.clearTimeout(context);
    context.wrappers.clear();
  }

  // ==========================================================================
  // Timeout Management
  // ==========================================================================

  private setTimeoutForContext(context: StreamContext): void {
    // Always clear existing timeout first
    this.clearTimeout(context);

    const timeout = this.getCurrentTimeout(context);
    context.timeoutId = setTimeout(() => {
      context.timeoutId = null;
      this.handleTimeout(context);
    }, timeout);
  }

  private clearTimeout(context: StreamContext): void {
    if (context.timeoutId !== null) {
      clearTimeout(context.timeoutId);
      context.timeoutId = null;
    }
  }

  private handleTimeout(context: StreamContext): void {
    // Mark message as interrupted due to timeout
    context.message.markInterrupted();

    // Finalize all wrappers
    for (const wrapper of context.wrappers.values()) {
      if (wrapper.getIsStreaming()) {
        wrapper.finalizeStreaming();
      }
    }

    // Mark message as no longer streaming
    context.message.setStreaming(false);

    // Remove from active streams
    this.activeStreams.delete(context.parentToolUseId);
  }

  private getCurrentTimeout(context: StreamContext): number {
    switch (context.currentBlockType) {
      case 'thinking':
        return TIMEOUTS.THINKING_BLOCK;
      case 'tool_use':
        return TIMEOUTS.TOOL_USE_BLOCK;
      default:
        return TIMEOUTS.TEXT_BLOCK;
    }
  }

  // ==========================================================================
  // Message/Block Helpers
  // ==========================================================================

  private addBlockToMessage(message: Message, wrapper: ContentBlockWrapper): void {
    const content = message.message.content;
    if (Array.isArray(content)) {
      (content as ContentBlockWrapper[]).push(wrapper);
    }
  }

  private getBlockType(contentBlock: any): ContentBlockType {
    return contentBlock?.type ?? 'text';
  }
}
