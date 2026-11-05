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

  // Handle Escape key to close widget
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInput(val);

    const lastAtIdx = val.lastIndexOf('@');
    if (lastAtIdx !== -1 && lastAtIdx === val.length - 1) {
      setShowMentionMenu(true);
      setMentionQuery('');
    } else if (lastAtIdx !== -1 && showMentionMenu) {
      setMentionQuery(val.slice(lastAtIdx + 1));
    } else {
      setShowMentionMenu(false);
    }
  };

  const handleSelectMentionDoc = (doc: Document) => {
    if (!selectedDocs.some(d => d._id === doc._id)) {
      setSelectedDocs(prev => [...prev, doc]);
    }
    const lastAtIdx = input.lastIndexOf('@');
    setInput(input.slice(0, lastAtIdx).trim() + ' ');
    setShowMentionMenu(false);
    inputRef.current?.focus();
  };

  const removeSelectedDoc = (docId: string) => {
    setSelectedDocs(prev => prev.filter(d => d._id !== docId));
  };

  const handleSend = async () => {
    const userText = input.trim();
    if (!userText || sending) return;

    setInput('');
    setShowMentionMenu(false);

    const userMessage: Message = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text: userText,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMessage]);
    setSending(true);

    try {
      const res = await api.post('/chat', {
        question: userText,
        documentIds: selectedDocs.map(d => d._id)
      });
      const data = res.data.data;
      const aiMessage: Message = {
        id: `a-${Date.now()}`,
        sender: 'assistant',
        text: data.answer,
        sources: data.sources,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, aiMessage]);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Chat query failed');
    } finally {
      setSending(false);
    }
  };

  const filteredDocs = docs.filter(d => {
    const title = d.title || d.originalName;
    return title.toLowerCase().includes(mentionQuery.toLowerCase());
  });

  return (
    <>
      {/* Floating Trigger Button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full bg-accent-fill text-text-on-accent flex items-center justify-center shadow-md border border-accent-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        title="Ask AI Assistant"
        aria-label={isOpen ? "Close AI Assistant" : "Open AI Assistant"}
      >
        {isOpen ? <X className="w-5 h-5" /> : <MessageSquare className="w-5 h-5" />}
      </motion.button>

      {/* Floating Chat Window Drawer */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 350, damping: 28 }}
            className={`fixed bottom-20 right-6 z-50 bg-surface-1 border border-border-strong shadow-md rounded-card flex flex-col overflow-hidden ${
              isExpanded ? 'w-[680px] h-[600px]' : 'w-[400px] h-[480px]'
            }`}
          >
            {/* Window Header */}
            <div className="px-3.5 py-2.5 bg-surface-1 border-b border-border flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-control bg-surface-2 border border-border flex items-center justify-center text-accent">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-text-primary tracking-tight">AI Knowledge Assistant</h3>
                  <p className="text-[11px] text-text-muted">Type @ to mention documents</p>
                </div>
              </div>

              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="p-1.5 rounded-control text-text-muted hover:text-text-primary hover:bg-surface-2 active:bg-surface-3 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  title={isExpanded ? "Collapse" : "Expand"}
                  aria-label={isExpanded ? "Collapse window" : "Expand window"}
                >
                  {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => setMessages([messages[0]])}
                  className="p-1.5 rounded-control text-text-muted hover:text-text-primary hover:bg-surface-2 active:bg-surface-3 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  title="Clear chat history"
                  aria-label="Clear chat history"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-control text-text-muted hover:text-text-primary hover:bg-surface-2 active:bg-surface-3 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  title="Close window"
                  aria-label="Close chat window"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Messages Body */}
            <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
              {messages.map(m => (
                <div
                  key={m.id}
                  className={`flex gap-2.5 ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {m.sender === 'assistant' && (
                    <div className="w-6 h-6 rounded-control bg-surface-2 border border-border flex items-center justify-center flex-shrink-0 mt-0.5 text-accent">
                      <Bot className="w-3.5 h-3.5" />
                    </div>
                  )}

                  <div className={`max-w-[85%] space-y-1.5 ${m.sender === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className={`px-3 py-2 rounded-card text-xs leading-relaxed ${
                      m.sender === 'user'
                        ? 'bg-surface-2 border border-border text-text-primary rounded-tr-none'
                        : 'bg-surface-1 border border-border text-text-primary rounded-tl-none'
                    }`}>
                      <p className="whitespace-pre-wrap">{m.text}</p>
                    </div>

                    {/* Sources */}
                    {m.sources && m.sources.length > 0 && (
                      <div className="flex gap-1 flex-wrap pt-0.5">
                        {m.sources.map((src, i) => (
                          <div key={i} className="flex items-center gap-1 bg-surface-2 border border-border text-text-secondary text-[10px] px-2 py-0.5 rounded-control">
                            <BookOpen className="w-3 h-3 text-text-muted" />
                            <span className="font-medium truncate max-w-[120px]">{src.documentTitle}</span>
                            <span className="text-text-muted">p.{src.pageNumber || 1}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {m.sender === 'user' && (
                    <div className="w-6 h-6 rounded-control bg-surface-2 border border-border flex items-center justify-center flex-shrink-0 mt-0.5 text-text-muted">
                      <User className="w-3.5 h-3.5" />
                    </div>
                  )}
                </div>
              ))}

              {sending && (
                <div className="flex gap-2 items-center">
                  <div className="w-6 h-6 rounded-control bg-surface-2 border border-border flex items-center justify-center text-accent">
                    <Bot className="w-3.5 h-3.5 animate-pulse motion-reduce:animate-none" />
                  </div>
                  <div className="bg-surface-1 border border-border px-3 py-1.5 rounded-card flex items-center gap-2 text-xs text-text-muted">
                    <Loader2 className="w-3 h-3 animate-spin motion-reduce:animate-none text-accent" /> Thinking…
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Selected Tagged Documents */}
            {selectedDocs.length > 0 && (
              <div className="px-3 py-1.5 bg-surface-2 border-t border-border flex gap-1.5 flex-wrap flex-shrink-0">
                {selectedDocs.map(d => (
                  <span
                    key={d._id}
                    className="inline-flex items-center gap-1 text-[10px] bg-accent-soft border border-accent-border text-accent px-2 py-0.5 rounded-control"
                  >
                    <FileText className="w-3 h-3 text-accent" />
                    <span className="truncate max-w-[120px]">{d.title || d.originalName}</span>
                    <button type="button" onClick={() => removeSelectedDoc(d._id)} className="hover:text-text-primary">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* @ Document Autocomplete Popover */}
            <AnimatePresence>
              {showMentionMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  className="absolute bottom-14 left-3 right-3 bg-surface-1 border border-border-strong rounded-card shadow-md max-h-48 overflow-y-auto z-50 p-1 divide-y divide-border"
                >
                  <div className="px-2 py-1 text-xs font-medium text-text-muted flex items-center gap-1">
                    <AtSign className="w-3.5 h-3.5 text-text-muted" /> Mention document filter ({filteredDocs.length})
                  </div>
                  {filteredDocs.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-text-muted italic">No matching accessible documents</div>
                  ) : (
                    filteredDocs.map(d => (
                      <button
                        key={d._id}
                        type="button"
                        onClick={() => handleSelectMentionDoc(d)}
                        className="w-full text-left px-2.5 py-1.5 min-h-[36px] rounded-control hover:bg-surface-2 active:bg-surface-3 text-xs text-text-secondary hover:text-text-primary flex items-center gap-2 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        <FileText className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
                        <span className="truncate flex-1 font-medium">{d.title || d.originalName}</span>
                      </button>
                    ))
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Input Box Footer */}
            <div className="p-2.5 bg-surface-1 border-t border-border flex-shrink-0">
              <form
                onSubmit={e => { e.preventDefault(); handleSend(); }}
                className="flex gap-1.5 items-center bg-surface-2 border border-border rounded-control px-2.5 py-1 focus-within:border-accent-border focus-within:ring-2 focus-within:ring-accent-soft transition-colors duration-150"
              >
                <button
                  type="button"
                  onClick={() => {
                    setInput(prev => prev + '@');
                    setShowMentionMenu(true);
                    setMentionQuery('');
                    inputRef.current?.focus();
                  }}
                  className="text-text-muted hover:text-accent p-1.5 rounded-control transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  title="Mention document (@)"
                  aria-label="Mention document filter"
                >
                  <AtSign className="w-3.5 h-3.5" />
                </button>

                <input
                  ref={inputRef}
                  className="flex-1 bg-transparent border-0 text-xs text-text-primary focus:outline-none placeholder:text-text-muted py-1 min-h-[36px]"
                  placeholder="Ask AI or type @ to filter docs…"
                  value={input}
                  onChange={handleInputChange}
                  disabled={sending}
                  aria-label="Quick question input"
                />

                <button
                  type="submit"
                  disabled={!input.trim() || sending}
                  className="btn-primary p-2 min-h-[36px] min-w-[36px] rounded-control text-text-on-accent disabled:opacity-40"
                  aria-label="Send quick message"
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
