'use client';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, Loader2, Search, UserCheck } from 'lucide-react';
import api from '@/lib/api';
import { User } from '@/types';
import { useAuthStore } from '@/lib/store';
import { toast } from 'sonner';

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
    api.get('/users')
      .then(r => setUsers(r.data.data.users))
      .catch(() => toast.error('Failed to fetch users'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchUsers(); }, []);

  const createUser = async () => {
    if (!form.email || !form.password) {
      setError('Please fill in all fields');
      return;
    }
    setCreating(true);
    setError('');
    const toastId = toast.loading('Creating user account...');
    try {
      await api.post('/users', form);
      toast.success(`User ${form.email} created successfully`, { id: toastId });
      setShowModal(false);
      setForm({ email: '', password: '', role: 'viewer' });
      fetchUsers();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      const msg = err.response?.data?.message || 'Failed to create user';
      setError(msg);
      toast.error(msg, { id: toastId });
    } finally {
      setCreating(false);
    }
  };

  const deleteUser = async (id: number, email: string) => {
    if (!confirm(`Delete user ${email}?`)) return;
    const toastId = toast.loading(`Deleting ${email}...`);
    try {
      await api.delete(`/users/${id}`);
      toast.success(`User ${email} deleted`, { id: toastId });
      fetchUsers();
    } catch {
      toast.error('Failed to delete user', { id: toastId });
    }
  };

  const changeRole = async (id: number, role: User['role'], email: string) => {
    const toastId = toast.loading(`Updating role for ${email}...`);
    try {
      await api.patch(`/users/${id}/role`, { role });
      toast.success(`Role updated to "${role}"`, { id: toastId });
      fetchUsers();
    } catch {
      toast.error('Failed to update user role', { id: toastId });
    }
  };

  const filtered = users.filter(u =>
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.role.includes(search.toLowerCase())
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="p-6 max-w-5xl mx-auto space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-wide">User Management</h1>
          <p className="text-slate-400 text-sm mt-1">{users.length} system accounts registered</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="btn-primary flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl shadow-lg shadow-indigo-500/20"
        >
          <Plus className="w-4 h-4" /> New User
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          className="input pl-10 bg-[#151d35] border-slate-700/70 text-slate-200"
          placeholder="Search by email or role..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden shadow-xl">
        <table className="w-full">
          <thead className="bg-[#0a0f1e]/80 border-b border-slate-800">
            <tr>
              <th className="th py-3.5 px-4 text-xs font-semibold text-slate-400">Email Address</th>
              <th className="th py-3.5 px-4 text-xs font-semibold text-slate-400">Access Role</th>
              <th className="th py-3.5 px-4 text-xs font-semibold text-slate-400">Created Date</th>
              <th className="th py-3.5 px-4 text-xs font-semibold text-slate-400">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {loading ? (
              <tr><td colSpan={4} className="td text-center py-12">
                <Loader2 className="w-5 h-5 animate-spin mx-auto text-indigo-400" />
              </td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={4} className="td text-center py-12 text-slate-500 text-sm">No users found</td></tr>
            ) : (
              <AnimatePresence>
                {filtered.map(u => {
                  const isSelf = currentUser?.id === u.id || currentUser?.email === u.email;
                  return (
                    <motion.tr
                      key={u.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="table-row hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="td py-3.5 px-4 font-medium text-white text-sm">
                        <div className="flex items-center gap-2">
                          {isSelf && <UserCheck className="w-4 h-4 text-indigo-400" />}
                          {u.email}
                        </div>
                      </td>
                      <td className="td py-3.5 px-4">
                        <select
                          value={u.role}
                          onChange={e => changeRole(u.id, e.target.value as User['role'], u.email)}
                          disabled={isSelf}
                          title={isSelf ? "You cannot change your own role" : ""}
                          className={`bg-[#151d35] border border-slate-700/80 text-slate-300 rounded-xl px-2.5 py-1 text-xs focus:outline-none focus:border-indigo-500 ${isSelf ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-slate-600'}`}
                        >
                          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </td>
                      <td className="td py-3.5 px-4 text-slate-500 text-xs">{new Date(u.created_at).toLocaleDateString()}</td>
                      <td className="td py-3.5 px-4">
                        {isSelf ? (
                          <span className="text-xs text-indigo-400 font-semibold px-2 py-1 bg-indigo-500/10 rounded-md border border-indigo-500/20">
                            Current User
                          </span>
                        ) : (
                          <button
                            onClick={() => deleteUser(u.id, u.email)}
                            className="btn-danger flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg hover:bg-red-500/20 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                          </button>
                        )}
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            )}
          </tbody>
        </table>
      </div>

      {/* Animated Create Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.2 }}
              className="card w-full max-w-sm border-slate-700/80 shadow-2xl bg-[#0f1629]"
            >
              <h2 className="font-bold text-white text-lg mb-4">Create User Account</h2>
              <div className="space-y-4">
                <div>
                  <label className="label text-xs font-semibold text-slate-400 mb-1">Email Address</label>
                  <input
                    className="input bg-[#151d35] border-slate-700"
                    type="email"
                    placeholder="user@company.com"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label text-xs font-semibold text-slate-400 mb-1">Password</label>
                  <input
                    className="input bg-[#151d35] border-slate-700"
                    type="password"
                    placeholder="Min 6 characters"
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label text-xs font-semibold text-slate-400 mb-1">Assign Role</label>
                  <select
                    className="input bg-[#151d35] border-slate-700"
                    value={form.role}
                    onChange={e => setForm(f => ({ ...f, role: e.target.value as User['role'] }))}
                  >
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                {error && <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{error}</p>}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => { setShowModal(false); setError(''); }}
                    className="btn-ghost flex-1 text-xs py-2.5 rounded-xl border border-slate-700/70"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={createUser}
                    disabled={creating}
                    className="btn-primary flex-1 flex items-center justify-center gap-2 text-xs py-2.5 rounded-xl shadow-md"
                  >
                    {creating && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Create Account
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
