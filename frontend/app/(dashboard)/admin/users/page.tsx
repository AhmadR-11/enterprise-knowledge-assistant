'use client';
import { useEffect, useState, Fragment } from 'react';
import { Plus, Trash2, RefreshCw, Loader2, Search } from 'lucide-react';
import api from '@/lib/api';
import { User } from '@/types';
import { useAuthStore } from '@/lib/store';

const ROLES = ['admin', 'editor', 'viewer'] as const;

export default function UsersPage() {
  const currentUser = useAuthStore((s) => s.user);
  const [users, setUsers]       = useState<User[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm]         = useState({ email: '', password: '', role: 'viewer' as User['role'] });
  const [creating, setCreating] = useState(false);
  const [error, setError]       = useState('');

  const fetchUsers = () => {
    setLoading(true);
    api.get('/users').then(r => setUsers(r.data.data.users)).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { fetchUsers(); }, []);

  const createUser = async () => {
    setCreating(true); setError('');
    try {
      await api.post('/users', form);
      setShowModal(false);
      setForm({ email: '', password: '', role: 'viewer' });
      fetchUsers();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err.response?.data?.message || 'Failed to create user');
    } finally { setCreating(false); }
  };

  const deleteUser = async (id: number) => {
    if (!confirm('Delete this user?')) return;
    await api.delete(`/users/${id}`).catch(() => {});
    fetchUsers();
  };

  const changeRole = async (id: number, role: User['role']) => {
    await api.patch(`/users/${id}/role`, { role }).catch(() => {});
    fetchUsers();
  };

  const filtered = users.filter(u =>
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.role.includes(search.toLowerCase())
  );

  return (
    <div className="p-6 max-w-5xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Users</h1>
          <p className="text-slate-400 text-sm mt-1">{users.length} total users</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> New User
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input className="input pl-9" placeholder="Search by email or role..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full">
          <thead className="bg-[#0a0f1e]/60">
            <tr>
              <th className="th">Email</th>
              <th className="th">Role</th>
              <th className="th">Created</th>
              <th className="th">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="td text-center py-12">
                <Loader2 className="w-5 h-5 animate-spin mx-auto text-indigo-400" />
              </td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={4} className="td text-center py-12 text-slate-500">No users found</td></tr>
            ) : filtered.map(u => {
              const isSelf = currentUser?.id === u.id || currentUser?.email === u.email;
              return (
                <tr key={u.id} className="table-row">
                  <td className="td font-medium text-white">{u.email}</td>
                  <td className="td">
                    <select
                      value={u.role}
                      onChange={e => changeRole(u.id, e.target.value as User['role'])}
                      disabled={isSelf}
                      title={isSelf ? "You cannot change your own role" : ""}
                      className={`bg-[#151d35] border border-slate-700 text-slate-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-indigo-500 ${isSelf ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td className="td text-slate-500 text-xs">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td className="td">
                    {isSelf ? (
                      <span className="text-xs text-slate-500 font-medium italic">Current User</span>
                    ) : (
                      <button onClick={() => deleteUser(u.id)} className="btn-danger flex items-center gap-1">
                        <Trash2 className="w-3 h-3" /> Delete
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="card w-full max-w-sm mx-4 border-slate-700 animate-slide-up">
            <h2 className="font-semibold text-white mb-4">Create New User</h2>
            <div className="space-y-3">
              <div>
                <label className="label">Email</label>
                <input className="input" type="email" placeholder="user@company.com"
                  value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <label className="label">Password</label>
                <input className="input" type="password" placeholder="Min 6 characters"
                  value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
              </div>
              <div>
                <label className="label">Role</label>
                <select className="input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as User['role'] }))}>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              {error && <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
              <div className="flex gap-2 pt-2">
                <button onClick={() => { setShowModal(false); setError(''); }} className="btn-ghost flex-1 text-sm">Cancel</button>
                <button onClick={createUser} disabled={creating} className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm">
                  {creating && <Loader2 className="w-3 h-3 animate-spin" />} Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
