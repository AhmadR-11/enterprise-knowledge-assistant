'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { getToken } from '@/lib/auth';

export interface ChatSource {
  documentTitle: string;
  pageNumber: number;
  similarity: number;
}

export type MessageStatus = 'waiting' | 'streaming' | 'done' | 'error' | 'stopped';

export interface ActiveToolInfo {
  name: string;
  argsSummary?: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  sources?: ChatSource[];
  timestamp: Date;
  status?: MessageStatus;
  error?: string;
  activeTool?: ActiveToolInfo | null;
}

export type StreamStatus = 'idle' | 'waiting' | 'streaming' | 'error' | 'stopped';

export interface SendChatOptions {
  spaceId?: number;
  documentIds?: string[];
  isRetry?: boolean;
}

interface ParsedSSEEvent {
  event: string;
  data: string;
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

export function useChatStream() {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [status, setStatus] = useState<StreamStatus>('idle');

  // Internal refs for lifecycle management & avoiding re-render storms
  const statusRef = useRef<StreamStatus>('idle');
  const abortControllerRef = useRef<AbortController | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const tokenBufferRef = useRef<string>('');
  const rafIdRef = useRef<number | null>(null);
  const currentAssistantIdRef = useRef<string | null>(null);
  const lastPromptRef = useRef<{ message: string; spaceId?: number; documentIds?: string[] } | null>(null);

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
        prev.map((msg) =>
          msg.id === assistantId ? { ...msg, status: 'stopped' } : msg
        )
      );
    }

    updateStatus('stopped');
  }, [flushTokenBuffer]);

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
          sender: 'user',
          text: cleanText,
          timestamp: now
        };

        const asstMsg: ChatMessage = {
          id: assistantMessageId,
          sender: 'assistant',
          text: '',
          timestamp: now,
          status: 'waiting'
        };

        setMessages((prev) => [...prev, userMsg, asstMsg]);
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
            documentIds: options.documentIds
          }),
          signal: controller.signal
        });

        // 1. Non-200 HTTP response handler
        if (!response.ok) {
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

            if (event === 'token') {
              try {
                const payload = JSON.parse(data);
                if (payload.text) {
                  // Transition from waiting -> streaming on arrival of the first token
                  if (statusRef.current === 'waiting') {
                    updateStatus('streaming');
                  }
                  tokenBufferRef.current += payload.text;
                  scheduleTokenFlush();

                  // Clear active tool indicator once tokens begin streaming
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === assistantMessageId && msg.activeTool
                        ? { ...msg, activeTool: null }
                        : msg
                    )
                  );
                }
              } catch (e) {
                console.error('Failed to parse token payload:', e);
              }
            } else if (event === 'tool_start') {
              try {
                const payload = JSON.parse(data);
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? {
                          ...msg,
                          activeTool: {
                            name: payload.name,
                            argsSummary: payload.argsSummary
                          }
                        }
                      : msg
                  )
                );
              } catch {
                // Ignore parse errors on tool_start
              }
            } else if (event === 'sources') {
              try {
                const payload = JSON.parse(data);
                if (Array.isArray(payload)) {
                  const normalized: ChatSource[] = payload.map((s: any) => ({
                    documentTitle: s.title || s.documentTitle || 'Document',
                    pageNumber: s.pageNumber ?? 1,
                    similarity: s.score ?? s.similarity ?? 0
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
                const donePayload = JSON.parse(data);
                if (Array.isArray(donePayload.sources)) {
                  sources = donePayload.sources.map((s: any) => ({
                    documentTitle: s.title || s.documentTitle || 'Document',
                    pageNumber: s.pageNumber ?? 1,
                    similarity: s.score ?? s.similarity ?? 0
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
                        activeTool: null,
                        sources: sources ?? msg.sources
                      }
                    : msg
                )
              );
              updateStatus('idle');
            } else if (event === 'error') {
              let errorMsg = 'An error occurred during answer generation.';
              try {
                const errPayload = JSON.parse(data);
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

  // Clean up any pending reader, controller, and RAF on component unmount
  useEffect(() => {
    return () => {
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
  }, []);

  return {
    messages,
    status,
    send,
    stop,
    retry,
    setMessages
  };
}
