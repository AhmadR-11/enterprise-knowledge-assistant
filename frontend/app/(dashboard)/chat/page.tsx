'use client';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Bot, User, Sparkles, Building2, BookOpen, Loader2, RefreshCw } from 'lucide-react';
import api from '@/lib/api';
import { Space } from '@/types';
import { toast } from 'sonner';

interface Source {
  documentTitle: string;
  pageNumber: number;
  similarity: number;
}

interface Message {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  sources?: Source[];
  timestamp: Date;
}

export default function ChatPage() {
  const [spaces, setSpaces]           = useState<Space[]>([]);
  const [spaceId, setSpaceId]         = useState('');
  const [messages, setMessages]       = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: 'Hello! I am your Enterprise AI Assistant. Ask me anything about documents in your assigned spaces.',
      timestamp: new Date()
    }
  ]);
  const [input, setInput]             = useState('');
  const [sending, setSending]         = useState(false);
  const messagesEndRef                = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get('/spaces/my').then(r => {
      const fetched = r.data.data.spaces;
      setSpaces(fetched);
      if (fetched.length === 1) {
        setSpaceId(String(fetched[0].id));
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const handleSend = async () => {
    if (!input.trim() || sending) return;

    const userQ = input.trim();
    setInput('');
    const userMsg: Message = {
      id: String(Date.now()),
      sender: 'user',
      text: userQ,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setSending(true);

    try {
      const { data } = await api.post('/chat', {
        question: userQ,
        spaceId: spaceId ? parseInt(spaceId, 10) : undefined
      });

      const aiMsg: Message = {
        id: String(Date.now() + 1),
        sender: 'assistant',
        text: data.data.answer,
        sources: data.data.sources,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, aiMsg]);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      const msg = err.response?.data?.message || 'Failed to get answer from AI';
      toast.error(msg);
      setMessages(prev => [...prev, {
        id: String(Date.now() + 1),
        sender: 'assistant',
        text: `⚠️ Error: ${msg}`,
        timestamp: new Date()
      }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full p-6 max-w-5xl mx-auto space-y-4">
      {/* Header & Space Selector */}
      <div className="flex items-center justify-between gap-4 pb-2 border-b border-slate-800/80">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-wide flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-indigo-400" /> Ask AI / Chat
          </h1>
          <p className="text-slate-400 text-xs mt-0.5">
            RAG-powered vector search across your authorized spaces
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-slate-400" />
          <select
            className="input bg-[#151d35] border-slate-700/80 text-xs py-1.5 px-3 rounded-xl text-slate-200 focus:border-indigo-500"
            value={spaceId}
            onChange={e => setSpaceId(e.target.value)}
          >
            <option value="">All Accessible Spaces</option>
            {spaces.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>

      {/* Messages Stream */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        <AnimatePresence initial={false}>
          {messages.map(m => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex gap-3 ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {m.sender === 'assistant' && (
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 border border-indigo-400/30 flex items-center justify-center flex-shrink-0 shadow-md">
                  <Bot className="w-4 h-4 text-white" />
                </div>
              )}

              <div className={`max-w-2xl space-y-2 ${m.sender === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`p-4 rounded-2xl text-xs leading-relaxed shadow-lg ${
                  m.sender === 'user'
                    ? 'bg-indigo-600 text-white rounded-tr-none'
                    : 'bg-[#151d35] border border-slate-800 text-slate-200 rounded-tl-none'
                }`}>
                  <p className="whitespace-pre-wrap">{m.text}</p>
                </div>

                {/* Sources & Citations */}
                {m.sources && m.sources.length > 0 && (
                  <div className="flex gap-2 flex-wrap pt-1">
                    {m.sources.map((src, i) => (
                      <div key={i} className="flex items-center gap-1.5 bg-[#0f1629] border border-indigo-500/30 text-indigo-300 text-[10px] px-2.5 py-1 rounded-lg">
                        <BookOpen className="w-3 h-3 text-indigo-400" />
                        <span className="font-semibold truncate max-w-[150px]">{src.documentTitle}</span>
                        <span className="text-slate-500">p.{src.pageNumber}</span>
                        <span className="text-emerald-400 font-mono">({Math.round(src.similarity * 100)}%)</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {m.sender === 'user' && (
                <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center flex-shrink-0 shadow-md">
                  <User className="w-4 h-4 text-slate-300" />
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {sending && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3 items-center">
            <div className="w-8 h-8 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
              <Bot className="w-4 h-4 text-indigo-400 animate-pulse" />
            </div>
            <div className="bg-[#151d35] border border-slate-800 px-4 py-3 rounded-2xl flex items-center gap-2 text-xs text-slate-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" /> Searching space documents & generating answer...
            </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <div className="pt-2">
        <form
          onSubmit={e => { e.preventDefault(); handleSend(); }}
          className="flex gap-2 bg-[#0f1629] border border-slate-800/80 p-2 rounded-2xl shadow-xl focus-within:border-indigo-500/60 transition-all"
        >
          <input
            className="flex-1 bg-transparent border-0 px-3 text-sm text-white focus:outline-none placeholder:text-slate-500"
            placeholder="Ask a question about documents in your space(s)..."
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={sending}
          />
          <button
            type="submit"
            disabled={!input.trim() || sending}
            className="btn-primary p-3 rounded-xl shadow-lg shadow-indigo-500/20 disabled:opacity-40"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
