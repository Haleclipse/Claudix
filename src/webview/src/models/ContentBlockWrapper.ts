/**
 * ContentBlockWrapper - Content Block Wrapper
 *
 * Uses alien-signals for reactive tool_result binding and streaming text.
 *
 * Core features:
 * 1. Wraps each content block
 * 2. Uses Signal for toolResult (reactive)
 * 3. Uses Signal for text content (reactive) - enables useSignal() in components
 * 4. Provides setToolResult method for async binding
 *
 * Pattern consistency:
 * - text signal follows same pattern as toolResult signal
 * - Components consume via useSignal(wrapper.text) like useSignal(wrapper.toolResult)
 *
 * Why this wrapper?
 * - tool_use and tool_result are in different messages
 * - Need async binding (when tool_result arrives, find tool_use backwards)
 * - Signals enable reactive UI updates
 * - Streaming text needs reactive accumulation
 */

import { signal } from 'alien-signals';
import type { ContentBlockType, ToolResultBlock } from './ContentBlock';

export class ContentBlockWrapper {
  /**
   * Original content block
   */
  public readonly content: ContentBlockType;

  /**
   * Tool Result Signal (reactive)
   * Used for real-time tool_result binding
   */
  private readonly toolResultSignal = signal<ToolResultBlock | undefined>(undefined);

  /**
   * Text content Signal (reactive)
   * Used for real-time streaming text - follows same pattern as toolResultSignal
   *
   * Usage with Vue:
   * ```typescript
   * const text = useSignal(wrapper.text);
   * ```
   */
  private readonly textSignal = signal<string>('');

  /**
   * Streaming state signal (reactive)
   * True when block is actively streaming
   *
   * Usage with Vue:
   * ```typescript
   * const isStreaming = useSignal(wrapper.isStreaming);
   * ```
   */
  private readonly streamingSignal = signal<boolean>(false);

  /**
   * Tool Use Result (plain property)
   * Used for session-loaded toolUseResult (non-reactive)
   */
  public toolUseResult?: any;

  constructor(content: ContentBlockType) {
    this.content = content;
    // Initialize text signal from static content
    this.textSignal(this.getInitialText());
  }

  // ==========================================================================
  // Text Signal (follows toolResult pattern)
  // ==========================================================================

  /**
   * Get text signal for reactive consumption
   *
   * Usage with Vue:
   * ```typescript
   * const text = useSignal(wrapper.text);
   * ```
   *
   * This follows the same pattern as toolResult for consistency.
   */
  get text() {
    return this.textSignal;
  }

  /**
   * Get streaming state signal for reactive consumption
   *
   * Usage with Vue:
   * ```typescript
   * const isStreaming = useSignal(wrapper.isStreaming);
   * ```
   */
  get isStreaming() {
    return this.streamingSignal;
  }

  /**
   * Append streaming delta to text
   *
   * Called by StreamingController on content_block_delta events.
   *
   * @param delta Text delta to append
   */
  appendDelta(delta: string): void {
    this.textSignal(this.textSignal() + delta);
  }

  /**
   * Start streaming mode
   *
   * Called by StreamingController on content_block_start events.
   * Clears text signal for fresh accumulation.
   */
  startStreaming(): void {
    this.textSignal('');
    this.streamingSignal(true);
  }

  /**
   * Finalize streaming
   *
   * Called by StreamingController on content_block_stop events.
   * Updates static content and clears streaming state.
   *
   * @param finalContent Optional final text (uses current signal value if not provided)
   */
  finalizeStreaming(finalContent?: string): void {
    const text = finalContent ?? this.textSignal();

    // Update static content block with final text
    const content = this.content as any;
    if (content.type === 'text') {
      content.text = text;
    } else if (content.type === 'thinking') {
      content.thinking = text;
    }

    // Update signal with final content (in case finalContent was provided)
    if (finalContent !== undefined) {
      this.textSignal(finalContent);
    }

    this.streamingSignal(false);
  }

  /**
   * Check if currently streaming (non-reactive)
   */
  getIsStreaming(): boolean {
    return this.streamingSignal();
  }

  /**
   * Get current text value (non-reactive)
   */
  getTextValue(): string {
    return this.textSignal();
  }

  // ==========================================================================
  // Tool Result Support
  // ==========================================================================

  /**
   * Get toolResult signal for reactive consumption
   *
   * Usage with Vue:
   * ```typescript
   * const toolResult = useSignal(wrapper.toolResult);
   * ```
   *
   * @returns Alien signal function
   */
  get toolResult() {
    return this.toolResultSignal;
  }

  /**
   * Set tool result
   *
   * Uses alien-signals function call API
   *
   * @param result Tool execution result
   */
  setToolResult(result: ToolResultBlock): void {
    this.toolResultSignal(result);
  }

  /**
   * Check if has tool_result
   */
  hasToolResult(): boolean {
    return this.toolResultSignal() !== undefined;
  }

  /**
   * Get tool_result value (non-reactive)
   */
  getToolResultValue(): ToolResultBlock | undefined {
    return this.toolResultSignal();
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /**
   * Get initial text from static content
   */
  private getInitialText(): string {
    const c = this.content as any;
    return c.text ?? c.thinking ?? '';
  }
}
