'use client';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import api from '@/lib/api';
import { AuditLog } from '@/types';
import { format } from 'date-fns';
import { toast } from 'sonner';

const ACTIONS = ['', 'AUTH_LOGIN_SUCCESS', 'AUTH_LOGIN_FAILURE', 'AUTH_REGISTER_SUCCESS', 'CHAT_QUERY', 'DOCUMENT_UPLOAD', 'DOCUMENT_DELETE'];

function ActionBadge({ action, success }: { action: string; success: boolean }) {
  return (
    <span className={`badge text-[11px] font-mono px-2 py-0.5 rounded-control ${success ? 'badge-ready' : 'badge-failed'}`}>
      {action.replace(/_/g, ' ')}
    </span>
  );
}

export default function AuditLogsPage() {
  const [logs, setLogs]       = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail]     = useState('');
  const [action, setAction]   = useState('');
  const [startDate, setStart] = useState('');
  const [endDate, setEnd]     = useState('');
  const [page, setPage]       = useState(1);
  const [total, setTotal]     = useState(0);
  const LIMIT = 20;

  const fetchLogs = (p = 1, notify = false) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), limit: String(LIMIT) });
    if (email)     params.set('email', email);
    if (action)    params.set('action', action);
    if (startDate) params.set('startDate', startDate);
    if (endDate)   params.set('endDate', endDate);
    api.get(`/audit?${params}`)
      .then(r => {
        setLogs(r.data.data.logs);
        setTotal(r.data.data.pagination.total);
        if (notify) toast.success(`Found ${r.data.data.pagination.total} audit events`);
      })
      .catch(() => toast.error('Failed to fetch audit logs'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchLogs(page); }, [page]);

  const applyFilters = () => { setPage(1); fetchLogs(1, true); };
  const clearFilters = () => { setEmail(''); setAction(''); setStart(''); setEnd(''); setPage(1); fetchLogs(1, true); };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="p-6 max-w-6xl mx-auto space-y-6"
    >
      <div>
        <h1 className="text-[22px] font-semibold text-text-primary tracking-tight">Audit & Security Logs</h1>
        <p className="text-text-muted text-xs mt-1">
          <span className="font-mono tabular-nums">{total.toLocaleString()}</span> total audit events logged
        </p>
      </div>

      {/* Filters Box */}
      <div className="card shadow-subtle border-border bg-surface-1 p-4 rounded-card">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-3.5 h-3.5 text-text-muted" />
          <span className="text-xs font-semibold text-text-primary">Log filters</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="label">User email</label>
            <input className="input text-xs" placeholder="user@company.com" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label">Event action</label>
            <select className="input text-xs" value={action} onChange={e => setAction(e.target.value)}>
              {ACTIONS.map(a => <option key={a} value={a}>{a || 'All actions'}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Start date</label>
            <input className="input text-xs" type="date" value={startDate} onChange={e => setStart(e.target.value)} />
          </div>
          <div>
            <label className="label">End date</label>
            <input className="input text-xs" type="date" value={endDate} onChange={e => setEnd(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-2.5 mt-3.5 pt-3 border-t border-border">
          <button type="button" onClick={applyFilters} className="btn-primary text-xs px-3.5 py-1.5 min-h-[36px]">Apply filters</button>
          <button type="button" onClick={clearFilters} className="btn-ghost text-xs px-3.5 py-1.5 min-h-[36px] border border-border text-text-secondary hover:text-text-primary">Clear filters</button>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden shadow-subtle rounded-card border border-border">
        <div className="overflow-x-auto w-full">
          <table className="w-full">
            <thead className="bg-surface-1 border-b border-border sticky top-0 z-10">
              <tr>
                <th className="th py-3 px-4 text-xs font-medium text-text-muted text-left">User email</th>
                <th className="th py-3 px-4 text-xs font-medium text-text-muted text-left">Action type</th>
                <th className="th py-3 px-4 text-xs font-medium text-text-muted text-left">IP address</th>
                <th className="th py-3 px-4 text-xs font-medium text-text-muted text-left">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                [1, 2, 3, 4, 5].map(i => (
                  <tr key={i} className="animate-pulse motion-reduce:animate-none">
                    <td className="py-3.5 px-4"><div className="h-3.5 w-32 bg-surface-2 rounded" /></td>
                    <td className="py-3.5 px-4"><div className="h-4 w-28 bg-surface-2 rounded-control" /></td>
                    <td className="py-3.5 px-4"><div className="h-3.5 w-24 bg-surface-2 rounded" /></td>
                    <td className="py-3.5 px-4"><div className="h-3.5 w-36 bg-surface-2 rounded" /></td>
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr><td colSpan={4} className="td text-center py-12 text-text-muted text-xs">No audit logs match the current filters</td></tr>
              ) : (
                <AnimatePresence>
                  {logs.map(log => (
                    <motion.tr
                      key={log._id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="table-row hover:bg-surface-2 transition-colors"
                    >
                      <td className="td py-3 px-4 text-text-primary font-medium text-xs">{log.email}</td>
                      <td className="td py-3 px-4"><ActionBadge action={log.action} success={log.success} /></td>
                      <td className="td py-3 px-4 text-text-muted text-xs font-mono tabular-nums">{log.ip || '—'}</td>
                      <td className="td py-3 px-4 text-text-muted text-xs whitespace-nowrap font-mono tabular-nums">
                        {format(new Date(log.timestamp), 'MMM d, yyyy HH:mm:ss')}
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-text-muted">
            Page <strong className="text-text-primary font-mono tabular-nums">{page}</strong> of <span className="font-mono tabular-nums">{totalPages}</span>
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="btn-ghost px-2.5 py-1 min-h-[36px] rounded-control border border-border text-xs disabled:opacity-30 active:bg-surface-3 flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Previous
            </button>
            <button
              type="button"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="btn-ghost px-2.5 py-1 min-h-[36px] rounded-control border border-border text-xs disabled:opacity-30 active:bg-surface-3 flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
