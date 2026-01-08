/**
 * Message - Message class
 *
 * Core features:
 * 1. Wraps message data
 * 2. Provides isEmpty getter (dynamically computed)
 * 3. Supports ContentBlockWrapper reactive tool_result binding
 * 4. Supports streaming mode with isStreaming signal
 *
 * CLEANUP CONTRACT:
 * - disposeStreaming() MUST be called when streaming completes
 */

import { signal } from 'alien-signals';
import type { ContentBlockType } from '../models/ContentBlock';
import { parseMessageContent } from '../models/contentParsers';
import { ContentBlockWrapper } from '../models/ContentBlockWrapper';

/**
 * Message role types
 */
export type MessageRole = 'user' | 'assistant' | 'system' | 'result' | 'tip' | 'slash_command_result';

/**
 * Message content data
 */
export interface MessageData {
  role: MessageRole;
  content: string | ContentBlockWrapper[];
}

/**
 * Message class
 *
 * Corresponding logic:
 * - user/assistant messages: content is ContentBlockWrapper[]
 * - system/result messages: content is string
 */
export class Message {
  type: MessageRole;
  message: MessageData;
  timestamp: number;

  // Extra fields (for system and result messages)
  subtype?: string;
  session_id?: string;
  is_error?: boolean;

  // Streaming support
  parentToolUseId?: string | null;

  /**
   * Streaming state signal (reactive)
   * True when message is actively streaming
   */
  private readonly streamingSignal = signal<boolean>(false);

  /**
   * Interrupted state signal (reactive)
   * True when stream was interrupted
   */
  private readonly interruptedSignal = signal<boolean>(false);

  /**
   * Error message (if stream errored)
   */
  private errorMessage?: string;

  constructor(
    type: MessageRole,
    message: MessageData,
    timestamp: number = Date.now(),
    extra?: {
      subtype?: string;
      session_id?: string;
      is_error?: boolean;
      parentToolUseId?: string | null;
    }
  ) {
    this.type = type;
    this.message = message;
    this.timestamp = timestamp;

    if (extra) {
      this.subtype = extra.subtype;
      this.session_id = extra.session_id;
      this.is_error = extra.is_error;
      this.parentToolUseId = extra.parentToolUseId;
    }
  }

  // ==========================================================================
  // Streaming Support
  // ==========================================================================

  /**
   * Get streaming state signal for reactive consumption
   *
   * Usage with Vue:
   * ```typescript
   * const isStreaming = useSignal(message.isStreaming);
   * ```
   */
  get isStreaming() {
    return this.streamingSignal;
  }

  /**
   * Get interrupted state signal for reactive consumption
   */
  get isInterrupted() {
    return this.interruptedSignal;
  }

  /**
   * Get error message if stream errored
   */
  getError(): string | undefined {
    return this.errorMessage;
  }

  /**
   * Set streaming state
   */
  setStreaming(streaming: boolean): void {
    this.streamingSignal(streaming);
  }

  /**
   * Mark message as interrupted
   */
  markInterrupted(): void {
    this.interruptedSignal(true);
    this.streamingSignal(false);
  }

  /**
   * Set error message
   */
  setError(error: string): void {
    this.errorMessage = error;
    this.markInterrupted();
  }

  /**
   * Check if streaming (non-reactive)
   */
  getIsStreaming(): boolean {
    return this.streamingSignal();
  }

  /**
   * Check if interrupted (non-reactive)
   */
  getIsInterrupted(): boolean {
    return this.interruptedSignal();
  }

  /**
   * CLEANUP: Finalize streaming
   *
   * Finalizes all streaming content blocks and sets isStreaming to false.
   */
  disposeStreaming(): void {
    const content = this.message.content;

    if (Array.isArray(content)) {
      for (const wrapper of content) {
        if (wrapper.getIsStreaming()) {
          wrapper.finalizeStreaming();
        }
      }
    }

    this.streamingSignal(false);
  }

  /**
   * Static factory - Create a streaming message shell
   *
   * Used by StreamingController when message_start event arrives.
   *
   * @param parentToolUseId Parent tool_use ID (null for main agent)
   * @returns Streaming Message instance
   */
  static createStreaming(parentToolUseId: string | null = null): Message {
    const message = new Message(
      'assistant',
      {
        role: 'assistant',
        content: []
      },
      Date.now(),
      { parentToolUseId }
    );

    message.setStreaming(true);
    return message;
  }

  // ==========================================================================
  // Core Functionality
  // ==========================================================================

  /**
   * isEmpty getter - Check if message is "empty"
   *
   * Logic:
   * 1. system messages are never empty
   * 2. user/assistant messages:
   *    - empty array → empty
   *    - all content blocks are tool_result → empty
   */
  get isEmpty(): boolean {
    // system messages are never empty
    if (this.type === 'system') {
      return false;
    }

    const content = this.message.content;

    // String content is empty if zero length
    if (typeof content === 'string') {
      return content.length === 0;
    }

    // ContentBlockWrapper array
    if (Array.isArray(content)) {
      // Empty array → empty
      if (content.length === 0) {
        return true;
      }

      // All content blocks are tool_result → empty
      return content.every((wrapper) => wrapper.content.type === 'tool_result');
    }

    return false;
  }

  /**
   * Static factory - Create Message from raw SDK message
   *
   * @param raw Raw message object
   * @returns Message instance or null
   */
  static fromRaw(raw: any): Message | null {
    if (raw.type === 'user' || raw.type === 'assistant') {
      const rawContent = Array.isArray(raw.message?.content)
        ? raw.message.content
        : raw.message?.content !== undefined
          ? [{ type: 'text', text: String(raw.message.content) }]
          : [];

      // Parse raw content
      const contentBlocks = parseMessageContent(rawContent);

      // Wrap as ContentBlockWrapper
      const wrappedContent = contentBlocks.map((block) => new ContentBlockWrapper(block));

      // Determine message type based on contentParsers result
      let messageType: MessageRole = raw.type;

      // Check for special message types
      if (raw.type === 'user') {
        const specialType = getSpecialMessageType(contentBlocks);
        if (specialType) {
          messageType = specialType;
        }
      }

      return new Message(
        messageType,
        {
          role: raw.message?.role ?? raw.type,
          content: wrappedContent,
        },
        raw.timestamp || Date.now()
      );
    }

    // Don't render system messages (used for state updates only)
    if (raw.type === 'system') {
      return null;
    }

    // Don't render result messages (used for end flag/usage stats)
    if (raw.type === 'result') {
      return null;
    }

    // stream_event etc don't create messages
    return null;
  }
}

/**
 * Type guards
 */
export function isUserMessage(msg: Message): boolean {
  return msg.type === 'user';
}

export function isAssistantMessage(msg: Message): boolean {
  return msg.type === 'assistant';
}

export function isSystemMessage(msg: Message): boolean {
  return msg.type === 'system';
}

export function isResultMessage(msg: Message): boolean {
  return msg.type === 'result';
}

/**
 * Get special message type
 *
 * Based on contentParsers.ts parsing result
 * Returns specific message type for differentiated rendering
 */
function getSpecialMessageType(contentBlocks: ContentBlockType[]): MessageRole | null {
  if (contentBlocks.length === 1) {
    const blockType = contentBlocks[0].type;

    if (blockType === 'interrupt') {
      return 'tip';
    }

    if (blockType === 'slash_command_result') {
      return 'slash_command_result';
    }
  }

  return null;
}
