'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { getToken } from '@/lib/auth';
import api from '@/lib/api';
import {
  ChatMessage,
  ChatSource,
  ToolActivityItem,
  ToolExecutionStatus,
  MessageStatus,
  Conversation,
  BackendMessageRecord
} from '@/types';

export type { ChatMessage, ChatSource, ToolActivityItem, MessageStatus, ToolExecutionStatus };
export type StreamStatus = 'idle' | 'waiting' | 'streaming' | 'error' | 'stopped';

export interface SendChatOptions {
  spaceId?: number;
  documentIds?: string[];
  conversationId?: string;
  isRetry?: boolean;
}

interface ParsedSSEEvent {
  event: string;
  data: string;
}

// Strict SSE Event Payload Types (No 'any')
interface ToolStartPayload {
  id: string;
  name: string;
  argsSummary?: string;
}

interface ToolEndPayload {
  id: string;
  name: string;
  durationMs: number;
  resultCount: number;
  ok: boolean;
}

interface RawSourceItem {
  documentId?: string;
  title?: string;
  documentTitle?: string;
  originalName?: string;
  pageNumber?: number | null;
  score?: number;
  similarity?: number;
}

interface TokenPayload {
  text: string;
}

interface DonePayload {
  finishReason?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  sources?: RawSourceItem[];
}

interface ErrorPayload {
  code?: string;
  message?: string;
}

interface ConversationPayload {
  id: string;
  title: string;
}

/**
 * Parses a single raw SSE message block.
 * Handles multiline data: fields, trims event names, and ignores comments (: ping).
 */
function parseSSEBlock(rawBlock: string): ParsedSSEEvent | null {
  const lines = rawBlock.split(/\r?\n/);
  let eventName = 'message';
  const dataLines: string[] = [];

  for (const line of lines) {
    if (!line || line.startsWith(':')) {
      // Comment / heartbeat / empty line: ignore
      continue;
    }
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (dataLines.length === 0 && eventName === 'message') {
    return null;
  }

  return {
    event: eventName,
    data: dataLines.join('\n')
  };
}

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: 'welcome',
    sender: 'assistant',
    text: 'Hello! I am your Enterprise AI Assistant. Ask me anything about documents in your assigned spaces.',
    timestamp: new Date(),
    status: 'done'
  }
];

export interface UseChatStreamOptions {
  onConversationCreated?: (conv: { id: string; title: string }) => void;
  onStreamComplete?: () => void;
}

