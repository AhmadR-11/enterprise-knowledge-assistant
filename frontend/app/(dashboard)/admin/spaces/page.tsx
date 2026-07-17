'use client';
import { useEffect, useState } from 'react';
import { Plus, Trash2, Pencil, UserPlus, UserMinus, Loader2, Check, X } from 'lucide-react';
import api from '@/lib/api';
import { Space, User } from '@/types';

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
    api.get('/spaces/my').then(r => setSpaces(r.data.data.spaces)).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchSpaces();
    api.get('/users').then(r => setUsers(r.data.data.users)).catch(() => {});
  }, []);

  const createSpace = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    await api.post('/spaces', { name: newName.trim() }).catch(() => {});
    setNewName(''); setShowCreate(false); setCreating(false);
    fetchSpaces();
  };

  const renameSpace = async (id: number) => {
    await api.patch(`/spaces/${id}`, { name: editName }).catch(() => {});
    setEditId(null);
    fetchSpaces();
  };

  const deleteSpace = async (id: number) => {
    if (!confirm('Delete this space? All membership data will be lost.')) return;
    await api.delete(`/spaces/${id}`).catch(() => {});
    fetchSpaces();
  };

  const openAssign = async (space: Space) => {
    setAssignModal(space);
    const r = await api.get(`/spaces/${space.id}/users`).catch(() => ({ data: { data: { users: [] } } }));
    setSpaceUsers(r.data.data.users);
  };

  const assignUser = async () => {
    if (!selectedUser || !assignModal) return;
    await api.post('/spaces/assign', { userId: selectedUser, spaceId: assignModal.id }).catch(() => {});
    const r = await api.get(`/spaces/${assignModal.id}/users`).catch(() => ({ data: { data: { users: [] } } }));
    setSpaceUsers(r.data.data.users);
  };

  const removeUser = async (userId: number) => {
    if (!assignModal) return;
    await api.delete('/spaces/assign', { data: { userId, spaceId: assignModal.id } }).catch(() => {});
    setSpaceUsers(su => su.filter(u => u.id !== userId));
  };

  return (
    <div className="p-6 max-w-5xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Spaces</h1>
          <p className="text-slate-400 text-sm mt-1">{spaces.length} spaces total</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" /> New Space
        </button>
      </div>

      {/* Create inline */}
      {showCreate && (
        <div className="card border-indigo-500/30 mb-4 flex gap-2 animate-slide-up">
          <input className="input flex-1" placeholder="Space name..." value={newName}
            onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && createSpace()} autoFocus />
          <button onClick={createSpace} disabled={creating} className="btn-primary flex items-center gap-1 text-sm px-3">
            {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          </button>
          <button onClick={() => setShowCreate(false)} className="btn-ghost px-2"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Spaces grid */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-indigo-400" /></div>
      ) : spaces.length === 0 ? (
        <div className="text-center py-16 text-slate-500">No spaces yet. Create one above.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {spaces.map(space => (
            <div key={space.id} className="card card-hover flex flex-col gap-3">
              {editId === space.id ? (
                <div className="flex gap-2">
                  <input className="input flex-1 text-sm" value={editName}
                    onChange={e => setEditName(e.target.value)} autoFocus
                    onKeyDown={e => e.key === 'Enter' && renameSpace(space.id)} />
                  <button onClick={() => renameSpace(space.id)} className="text-emerald-400 hover:text-emerald-300 p-1"><Check className="w-4 h-4" /></button>
                  <button onClick={() => setEditId(null)} className="text-slate-500 hover:text-slate-300 p-1"><X className="w-4 h-4" /></button>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-white text-sm">{space.name}</h3>
                    {space.description && <p className="text-xs text-slate-500 mt-0.5">{space.description}</p>}
                  </div>
                  <button onClick={() => { setEditId(space.id); setEditName(space.name); }} className="text-slate-600 hover:text-slate-400 p-1 transition-colors">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              <div className="flex gap-2 mt-auto">
                <button onClick={() => openAssign(space)} className="flex-1 flex items-center justify-center gap-1 text-xs btn-ghost border border-slate-700 py-1.5 rounded-lg">
                  <UserPlus className="w-3 h-3" /> Members
                </button>
                <button onClick={() => deleteSpace(space.id)} className="btn-danger">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Members Modal */}
      {assignModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="card w-full max-w-md mx-4 border-slate-700 animate-slide-up">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-white">{assignModal.name} — Members</h2>
              <button onClick={() => setAssignModal(null)} className="text-slate-500 hover:text-white"><X className="w-4 h-4" /></button>
            </div>

            {/* Assign user */}
            <div className="flex gap-2 mb-4">
              <select className="input flex-1 text-sm" value={selectedUser} onChange={e => setSelectedUser(e.target.value)}>
                <option value="">Select user to add...</option>
                {users.filter(u => !spaceUsers.find(su => su.id === u.id)).map(u => (
                  <option key={u.id} value={u.id}>{u.email} ({u.role})</option>
                ))}
              </select>
              <button onClick={assignUser} className="btn-primary text-sm px-3"><UserPlus className="w-4 h-4" /></button>
            </div>

            {/* Current members */}
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {spaceUsers.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-4">No members yet</p>
              ) : spaceUsers.map(u => (
                <div key={u.id} className="flex items-center justify-between px-3 py-2 bg-[#0a0f1e] rounded-lg">
                  <div>
                    <p className="text-sm text-white">{u.email}</p>
                    <span className={`badge-${u.role} badge text-[10px]`}>{u.role}</span>
                  </div>
                  <button onClick={() => removeUser(u.id)} className="text-slate-600 hover:text-red-400 transition-colors">
                    <UserMinus className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
