'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Building2, Zap, Layers } from 'lucide-react';
import api from '@/lib/api';
import { Space } from '@/types';
import { toast } from 'sonner';
import { useChatStream, ChatMessage } from '@/hooks/useChatStream';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { ChatInput } from '@/components/chat/ChatInput';
import { JumpToLatestButton } from '@/components/chat/JumpToLatestButton';
import { EmptyChatState } from '@/components/chat/EmptyChatState';

export default function ChatPage() {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [spaceId, setSpaceId] = useState<string>('');
  const [input, setInput] = useState<string>('');
  const [mode, setMode] = useState<'streaming' | 'non-streaming'>('streaming');

  // Streaming Hook
  const {
    messages: streamMessages,
    status: streamStatus,
    send: sendStream,
    stop: stopStream,
    retry: retryStream
  } = useChatStream();

  // Legacy Non-Streaming State (preserved for verification)
  const [nonStreamMessages, setNonStreamMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: 'Hello! I am your Enterprise AI Assistant (Non-Streaming mode). Ask me anything about documents in your assigned spaces.',
      timestamp: new Date(),
      status: 'done'
    }
  ]);
  const [nonStreamSending, setNonStreamSending] = useState(false);

  // Active messages depending on mode
  const activeMessages = mode === 'streaming' ? streamMessages : nonStreamMessages;
  const isBusy = mode === 'streaming'
    ? (streamStatus === 'waiting' || streamStatus === 'streaming')
    : nonStreamSending;

  // Auto-scroll & scroll detection
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  // Fetch accessible spaces on mount
  useEffect(() => {
    api.get('/spaces/my')
      .then((r) => {
        const fetched = r.data.data.spaces;
        setSpaces(fetched);
        if (fetched.length === 1) {
          setSpaceId(String(fetched[0].id));
        }
      })
      .catch(() => {});
  }, []);

  // Track if user manually scrolled away from the bottom
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setIsAtBottom(distanceToBottom < 60);
  }, []);

  // Auto-scroll to bottom only when user hasn't scrolled up
  useEffect(() => {
    if (isAtBottom && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeMessages, streamStatus, isAtBottom]);

  const jumpToBottom = () => {
    setIsAtBottom(true);
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Legacy non-streaming request handler
  const handleSendNonStreaming = async (textToSend?: string) => {
    const userQ = (textToSend ?? input).trim();
    if (!userQ || nonStreamSending) return;
    setInput('');

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: userQ,
      timestamp: new Date()
    };
    const waitingMsg: ChatMessage = {
      id: `asst-${Date.now()}`,
      sender: 'assistant',
      text: '',
      timestamp: new Date(),
      status: 'waiting'
    };

    setNonStreamMessages((prev) => [...prev, userMsg, waitingMsg]);
    setNonStreamSending(true);

    try {
      const { data } = await api.post('/chat', {
        question: userQ,
        spaceId: spaceId ? parseInt(spaceId, 10) : undefined
      });

      setNonStreamMessages((prev) =>
        prev.map((m) =>
          m.id === waitingMsg.id
            ? {
                ...m,
                text: data.data.answer,
                sources: data.data.sources,
                status: 'done'
              }
            : m
        )
      );
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      const msg = err.response?.data?.message || 'Failed to get answer from AI';
      toast.error(msg);
      setNonStreamMessages((prev) =>
        prev.map((m) =>
          m.id === waitingMsg.id
            ? {
                ...m,
                status: 'error',
                error: msg
              }
            : m
        )
      );
    } finally {
      setNonStreamSending(false);
    }
  };

  // Unified send handler
  const handleSend = (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || isBusy) return;

    if (mode === 'streaming') {
      setInput('');
      sendStream(text, {
        spaceId: spaceId ? parseInt(spaceId, 10) : undefined
      });
    } else {
      handleSendNonStreaming(text);
    }
  };

  const handleSelectSuggestedPrompt = (prompt: string) => {
    handleSend(prompt);
  };

  const hasConversations = activeMessages.length > 1;

  return (
    <div className="flex flex-col h-full p-4 md:p-6 max-w-5xl mx-auto space-y-4 relative">
      {/* Header & Space Selector + Mode Switcher */}
      <div className="flex items-center justify-between gap-4 pb-2 border-b border-slate-800/80 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white tracking-wide flex items-center gap-2">
            <Sparkles className="w-5 h-5 md:w-6 md:h-6 text-indigo-400" /> Ask AI / Chat
          </h1>
          <p className="text-slate-400 text-xs mt-0.5">
            RAG-powered vector search across your authorized spaces
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Mode Switcher Toggle (Verification & Fallback) */}
          <div
            role="radiogroup"
            aria-label="Generation mode"
            className="flex items-center bg-[#151d35] border border-slate-700/80 p-0.5 rounded-xl text-[11px]"
          >
            <button
              type="button"
              role="radio"
              aria-checked={mode === 'streaming'}
              onClick={() => setMode('streaming')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium transition ${
                mode === 'streaming'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Zap className="w-3 h-3 text-amber-300" />
              <span>Streaming</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={mode === 'non-streaming'}
              onClick={() => setMode('non-streaming')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium transition ${
                mode === 'non-streaming'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3 h-3 text-slate-400" />
              <span>Standard (REST)</span>
            </button>
          </div>

          {/* Space Filter Dropdown */}
          <div className="flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-slate-400" aria-hidden="true" />
            <select
              aria-label="Filter documents by space"
              className="input bg-[#151d35] border-slate-700/80 text-xs py-1.5 px-3 rounded-xl text-slate-200 focus:border-indigo-500"
              value={spaceId}
              onChange={(e) => setSpaceId(e.target.value)}
            >
              <option value="">All Accessible Spaces</option>
              {spaces.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Accessible Messages Stream Container */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        role="log"
        aria-live="polite"
        aria-atomic="false"
        className="flex-1 overflow-y-auto space-y-4 pr-1 relative min-h-0"
      >
        <AnimatePresence initial={false}>
          {activeMessages.map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <MessageBubble
                message={m}
                onRetry={mode === 'streaming' ? retryStream : undefined}
              />
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Empty State with 3 Suggested Prompts when no user queries have been sent */}
        {!hasConversations && (
          <EmptyChatState onSelectPrompt={handleSelectSuggestedPrompt} />
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Floating Jump to Latest Button */}
      <JumpToLatestButton
        visible={!isAtBottom}
        onClick={jumpToBottom}
      />

      {/* Input Form with Stop/Send Switcher */}
      <div className="pt-2">
        <ChatInput
          input={input}
          onChange={setInput}
          onSend={() => handleSend()}
          onStop={stopStream}
          status={mode === 'streaming' ? streamStatus : (nonStreamSending ? 'waiting' : 'idle')}
        />
      </div>
    </div>
  );
}