export function useChatStream(hookOptions: UseChatStreamOptions = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [status, setStatus] = useState<StreamStatus>('idle');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);

  // Internal refs for lifecycle management & avoiding re-render storms
  const statusRef = useRef<StreamStatus>('idle');
  const abortControllerRef = useRef<AbortController | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const tokenBufferRef = useRef<string>('');
  const rafIdRef = useRef<number | null>(null);
  const currentAssistantIdRef = useRef<string | null>(null);
  const currentConversationIdRef = useRef<string | null>(null);
  const lastPromptRef = useRef<{ message: string; spaceId?: number; documentIds?: string[] } | null>(null);
  const onConversationCreatedRef = useRef(hookOptions.onConversationCreated);
  const onStreamCompleteRef = useRef(hookOptions.onStreamComplete);

  useEffect(() => {
    onConversationCreatedRef.current = hookOptions.onConversationCreated;
    onStreamCompleteRef.current = hookOptions.onStreamComplete;
  }, [hookOptions.onConversationCreated, hookOptions.onStreamComplete]);

  // Sync state & ref
  const updateStatus = (newStatus: StreamStatus) => {
    statusRef.current = newStatus;
    setStatus(newStatus);
  };

  /**
   * Immediately flushes any queued tokens in tokenBufferRef into React state.
   */
  const flushTokenBuffer = useCallback(() => {
    const buffered = tokenBufferRef.current;
    const targetId = currentAssistantIdRef.current;
    if (!buffered || !targetId) return;

    tokenBufferRef.current = '';
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === targetId
          ? { ...msg, text: msg.text + buffered, status: 'streaming' }
          : msg
      )
    );
  }, []);

  /**
   * Batches token updates via requestAnimationFrame (~16-33ms) to avoid re-render storms.
   */
  const scheduleTokenFlush = useCallback(() => {
    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        flushTokenBuffer();
      });
    }
  }, [flushTokenBuffer]);

  /**
   * Stop generation mid-stream. Keeps the partial answer in the UI.
   */
  const stop = useCallback(() => {
    if (statusRef.current !== 'waiting' && statusRef.current !== 'streaming') {
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (readerRef.current) {
      readerRef.current.cancel().catch(() => {});
      readerRef.current = null;
    }

    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    flushTokenBuffer();

    const assistantId = currentAssistantIdRef.current;
    if (assistantId) {
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id !== assistantId) return msg;
          const updatedActivities = (msg.toolActivities || []).map((a) =>
            a.status === 'running' ? { ...a, status: 'failed' as const } : a
          );
          return {
            ...msg,
            status: 'stopped',
            toolActivities: updatedActivities
          };
        })
      );
    }

    updateStatus('stopped');
    onStreamCompleteRef.current?.();
  }, [flushTokenBuffer]);

  /**
   * Loads an existing conversation and its messages from the backend API.
   * Does NOT trigger any generation.
   */
  const loadConversation = useCallback(async (id: string) => {
    if (!id) return;

    // Abort active stream if any
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (readerRef.current) {
      readerRef.current.cancel().catch(() => {});
      readerRef.current = null;
    }
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    tokenBufferRef.current = '';

    currentConversationIdRef.current = id;
    setConversationId(id);
    setIsLoadingHistory(true);

    try {
      const res = await api.get<{
        success: boolean;
        message?: string | { conversation?: Conversation; messages?: BackendMessageRecord[] };
        data?: {
          conversation?: Conversation;
          messages?: BackendMessageRecord[];
        };
      }>(`/conversations/${id}/messages`);

      if (res.data?.success) {
        const payload = (typeof res.data.data === 'object' && res.data.data !== null && 'messages' in res.data.data)
          ? res.data.data
          : (typeof res.data.message === 'object' && res.data.message !== null && 'messages' in res.data.message)
          ? res.data.message
          : (res.data.data as any) || {};

        const rawList = Array.isArray(payload.messages) ? payload.messages : [];
        const loaded: ChatMessage[] = rawList.map((m: BackendMessageRecord) => {
          let sourcesList: ChatSource[] = [];
          if (Array.isArray(m.sources)) {
            sourcesList = m.sources;
          } else if (typeof m.sources === 'string') {
            try { sourcesList = JSON.parse(m.sources); } catch {}
          }

          let toolList: ToolActivityItem[] = [];
          if (Array.isArray(m.toolActivity)) {
            toolList = m.toolActivity;
          } else if (typeof m.toolActivity === 'string') {
            try { toolList = JSON.parse(m.toolActivity); } catch {}
          }

          let msgStatus: MessageStatus = 'done';
          if (m.status === 'stopped') msgStatus = 'stopped';
          else if (m.status === 'error') msgStatus = 'error';

          return {
            id: m.id,
            conversationId: m.conversationId,
            sender: m.role === 'user' ? 'user' : 'assistant',
            text: m.content || '',
            sources: sourcesList,
            toolActivities: toolList,
            status: msgStatus,
            error: m.errorMessage || undefined,
            timestamp: new Date(m.createdAt)
          };
        });

        setMessages(loaded.length > 0 ? loaded : INITIAL_MESSAGES);
        updateStatus('idle');
      }
    } catch (err: unknown) {
      console.error('Failed to load conversation history:', err);
      updateStatus('error');
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  /**
   * Resets active conversation to start a new chat session.
   */
  const clearConversation = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (readerRef.current) {
      readerRef.current.cancel().catch(() => {});
      readerRef.current = null;
    }
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    tokenBufferRef.current = '';
    currentConversationIdRef.current = null;
    setConversationId(null);
    setMessages(INITIAL_MESSAGES);
    updateStatus('idle');
  }, []);

  /**
   * Send a question to the SSE streaming endpoint.
   */
  const send = useCallback(
    async (questionText: string, options: SendChatOptions = {}) => {
      const cleanText = questionText.trim();
      if (!cleanText) return;

      // Abort any ongoing stream before starting a new one
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const activeConvId = options.conversationId || currentConversationIdRef.current || undefined;

      // Record last prompt for retry
      lastPromptRef.current = {
        message: cleanText,
        spaceId: options.spaceId,
        documentIds: options.documentIds
      };

      const now = new Date();
      const assistantMessageId = `asst-${Date.now()}`;
      currentAssistantIdRef.current = assistantMessageId;
      tokenBufferRef.current = '';

      if (options.isRetry) {
        // If retrying, replace the failed assistant message instead of adding a new user bubble
        setMessages((prev) => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg && lastMsg.sender === 'assistant' && lastMsg.status === 'error') {
            const filtered = prev.slice(0, -1);
            return [
              ...filtered,
              {
                id: assistantMessageId,
                conversationId: activeConvId,
                sender: 'assistant',
                text: '',
                timestamp: now,
                status: 'waiting'
              }
            ];
          }
          return [
            ...prev,
            {
              id: assistantMessageId,
              conversationId: activeConvId,
              sender: 'assistant',
              text: '',
              timestamp: now,
              status: 'waiting'
            }
          ];
        });
      } else {
        const userMsg: ChatMessage = {
          id: `user-${Date.now()}`,
          conversationId: activeConvId,
          sender: 'user',
          text: cleanText,
          timestamp: now
        };

        const asstMsg: ChatMessage = {
          id: assistantMessageId,
          conversationId: activeConvId,
          sender: 'assistant',
          text: '',
          timestamp: now,
          status: 'waiting'
        };

        // If the view only had the welcome placeholder, replace it with the new active messages
        setMessages((prev) => {
          if (prev.length === 1 && prev[0].id === 'welcome') {
            return [userMsg, asstMsg];
          }
          return [...prev, userMsg, asstMsg];
        });
      }

      updateStatus('waiting');

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
      const token = getToken();

      try {
        const response = await fetch(`${apiUrl}/chat/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            question: cleanText,
            spaceId: options.spaceId ? Number(options.spaceId) : undefined,
            documentIds: options.documentIds,
            conversationId: activeConvId
          }),
          signal: controller.signal
        });

        // 1. Non-200 HTTP response handler
        if (!response.ok) {
          // Special handling for HTTP 429 Rate Limiting
          if (response.status === 429) {
            let retryAfter = response.headers.get('Retry-After');
            let friendlyMsg = 'Rate limit reached. Please wait a moment before sending another message.';
            try {
              const errJson = await response.json();
              if (errJson.retryAfter) {
                retryAfter = String(errJson.retryAfter);
              }
              if (errJson.message) {
                friendlyMsg = errJson.message;
              }
            } catch {
              // Fallback
            }
            if (retryAfter) {
              friendlyMsg = `Rate limit reached. Please wait ${retryAfter}s before sending another message.`;
            }
            throw new Error(friendlyMsg);
          }

          let errorMessage = `Server error (${response.status})`;
          try {
            const errJson = await response.json();
            errorMessage = errJson.message || errorMessage;
          } catch {
            // response was not JSON
          }
          throw new Error(errorMessage);
        }

        if (!response.body) {
          throw new Error('ReadableStream not supported by browser body');
        }

        const reader = response.body.getReader();
        readerRef.current = reader;
        const decoder = new TextDecoder('utf-8');
        let streamBuffer = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          streamBuffer += decoder.decode(value, { stream: true });

          // Split by standard SSE blank line delimiters (\n\n or \r\n\r\n)
          const blocks = streamBuffer.split(/\r?\n\r?\n/);
          // Keep trailing partial block in the buffer
          streamBuffer = blocks.pop() ?? '';

          for (const block of blocks) {
            if (!block.trim()) continue;

            const parsed = parseSSEBlock(block);
            if (!parsed) continue;

            const { event, data } = parsed;

            if (event === 'conversation') {
              try {
                const convPayload = JSON.parse(data) as ConversationPayload;
                if (convPayload?.id) {
                  currentConversationIdRef.current = convPayload.id;
                  setConversationId(convPayload.id);
                  onConversationCreatedRef.current?.(convPayload);
                }
              } catch {
                // Ignore parse errors on conversation event
              }
            } else if (event === 'token') {
              try {
                const payload = JSON.parse(data) as TokenPayload;
                if (payload.text) {
                  // Transition from waiting -> streaming on arrival of the first token
                  if (statusRef.current === 'waiting') {
                    updateStatus('streaming');
                  }
                  tokenBufferRef.current += payload.text;
                  scheduleTokenFlush();
                }
              } catch (e) {
                console.error('Failed to parse token payload:', e);
              }
            } else if (event === 'tool_start') {
              try {
                const payload = JSON.parse(data) as ToolStartPayload;
                setMessages((prev) =>
                  prev.map((msg) => {
                    if (msg.id !== assistantMessageId) return msg;
                    const existing = msg.toolActivities || [];
                    const matchIdx = existing.findIndex((a) => a.id === payload.id);
                    let updated: ToolActivityItem[];
                    if (matchIdx >= 0) {
                      updated = existing.map((a, i) =>
                        i === matchIdx
                          ? { ...a, status: 'running' as const, argsSummary: payload.argsSummary }
                          : a
                      );
                    } else {
                      updated = [
                        ...existing,
                        {
                          id: payload.id,
                          name: payload.name,
                          argsSummary: payload.argsSummary,
                          status: 'running' as const
                        }
                      ];
                    }
                    return { ...msg, toolActivities: updated };
                  })
                );
              } catch {
                // Ignore parse errors on tool_start
              }
            } else if (event === 'tool_end') {
              try {
                const payload = JSON.parse(data) as ToolEndPayload;
                setMessages((prev) =>
                  prev.map((msg) => {
                    if (msg.id !== assistantMessageId) return msg;
                    const existing = msg.toolActivities || [];
                    const matchIdx = existing.findIndex((a) => a.id === payload.id);
                    let updated: ToolActivityItem[];
                    if (matchIdx >= 0) {
                      updated = existing.map((a, i) =>
                        i === matchIdx
                          ? {
                              ...a,
                              status: payload.ok ? ('done' as const) : ('failed' as const),
                              durationMs: payload.durationMs,
                              resultCount: payload.resultCount
                            }
                          : a
                      );
                    } else {
                      updated = [
                        ...existing,
                        {
                          id: payload.id,
                          name: payload.name,
                          status: payload.ok ? ('done' as const) : ('failed' as const),
                          durationMs: payload.durationMs,
                          resultCount: payload.resultCount
                        }
                      ];
                    }
                    return { ...msg, toolActivities: updated };
                  })
                );
              } catch {
                // Ignore parse errors on tool_end
              }
            } else if (event === 'sources') {
              try {
                const rawSources = JSON.parse(data) as RawSourceItem[];
                if (Array.isArray(rawSources)) {
                  const normalized: ChatSource[] = rawSources.map((s) => ({
                    documentId: s.documentId,
                    documentTitle: s.title || s.documentTitle || 'Document',
                    originalName: s.originalName,
                    pageNumber: s.pageNumber,
                    similarity: typeof s.score === 'number'
                      ? s.score
                      : (typeof s.similarity === 'number' ? s.similarity : 0)
                  }));
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === assistantMessageId
                        ? { ...msg, sources: normalized }
                        : msg
                    )
                  );
                }
              } catch {
                // Ignore parse errors on sources
              }
            } else if (event === 'done') {
              let sources: ChatSource[] | undefined;
              try {
                const donePayload = JSON.parse(data) as DonePayload;
                if (Array.isArray(donePayload.sources)) {
                  sources = donePayload.sources.map((s) => ({
                    documentId: s.documentId,
                    documentTitle: s.title || s.documentTitle || 'Document',
                    originalName: s.originalName,
                    pageNumber: s.pageNumber,
                    similarity: typeof s.score === 'number'
                      ? s.score
                      : (typeof s.similarity === 'number' ? s.similarity : 0)
                  }));
                }
              } catch {
                // Ignore parse errors on done payload
              }

              // Flush remaining tokens
              if (rafIdRef.current !== null) {
                cancelAnimationFrame(rafIdRef.current);
                rafIdRef.current = null;
              }
              flushTokenBuffer();

              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMessageId
                    ? {
                        ...msg,
                        status: 'done',
                        sources: sources ?? msg.sources
                      }
                    : msg
                )
              );
              updateStatus('idle');
            } else if (event === 'error') {
              let errorMsg = 'An error occurred during answer generation.';
              try {
                const errPayload = JSON.parse(data) as ErrorPayload;
                errorMsg = errPayload.message || errorMsg;
              } catch {
                // Fallback
              }
              throw new Error(errorMsg);
            }
          }
        }

        // Flush any trailing leftover buffer after reader finishes
        if (streamBuffer.trim()) {
          const trailingParsed = parseSSEBlock(streamBuffer);
          if (trailingParsed?.event === 'token') {
            try {
              const p = JSON.parse(trailingParsed.data);
              if (p.text) tokenBufferRef.current += p.text;
            } catch {
              // ignore
            }
          }
        }

        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
        flushTokenBuffer();

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId && msg.status !== 'error' && msg.status !== 'stopped'
              ? { ...msg, status: 'done' }
              : msg
          )
        );
        updateStatus('idle');

      } catch (err: unknown) {
        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
        flushTokenBuffer();

        // If cancelled by the user via stop(), do NOT set error state
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }

        const message = err instanceof Error ? err.message : 'Failed to connect to assistant';

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? {
                  ...msg,
                  status: 'error',
                  error: message
                }
              : msg
          )
        );
        updateStatus('error');
      } finally {
        if (readerRef.current) {
          readerRef.current.releaseLock();
          readerRef.current = null;
        }
        abortControllerRef.current = null;
        onStreamCompleteRef.current?.();
      }
    },
    [flushTokenBuffer, scheduleTokenFlush]
  );

  /**
   * Re-send the last user question that produced an error.
   */
  const retry = useCallback(() => {
    if (!lastPromptRef.current || statusRef.current === 'waiting' || statusRef.current === 'streaming') {
      return;
    }
    const { message, spaceId, documentIds } = lastPromptRef.current;
    send(message, { spaceId, documentIds, isRetry: true });
  }, [send]);

  // Clean up any pending reader, controller, and RAF on component unmount or auth logout
  useEffect(() => {
    const handleAbort = () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (readerRef.current) {
        readerRef.current.cancel().catch(() => {});
      }
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('auth:logout', handleAbort);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('auth:logout', handleAbort);
      }
      handleAbort();
    };
  }, []);

  return {
    messages,
    status,
    conversationId,
    isLoadingHistory,
    send,
    stop,
    retry,
    loadConversation,
    clearConversation,
    setConversationId,
    setMessages
  };
}
