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

  useEffect(() => {
    if (!assignModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAssignModal(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [assignModal]);

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
      await api.post('/spaces/assign', { userId: Number(selectedUser), spaceId: assignModal.id });
      toast.success('Member added to space', { id: toastId });
      const r = await api.get(`/spaces/${assignModal.id}/users`);
      setSpaceUsers(r.data.data.users);
      setSelectedUser('');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Failed to add member', { id: toastId });
    }
  };

  const removeUser = async (userId: number) => {
    if (!assignModal) return;
    const toastId = toast.loading('Removing member from space...');
    try {
      await api.delete('/spaces/assign', { data: { userId, spaceId: assignModal.id } });
      toast.success('Member removed', { id: toastId });
      setSpaceUsers(su => su.filter(u => u.id !== userId));
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Failed to remove member', { id: toastId });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="p-6 max-w-5xl mx-auto space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold text-text-primary tracking-tight">Knowledge Spaces</h1>
          <p className="text-text-muted text-xs mt-1">
            <span className="font-mono tabular-nums">{spaces.length}</span> logical knowledge spaces configured
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="btn-primary flex items-center gap-1.5 text-xs px-3.5 py-2 min-h-[36px] active:bg-accent-fill/90 disabled:opacity-50"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>New Space</span>
        </button>
      </div>

      {/* Inline Create Row */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="card border border-border-strong bg-surface-2 flex gap-2.5 shadow-subtle p-3 rounded-card overflow-hidden"
          >
            <input
              className="input flex-1 text-xs"
              placeholder="Enter space name..."
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createSpace()}
              autoFocus
            />
            <button
              type="button"
              onClick={createSpace}
              disabled={creating}
              className="btn-primary flex items-center gap-1.5 text-xs px-3.5 min-h-[36px]"
            >
              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none" /> : <Check className="w-3.5 h-3.5" />}
              <span>Create</span>
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="btn-ghost px-2.5 border border-border text-text-muted hover:text-text-primary min-h-[36px]"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Spaces Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="card border border-border bg-surface-1 shadow-subtle p-4 flex flex-col justify-between gap-3 animate-pulse motion-reduce:animate-none">
              <div className="flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-control bg-surface-2" />
                <div className="space-y-1.5 flex-1">
                  <div className="h-3.5 w-24 bg-surface-2 rounded" />
                  <div className="h-2.5 w-36 bg-surface-2 rounded" />
                </div>
              </div>
              <div className="flex gap-2 pt-2 border-t border-border mt-auto">
                <div className="h-7 bg-surface-2 rounded-control flex-1" />
                <div className="h-7 w-7 bg-surface-2 rounded-control" />
              </div>
            </div>
          ))}
        </div>
      ) : spaces.length === 0 ? (
        <div className="text-center py-16 text-text-muted text-xs">No spaces created yet. Click “New Space” above to get started.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          <AnimatePresence>
            {spaces.map(space => (
              <motion.div
                key={space.id}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                whileHover={{ y: -2 }}
                className="card card-hover flex flex-col justify-between gap-3 border border-border bg-surface-1 shadow-subtle p-4"
              >
                {editId === space.id ? (
                  <div className="flex gap-1.5">
                    <input
                      className="input flex-1 text-xs"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      autoFocus
                      onKeyDown={e => e.key === 'Enter' && renameSpace(space.id)}
                    />
                    <button type="button" onClick={() => renameSpace(space.id)} className="text-accent hover:brightness-110 p-1.5"><Check className="w-4 h-4" /></button>
                    <button type="button" onClick={() => setEditId(null)} className="text-text-muted hover:text-text-primary p-1.5"><X className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5">
                      <div className="w-7 h-7 rounded-control bg-surface-2 border border-border flex items-center justify-center flex-shrink-0 mt-0.5 text-text-muted">
                        <Building2 className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-text-primary text-xs tracking-tight">{space.name}</h3>
                        {space.description && <p className="text-[11px] text-text-muted mt-0.5 line-clamp-2">{space.description}</p>}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setEditId(space.id); setEditName(space.name); }}
                      className="text-text-muted hover:text-text-primary p-1 rounded-control hover:bg-surface-2 transition"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  </div>
                )}

                <div className="flex gap-2 pt-2 border-t border-border mt-auto">
                  <button
                    type="button"
                    onClick={() => openAssign(space)}
                    className="flex-1 flex items-center justify-center gap-1.5 text-xs btn-ghost border border-border py-1.5 rounded-control text-text-secondary hover:text-text-primary"
                  >
                    <Users className="w-3.5 h-3.5 text-text-muted" />
                    <span>Manage Members</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteSpace(space.id, space.name)}
                    className="btn-danger p-1.5 rounded-control"
                    title="Delete space"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Members Modal */}
      <AnimatePresence>
        {assignModal && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="assign-modal-title"
            onClick={(e) => { if (e.target === e.currentTarget) setAssignModal(null); }}
            className="fixed inset-0 bg-surface-overlay backdrop-blur-sm flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ duration: 0.15 }}
              className="card w-full max-w-md border border-border-strong bg-surface-1 shadow-md p-5 rounded-card"
            >
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-control bg-surface-2 border border-border flex items-center justify-center text-accent">
                    <Users className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h2 id="assign-modal-title" className="font-semibold text-text-primary text-xs tracking-tight">{assignModal.name}</h2>
                    <p className="text-[11px] text-text-muted">Manage member access</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAssignModal(null)}
                  className="text-text-muted hover:text-text-primary p-1 rounded-control min-h-[36px] min-w-[36px] flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Add Member Dropdown & Button */}
              <div className="flex gap-2 mb-4">
                <select
                  className="input flex-1 text-xs"
                  value={selectedUser}
                  onChange={e => setSelectedUser(e.target.value)}
                >
                  <option value="">Select user to add to space…</option>
                  {users.filter(u => !spaceUsers.find(su => su.id === u.id)).map(u => (
                    <option key={u.id} value={u.id}>{u.email} ({u.role})</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={assignUser}
                  disabled={!selectedUser}
                  className="btn-primary text-xs px-3 py-2 disabled:opacity-40"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Current Members List */}
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {spaceUsers.length === 0 ? (
                  <div className="text-center py-8 text-text-muted text-xs bg-surface-2/40 rounded-control border border-border">
                    No members assigned to this space yet
                  </div>
                ) : (
                  spaceUsers.map(u => (
                    <div
                      key={u.id}
                      className="flex items-center justify-between px-3 py-2 bg-surface-2 border border-border rounded-control hover:border-border-strong transition"
                    >
                      <div>
                        <p className="text-xs font-medium text-text-primary">{u.email}</p>
                        <span className="text-[10px] text-text-muted capitalize">{u.role}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeUser(u.id)}
                        className="text-text-muted hover:text-danger p-1 rounded-control transition"
                        title="Remove from space"
                      >
                        <UserMinus className="w-3.5 h-3.5" />
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
