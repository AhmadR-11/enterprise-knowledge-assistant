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
    <span className={`badge text-[10px] font-mono px-2 py-0.5 rounded-control ${success ? 'badge-ready' : 'badge-failed'}`}>
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
        <h1 className="text-xl font-semibold text-text-primary tracking-tight">Audit & Security Logs</h1>
        <p className="text-text-muted text-xs mt-0.5">
          <span className="font-mono tabular-nums">{total.toLocaleString()}</span> total audit events logged
        </p>
      </div>

      {/* Filters Box */}
      <div className="card shadow-subtle border-border bg-surface-1 p-4 rounded-card">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-3.5 h-3.5 text-text-muted" />
          <span className="text-xs font-semibold text-text-primary">Log Filters</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="label">User Email</label>
            <input className="input text-xs" placeholder="user@company.com" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label">Event Action</label>
            <select className="input text-xs" value={action} onChange={e => setAction(e.target.value)}>
              {ACTIONS.map(a => <option key={a} value={a}>{a || 'All actions'}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Start Date</label>
            <input className="input text-xs" type="date" value={startDate} onChange={e => setStart(e.target.value)} />
          </div>
          <div>
            <label className="label">End Date</label>
            <input className="input text-xs" type="date" value={endDate} onChange={e => setEnd(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-2.5 mt-3.5 pt-3 border-t border-border">
          <button type="button" onClick={applyFilters} className="btn-primary text-xs px-3.5 py-1.5">Apply Filters</button>
          <button type="button" onClick={clearFilters} className="btn-ghost text-xs px-3.5 py-1.5 border border-border text-text-secondary hover:text-text-primary">Clear Filters</button>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden shadow-subtle rounded-card border border-border">
        <table className="w-full">
          <thead className="bg-surface-1 border-b border-border">
            <tr>
              <th className="th py-3 px-4 text-2xs font-semibold text-text-muted">User Email</th>
              <th className="th py-3 px-4 text-2xs font-semibold text-text-muted">Action Type</th>
              <th className="th py-3 px-4 text-2xs font-semibold text-text-muted">IP Address</th>
              <th className="th py-3 px-4 text-2xs font-semibold text-text-muted">Timestamp</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr><td colSpan={4} className="td text-center py-12">
                <Loader2 className="w-5 h-5 animate-spin mx-auto text-accent" />
              </td></tr>
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-text-muted font-mono tabular-nums">
            Page <strong className="text-text-primary">{page}</strong> of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="btn-ghost px-2.5 py-1 rounded-control border border-border text-xs disabled:opacity-30 flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Previous
            </button>
            <button
              type="button"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="btn-ghost px-2.5 py-1 rounded-control border border-border text-xs disabled:opacity-30 flex items-center gap-1"
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
