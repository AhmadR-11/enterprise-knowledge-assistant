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
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="p-6 max-w-5xl mx-auto space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary tracking-tight">User Management</h1>
          <p className="text-text-muted text-xs mt-0.5">
            <span className="font-mono tabular-nums">{users.length}</span> system accounts registered
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="btn-primary flex items-center gap-1.5 text-xs px-3.5 py-2"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>New User</span>
        </button>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
        <input
          className="input pl-9 text-xs"
          placeholder="Search by email or role..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Users Table */}
      <div className="card p-0 overflow-hidden shadow-subtle rounded-card border border-border">
        <table className="w-full">
          <thead className="bg-surface-1 border-b border-border">
            <tr>
              <th className="th py-3 px-4 text-2xs font-semibold text-text-muted">Email Address</th>
              <th className="th py-3 px-4 text-2xs font-semibold text-text-muted">Access Role</th>
              <th className="th py-3 px-4 text-2xs font-semibold text-text-muted">Created Date</th>
              <th className="th py-3 px-4 text-2xs font-semibold text-text-muted">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr><td colSpan={4} className="td text-center py-12">
                <Loader2 className="w-5 h-5 animate-spin mx-auto text-accent" />
              </td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={4} className="td text-center py-12 text-text-muted text-xs">No users found</td></tr>
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
                      className="table-row hover:bg-surface-2 transition-colors"
                    >
                      <td className="td py-3 px-4 font-medium text-text-primary text-xs">
                        <div className="flex items-center gap-2">
                          {isSelf && <UserCheck className="w-3.5 h-3.5 text-accent" />}
                          <span>{u.email}</span>
                        </div>
                      </td>
                      <td className="td py-3 px-4">
                        <select
                          value={u.role}
                          onChange={e => changeRole(u.id, e.target.value as User['role'], u.email)}
                          disabled={isSelf}
                          title={isSelf ? "You cannot change your own role" : ""}
                          className={`bg-surface-2 border border-border text-text-primary rounded-control px-2.5 py-1 text-xs focus:outline-none focus:border-accent-border ${isSelf ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-border-strong'}`}
                        >
                          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </td>
                      <td className="td py-3 px-4 text-text-muted text-xs font-mono tabular-nums">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td className="td py-3 px-4">
                        {isSelf ? (
                          <span className="badge badge-admin text-[10px] py-0 px-2">
                            Current User
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => deleteUser(u.id, u.email)}
                            className="btn-danger flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-control"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Delete</span>
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

      {/* Create Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 bg-surface-overlay flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ duration: 0.15 }}
              className="card w-full max-w-sm border border-border-strong bg-surface-1 shadow-popover p-5 rounded-card"
            >
              <h2 className="font-semibold text-text-primary text-sm mb-3.5">Create User Account</h2>
              <div className="space-y-3.5">
                <div>
                  <label className="label">Email Address</label>
                  <input
                    className="input text-xs"
                    type="email"
                    placeholder="user@company.com"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label">Password</label>
                  <input
                    className="input text-xs"
                    type="password"
                    placeholder="Min 6 characters"
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label">Assign Role</label>
                  <select
                    className="input text-xs"
                    value={form.role}
                    onChange={e => setForm(f => ({ ...f, role: e.target.value as User['role'] }))}
                  >
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                {error && <p className="text-danger text-xs bg-danger/10 border border-danger/20 rounded-control px-2.5 py-1.5">{error}</p>}
                <div className="flex gap-2.5 pt-2 border-t border-border">
                  <button
                    type="button"
                    onClick={() => { setShowModal(false); setError(''); }}
                    className="btn-ghost flex-1 text-xs py-2 border border-border text-text-secondary hover:text-text-primary"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={createUser}
                    disabled={creating}
                    className="btn-primary flex-1 flex items-center justify-center gap-1.5 text-xs py-2"
                  >
                    {creating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>Create Account</span>
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
