'use client';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare, X, Send, Bot, User, Sparkles,
  BookOpen, Loader2, Minimize2, Maximize2, AtSign, FileText, Trash2
} from 'lucide-react';
import api from '@/lib/api';
import { Document } from '@/types';
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

export default function FloatingChatWidget() {
  const [isOpen, setIsOpen]           = useState(false);
  const [isExpanded, setIsExpanded]   = useState(false);
  const [docs, setDocs]               = useState<Document[]>([]);
  const [messages, setMessages]       = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: 'Hello! I am your AI Knowledge Assistant. Ask a question or type "@" to mention and target specific documents.',
      timestamp: new Date()
    }
  ]);
  const [input, setInput]             = useState('');
  const [sending, setSending]         = useState(false);

  // @ Mention state
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionQuery, setMentionQuery]       = useState('');
  const [selectedDocs, setSelectedDocs]       = useState<Document[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load accessible documents on widget mount
  useEffect(() => {
    if (isOpen && docs.length === 0) {
      api.get('/documents')
        .then(r => setDocs(r.data.data.documents))
        .catch(() => {});
    }
  }, [isOpen, docs.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending, isOpen]);

  // Handle Input Change & @ Trigger Detection
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInput(val);

    const lastAtPos = val.lastIndexOf('@');
    if (lastAtPos !== -1) {
      const textAfterAt = val.slice(lastAtPos + 1);
      // If there's no space after '@', treat as active search
      if (!textAfterAt.includes(' ')) {
        setShowMentionMenu(true);
        setMentionQuery(textAfterAt.toLowerCase());
        return;
      }
    }
    setShowMentionMenu(false);
  };

  // Select a document from @ dropdown
  const handleSelectMentionDoc = (doc: Document) => {
    if (!selectedDocs.find(d => d._id === doc._id)) {
      setSelectedDocs(prev => [...prev, doc]);
    }
    // Remove the current @query from input
    const lastAtPos = input.lastIndexOf('@');
    const newInput = input.slice(0, lastAtPos) + `@${doc.title || doc.originalName} `;
    setInput(newInput);
    setShowMentionMenu(false);
    inputRef.current?.focus();
  };

  const removeSelectedDoc = (docId: string) => {
    setSelectedDocs(prev => prev.filter(d => d._id !== docId));
  };

  const handleSend = async () => {
    if (!input.trim() || sending) return;

    const userQ = input.trim();
    setInput('');
    setShowMentionMenu(false);

    const userMsg: Message = {
      id: String(Date.now()),
      sender: 'user',
      text: userQ,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setSending(true);

    const documentIds = selectedDocs.map(d => d._id);

    try {
      const { data } = await api.post('/chat', {
        question: userQ,
        documentIds: documentIds.length > 0 ? documentIds : undefined
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
        text: `⚠️ ${msg}`,
        timestamp: new Date()
      }]);
    } finally {
      setSending(false);
    }
  };

  const filteredDocs = docs.filter(d => {
    const name = (d.title || d.originalName).toLowerCase();
    return name.includes(mentionQuery);
  });

  return (
    <>
      {/* Floating Trigger Button */}
      <motion.button
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white flex items-center justify-center shadow-2xl shadow-indigo-500/40 border border-indigo-400/40 focus:outline-none"
        title="Ask AI Assistant"
      >
        {isOpen ? <X className="w-6 h-6" /> : <MessageSquare className="w-6 h-6" />}
      </motion.button>

      {/* Floating Chat Window Drawer */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 350, damping: 25 }}
            className={`fixed bottom-24 right-6 z-50 bg-[#0f1629]/95 backdrop-blur-2xl border border-slate-700/80 shadow-2xl rounded-2xl flex flex-col overflow-hidden transition-all duration-300 ${
              isExpanded ? 'w-[700px] h-[650px]' : 'w-[420px] h-[520px]'
            }`}
          >
            {/* Window Header */}
            <div className="px-4 py-3 bg-[#151d35]/90 border-b border-slate-800 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white tracking-wide">AI Knowledge Assistant</h3>
                  <p className="text-[10px] text-slate-400 font-medium">Type @ to mention documents</p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition"
                  title={isExpanded ? "Collapse" : "Expand"}
                >
                  {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => setMessages([messages[0]])}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition"
                  title="Clear chat history"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Messages Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map(m => (
                <div
                  key={m.id}
                  className={`flex gap-2.5 ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {m.sender === 'assistant' && (
                    <div className="w-7 h-7 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Bot className="w-3.5 h-3.5 text-indigo-400" />
                    </div>
                  )}

                  <div className={`max-w-[85%] space-y-1.5 ${m.sender === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className={`px-3.5 py-2.5 rounded-xl text-xs leading-relaxed ${
                      m.sender === 'user'
                        ? 'bg-indigo-600 text-white rounded-tr-none'
                        : 'bg-[#151d35] border border-slate-800 text-slate-200 rounded-tl-none'
                    }`}>
                      <p className="whitespace-pre-wrap">{m.text}</p>
                    </div>

                    {/* Sources / Citations */}
                    {m.sources && m.sources.length > 0 && (
                      <div className="flex gap-1.5 flex-wrap pt-1">
                        {m.sources.map((src, i) => (
                          <div key={i} className="flex items-center gap-1 bg-[#0a0f1e] border border-indigo-500/30 text-indigo-300 text-[10px] px-2 py-0.5 rounded-md">
                            <BookOpen className="w-3 h-3 text-indigo-400" />
                            <span className="font-semibold truncate max-w-[120px]">{src.documentTitle}</span>
                            <span className="text-slate-500">p.{src.pageNumber || 1}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {m.sender === 'user' && (
                    <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <User className="w-3.5 h-3.5 text-slate-300" />
                    </div>
                  )}
                </div>
              ))}

              {sending && (
                <div className="flex gap-2.5 items-center">
                  <div className="w-7 h-7 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
                    <Bot className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                  </div>
                  <div className="bg-[#151d35] border border-slate-800 px-3.5 py-2 rounded-xl flex items-center gap-2 text-xs text-slate-400">
                    <Loader2 className="w-3 h-3 animate-spin text-indigo-400" /> Thinking...
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Selected Tagged Documents Pills */}
            {selectedDocs.length > 0 && (
              <div className="px-3 py-1.5 bg-[#151d35]/60 border-t border-slate-800 flex gap-1.5 flex-wrap flex-shrink-0">
                {selectedDocs.map(d => (
                  <span
                    key={d._id}
                    className="inline-flex items-center gap-1 text-[10px] bg-indigo-600/20 border border-indigo-500/40 text-indigo-300 px-2 py-0.5 rounded-md"
                  >
                    <FileText className="w-3 h-3 text-indigo-400" />
                    <span className="truncate max-w-[120px]">{d.title || d.originalName}</span>
                    <button onClick={() => removeSelectedDoc(d._id)} className="hover:text-white">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Real-time @ Document Autocomplete Popover */}
            <AnimatePresence>
              {showMentionMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute bottom-16 left-3 right-3 bg-[#0a0f1e] border border-indigo-500/40 rounded-xl shadow-2xl max-h-48 overflow-y-auto z-50 p-1.5 divide-y divide-slate-800/60"
                >
                  <div className="px-2 py-1 text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1">
                    <AtSign className="w-3 h-3 text-indigo-400" /> Mention Document Filter ({filteredDocs.length})
                  </div>
                  {filteredDocs.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-slate-500 italic">No matching accessible documents</div>
                  ) : (
                    filteredDocs.map(d => (
                      <button
                        key={d._id}
                        onClick={() => handleSelectMentionDoc(d)}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-indigo-600/20 hover:text-white text-xs text-slate-300 flex items-center gap-2 transition"
                      >
                        <FileText className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                        <span className="truncate flex-1 font-medium">{d.title || d.originalName}</span>
                      </button>
                    ))
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Input Box Footer */}
            <div className="p-3 bg-[#151d35]/90 border-t border-slate-800 flex-shrink-0">
              <form
                onSubmit={e => { e.preventDefault(); handleSend(); }}
                className="flex gap-2 items-center bg-[#0a0f1e] border border-slate-700/80 rounded-xl px-3 py-1.5 focus-within:border-indigo-500"
              >
                <button
                  type="button"
                  onClick={() => {
                    setInput(prev => prev + '@');
                    setShowMentionMenu(true);
                    setMentionQuery('');
                    inputRef.current?.focus();
                  }}
                  className="text-slate-400 hover:text-indigo-400 p-1 rounded-lg"
                  title="Mention document (@)"
                >
                  <AtSign className="w-4 h-4" />
                </button>

                <input
                  ref={inputRef}
                  className="flex-1 bg-transparent border-0 text-xs text-white focus:outline-none placeholder:text-slate-500 py-1.5"
                  placeholder="Ask AI or type @ to filter docs..."
                  value={input}
                  onChange={handleInputChange}
                  disabled={sending}
                />

                <button
                  type="submit"
                  disabled={!input.trim() || sending}
                  className="btn-primary p-2 rounded-lg text-white disabled:opacity-40"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
