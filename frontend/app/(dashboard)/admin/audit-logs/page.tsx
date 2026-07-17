'use client';
import { useEffect, useState } from 'react';
import { Search, Loader2, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import api from '@/lib/api';
import { AuditLog } from '@/types';
import { format } from 'date-fns';

const ACTIONS = ['', 'AUTH_LOGIN_SUCCESS', 'AUTH_LOGIN_FAILURE', 'AUTH_REGISTER_SUCCESS', 'CHAT_QUERY'];

function ActionBadge({ action, success }: { action: string; success: boolean }) {
  const isSuccess = success;
  return (
    <span className={`badge text-[10px] ${isSuccess ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/20' : 'bg-red-500/20 text-red-300 border border-red-500/20'}`}>
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

  const fetchLogs = (p = 1) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), limit: String(LIMIT) });
    if (email)     params.set('email', email);
    if (action)    params.set('action', action);
    if (startDate) params.set('startDate', startDate);
    if (endDate)   params.set('endDate', endDate);
    api.get(`/audit?${params}`)
      .then(r => { setLogs(r.data.data.logs); setTotal(r.data.data.pagination.total); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchLogs(page); }, [page]);

  const applyFilters = () => { setPage(1); fetchLogs(1); };
  const clearFilters = () => { setEmail(''); setAction(''); setStart(''); setEnd(''); setPage(1); fetchLogs(1); };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="p-6 max-w-6xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Audit Logs</h1>
        <p className="text-slate-400 text-sm mt-1">{total.toLocaleString()} total events</p>
      </div>

      {/* Filters */}
      <div className="card mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-indigo-400" />
          <span className="text-sm font-medium text-white">Filters</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="label">Email</label>
            <input className="input" placeholder="user@company.com" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label">Action</label>
            <select className="input" value={action} onChange={e => setAction(e.target.value)}>
              {ACTIONS.map(a => <option key={a} value={a}>{a || 'All actions'}</option>)}
            </select>
          </div>
          <div>
            <label className="label">From</label>
            <input className="input" type="date" value={startDate} onChange={e => setStart(e.target.value)} />
          </div>
          <div>
            <label className="label">To</label>
            <input className="input" type="date" value={endDate} onChange={e => setEnd(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={applyFilters} className="btn-primary text-sm px-4">Apply</button>
          <button onClick={clearFilters} className="btn-ghost text-sm">Clear</button>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full">
          <thead className="bg-[#0a0f1e]/60">
            <tr>
              <th className="th">Email</th>
              <th className="th">Action</th>
              <th className="th">IP</th>
              <th className="th">Time</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="td text-center py-12">
                <Loader2 className="w-5 h-5 animate-spin mx-auto text-indigo-400" />
              </td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={4} className="td text-center py-12 text-slate-500">No logs match the filters</td></tr>
            ) : logs.map(log => (
              <tr key={log._id} className="table-row">
                <td className="td text-white font-medium text-sm">{log.email}</td>
                <td className="td"><ActionBadge action={log.action} success={log.success} /></td>
                <td className="td text-slate-500 text-xs">{log.ip || '—'}</td>
                <td className="td text-slate-500 text-xs whitespace-nowrap">
                  {format(new Date(log.timestamp), 'MMM d, yyyy HH:mm:ss')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-slate-500">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="btn-ghost px-2 disabled:opacity-30">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="btn-ghost px-2 disabled:opacity-30">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
