'use client';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, Pencil, UserPlus, UserMinus, Loader2, Check, X, Building2, Users } from 'lucide-react';
import api from '@/lib/api';
import { Space, User } from '@/types';
import { toast } from 'sonner';

export default function SpacesPage() {
  const [spaces, setSpaces]       = useState<Space[]>([]);
  const [users, setUsers]         = useState<User[]>([]);
  const [loading, setLoading]     = useState(true);
  const [editId, setEditId]       = useState<number | null>(null);
  const [editName, setEditName]   = useState('');
  const [newName, setNewName]     = useState('');
  const [creating, setCreating]   = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [assignModal, setAssignModal] = useState<Space | null>(null);
  const [spaceUsers, setSpaceUsers]   = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState('');

  const fetchSpaces = () => {
    setLoading(true);
    api.get('/spaces/my')
      .then(r => setSpaces(r.data.data.spaces))
      .catch(() => toast.error('Failed to fetch spaces'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchSpaces();
    api.get('/users').then(r => setUsers(r.data.data.users)).catch(() => {});
  }, []);

  const createSpace = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    const toastId = toast.loading('Creating new space...');
    try {
      await api.post('/spaces', { name: newName.trim() });
      toast.success(`Space "${newName.trim()}" created`, { id: toastId });
      setNewName('');
      setShowCreate(false);
      fetchSpaces();
    } catch {
      toast.error('Failed to create space', { id: toastId });
    } finally {
      setCreating(false);
    }
  };

  const renameSpace = async (id: number) => {
    if (!editName.trim()) return;
    const toastId = toast.loading('Renaming space...');
    try {
      await api.patch(`/spaces/${id}`, { name: editName });
      toast.success('Space renamed', { id: toastId });
      setEditId(null);
      fetchSpaces();
    } catch {
      toast.error('Failed to rename space', { id: toastId });
    }
  };

  const deleteSpace = async (id: number, name: string) => {
    if (!confirm(`Delete space "${name}"? All membership data will be unlinked.`)) return;
    const toastId = toast.loading('Deleting space...');
    try {
      await api.delete(`/spaces/${id}`);
      toast.success(`Space "${name}" deleted`, { id: toastId });
      fetchSpaces();
    } catch {
      toast.error('Failed to delete space', { id: toastId });
    }
  };

  const openAssign = async (space: Space) => {
    setAssignModal(space);
    try {
      const r = await api.get(`/spaces/${space.id}/users`);
      setSpaceUsers(r.data.data.users);
    } catch {
      setSpaceUsers([]);
    }
  };

  const assignUser = async () => {
    if (!selectedUser || !assignModal) return;
    const toastId = toast.loading('Adding member to space...');
    try {
      await api.post('/spaces/assign', { userId: selectedUser, spaceId: assignModal.id });
      toast.success('Member added to space', { id: toastId });
      const r = await api.get(`/spaces/${assignModal.id}/users`);
      setSpaceUsers(r.data.data.users);
      setSelectedUser('');
    } catch {
      toast.error('Failed to add member', { id: toastId });
    }
  };

  const removeUser = async (userId: number) => {
    if (!assignModal) return;
    const toastId = toast.loading('Removing member from space...');
    try {
      await api.delete('/spaces/assign', { data: { userId, spaceId: assignModal.id } });
      toast.success('Member removed', { id: toastId });
      setSpaceUsers(su => su.filter(u => u.id !== userId));
    } catch {
      toast.error('Failed to remove member', { id: toastId });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="p-6 max-w-5xl mx-auto space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-wide">Knowledge Spaces</h1>
          <p className="text-slate-400 text-sm mt-1">{spaces.length} logical knowledge spaces configured</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="btn-primary flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl shadow-lg shadow-indigo-500/20"
        >
          <Plus className="w-4 h-4" /> New Space
        </button>
      </div>

      {/* Create inline */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="card border-indigo-500/40 bg-[#151d35]/60 flex gap-3 shadow-xl overflow-hidden"
          >
            <input
              className="input flex-1 bg-[#0f1629] border-slate-700 text-sm"
              placeholder="Enter space name..."
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createSpace()}
              autoFocus
            />
            <button
              onClick={createSpace}
              disabled={creating}
              className="btn-primary flex items-center gap-1.5 text-xs px-4 rounded-xl shadow-md"
            >
              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Create
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="btn-ghost px-3 rounded-xl border border-slate-700/60 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Spaces grid */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-indigo-400" /></div>
      ) : spaces.length === 0 ? (
        <div className="text-center py-16 text-slate-500 text-sm">No spaces created yet. Click "New Space" above to get started.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {spaces.map(space => (
              <motion.div
                key={space.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                whileHover={{ y: -2 }}
                className="card card-hover flex flex-col gap-3 border-slate-800/80 bg-[#0f1629] shadow-xl"
              >
                {editId === space.id ? (
                  <div className="flex gap-2">
                    <input
                      className="input flex-1 text-sm bg-[#151d35] border-slate-700"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      autoFocus
                      onKeyDown={e => e.key === 'Enter' && renameSpace(space.id)}
                    />
                    <button onClick={() => renameSpace(space.id)} className="text-emerald-400 hover:text-emerald-300 p-1.5"><Check className="w-4 h-4" /></button>
                    <button onClick={() => setEditId(null)} className="text-slate-500 hover:text-slate-300 p-1.5"><X className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-indigo-600/15 border border-indigo-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Building2 className="w-4 h-4 text-indigo-400" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-white text-base tracking-tight">{space.name}</h3>
                        {space.description && <p className="text-xs text-slate-500 mt-0.5">{space.description}</p>}
                      </div>
                    </div>
                    <button
                      onClick={() => { setEditId(space.id); setEditName(space.name); }}
                      className="text-slate-500 hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-800/60 transition"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                <div className="flex gap-2.5 mt-auto pt-2 border-t border-slate-800/60">
                  <button
                    onClick={() => openAssign(space)}
                    className="flex-1 flex items-center justify-center gap-1.5 text-xs btn-ghost border border-slate-700/80 py-2 rounded-xl hover:border-indigo-500/50 hover:text-indigo-300 transition"
                  >
                    <Users className="w-3.5 h-3.5 text-indigo-400" /> Manage Members
                  </button>
                  <button
                    onClick={() => deleteSpace(space.id, space.name)}
                    className="btn-danger p-2 rounded-xl hover:bg-red-500/20 hover:text-red-400 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Premium Animated Members Modal */}
      <AnimatePresence>
        {assignModal && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 15 }}
              transition={{ type: 'spring', stiffness: 350, damping: 25 }}
              className="card w-full max-w-md border border-slate-700/80 bg-[#0f1629]/95 backdrop-blur-2xl shadow-2xl p-6 rounded-2xl"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-800/80">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center shadow-md">
                    <Users className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div>
                    <h2 className="font-bold text-white text-base tracking-tight">{assignModal.name}</h2>
                    <p className="text-[11px] text-slate-400 font-medium">Manage Member Access</p>
                  </div>
                </div>
                <button
                  onClick={() => setAssignModal(null)}
                  className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800/60 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Add Member Dropdown & Button */}
              <div className="flex gap-2.5 mb-5">
                <select
                  className="input flex-1 text-xs bg-[#151d35] border-slate-700/80 text-slate-200 focus:border-indigo-500 rounded-xl"
                  value={selectedUser}
                  onChange={e => setSelectedUser(e.target.value)}
                >
                  <option value="">Select user to add to space...</option>
                  {users.filter(u => !spaceUsers.find(su => su.id === u.id)).map(u => (
                    <option key={u.id} value={u.id}>{u.email} ({u.role})</option>
                  ))}
                </select>
                <button
                  onClick={assignUser}
                  disabled={!selectedUser}
                  className="btn-primary text-xs px-3.5 py-2.5 rounded-xl shadow-lg shadow-indigo-500/20 disabled:opacity-40"
                >
                  <UserPlus className="w-4 h-4" />
                </button>
              </div>

              {/* Current Members List */}
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {spaceUsers.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 text-xs bg-[#151d35]/40 rounded-xl border border-slate-800/50">
                    No members assigned to this space yet
                  </div>
                ) : (
                  spaceUsers.map(u => (
                    <div
                      key={u.id}
                      className="flex items-center justify-between px-3.5 py-2.5 bg-[#151d35]/90 border border-slate-800/80 rounded-xl hover:border-slate-700/80 transition"
                    >
                      <div>
                        <p className="text-xs font-semibold text-white">{u.email}</p>
                        <span className="text-[10px] text-indigo-400 capitalize font-medium">{u.role}</span>
                      </div>
                      <button
                        onClick={() => removeUser(u.id)}
                        className="text-slate-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/10 transition"
                        title="Remove from space"
                      >
                        <UserMinus className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
