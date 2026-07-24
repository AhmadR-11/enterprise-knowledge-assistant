'use client';
import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Trash2, RefreshCw, Loader2, FileText, AlertCircle, CheckCircle, ShieldAlert, Pencil, Tag, X, Check, Filter } from 'lucide-react';
import api from '@/lib/api';
import { Document, Space } from '@/types';
import { useAuthStore } from '@/lib/store';
import { toast } from 'sonner';

function StatusBadge({ status }: { status: Document['status'] }) {
  const map = {
    ready:      'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    processing: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    failed:     'bg-red-500/20 text-red-300 border-red-500/30',
    pending:    'bg-slate-500/20 text-slate-300 border-slate-700',
  };
  return (
    <span className={`badge border text-[11px] px-2 py-0.5 rounded-md font-medium uppercase tracking-wider ${map[status]}`}>
      {status}
    </span>
  );
}

export default function DocumentsPage() {
  const currentUser = useAuthStore((s) => s.user);
  const [docs, setDocs]               = useState<Document[]>([]);
  const [spaces, setSpaces]           = useState<Space[]>([]);
  const [loading, setLoading]         = useState(true);
  const [uploading, setUploading]     = useState(false);
  const [spaceId, setSpaceId]         = useState('');
  const [file, setFile]               = useState<File | null>(null);
  const [drag, setDrag]               = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ready' | 'processing' | 'failed' | 'pending'>('all');
  const fileRef = useRef<HTMLInputElement>(null);

  // Metadata Edit Modal State (FR-2.3)
  const [editDoc, setEditDoc]           = useState<Document | null>(null);
  const [editTitle, setEditTitle]       = useState('');
  const [editDesc, setEditDesc]         = useState('');
  const [editTags, setEditTags]         = useState('');
  const [savingMeta, setSavingMeta]     = useState(false);

  const fetchDocs = () => {
    setLoading(true);
    api.get('/documents')
      .then(r => setDocs(r.data.data.documents))
      .catch(() => toast.error('Failed to load documents'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDocs();
    api.get('/spaces/my').then(r => {
      const fetchedSpaces = r.data.data.spaces;
      setSpaces(fetchedSpaces);
      if (fetchedSpaces.length === 1) {
        setSpaceId(String(fetchedSpaces[0].id));
      }
    }).catch(() => {});
  }, []);

  const uploadFile = async () => {
    if (!file || !spaceId) {
      setUploadError('Please select both a file and an assigned space');
      toast.error('File and Space selection required');
      return;
    }
    setUploading(true);
    setUploadError('');
    const toastId = toast.loading('Uploading & embedding document...');
    const form = new FormData();
    form.append('file', file);
    form.append('spaceId', spaceId);
    try {
      await api.post('/documents', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Document uploaded and embedded successfully', { id: toastId });
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      fetchDocs();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      const msg = err.response?.data?.message || 'Upload failed';
      setUploadError(msg);
      toast.error(msg, { id: toastId });
    } finally {
      setUploading(false);
    }
  };

  const deleteDoc = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return;
    const toastId = toast.loading('Deleting document...');
    try {
      await api.delete(`/documents/${id}`);
      toast.success('Document deleted', { id: toastId });
      fetchDocs();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Failed to delete document', { id: toastId });
    }
  };

  const reprocess = async (id: string, name: string) => {
    const toastId = toast.loading(`Re-embedding "${name}"...`);
    try {
      await api.post(`/documents/${id}/reprocess`);
      toast.success('Re-embedding complete', { id: toastId });
      fetchDocs();
    } catch {
      toast.error('Failed to re-embed document', { id: toastId });
    }
  };

  // Open Edit Metadata Modal (FR-2.3)
  const openEditModal = (doc: Document) => {
    setEditDoc(doc);
    setEditTitle(doc.title || doc.originalName);
    setEditDesc(doc.description || '');
    setEditTags(doc.tags ? doc.tags.join(', ') : '');
  };

  // Save Document Metadata (FR-2.3)
  const saveMetadata = async () => {
    if (!editDoc) return;
    setSavingMeta(true);
    const toastId = toast.loading('Updating document metadata...');
    try {
      await api.patch(`/documents/${editDoc._id}`, {
        title: editTitle,
        description: editDesc,
        tags: editTags
      });
      toast.success('Metadata updated successfully', { id: toastId });
      setEditDoc(null);
      fetchDocs();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Failed to update metadata', { id: toastId });
    } finally {
      setSavingMeta(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f) {
      setFile(f);
      toast.info(`Selected file: ${f.name}`);
    }
  };

  const canUpload = currentUser?.role === 'admin' || currentUser?.role === 'editor';

  const filteredDocs = docs.filter(d => statusFilter === 'all' || d.status === statusFilter);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="p-6 max-w-5xl mx-auto space-y-6"
    >
      <div>
        <h1 className="text-2xl font-bold text-white tracking-wide">Documents</h1>
        <p className="text-slate-400 text-sm mt-1">
          {docs.length} documents indexed across your assigned knowledge space(s)
        </p>
      </div>

      {/* Upload Zone (FR-2.1: Editor uploads only into assigned spaces) */}
      {canUpload ? (
        <motion.div
          whileHover={{ scale: 1.002 }}
          className="card border-dashed border-2 border-slate-700/80 hover:border-indigo-500/60 transition-colors shadow-lg"
        >
          <div
            onDragOver={e => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
            className={`flex flex-col items-center justify-center py-8 gap-3 rounded-xl transition-all cursor-pointer ${drag ? 'bg-indigo-600/10 border-indigo-500' : 'bg-[#151d35]/30'}`}
            onClick={() => fileRef.current?.click()}
          >
            <div className="w-12 h-12 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center shadow-md">
              <Upload className="w-5 h-5 text-indigo-400" />
            </div>
            <div className="text-center">
              <p className="text-white font-medium text-sm">
                {file ? (
                  <span className="text-indigo-400 flex items-center gap-1.5 justify-center">
                    <CheckCircle className="w-4 h-4 text-emerald-400" /> {file.name}
                  </span>
                ) : (
                  'Drag & drop or click to upload file'
                )}
              </p>
              <p className="text-slate-500 text-xs mt-1">PDF, DOCX, TXT, MD — max 20MB</p>
            </div>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept=".pdf,.docx,.txt,.md"
              onChange={e => {
                const selected = e.target.files?.[0] || null;
                setFile(selected);
                if (selected) toast.info(`Selected file: ${selected.name}`);
              }}
            />
          </div>

          <div className="flex gap-3 mt-4">
            <select
              className="input flex-1 bg-[#151d35] border-slate-700/70 text-slate-200"
              value={spaceId}
              onChange={e => setSpaceId(e.target.value)}
            >
              <option value="">Select Assigned Space...</option>
              {spaces.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button
              onClick={uploadFile}
              disabled={uploading || !file || !spaceId}
              className="btn-primary flex items-center gap-2 text-sm whitespace-nowrap px-5 py-2.5 rounded-xl shadow-lg shadow-indigo-500/20 disabled:opacity-50"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {uploading ? 'Processing...' : 'Upload File'}
            </button>
          </div>

          {spaces.length === 0 && (
            <div className="mt-3 flex items-center gap-2 text-amber-400 text-xs bg-amber-500/10 border border-amber-500/20 rounded-xl px-3.5 py-2.5">
              <ShieldAlert className="w-4 h-4 flex-shrink-0" />
              You are not assigned to any space yet. Please contact an Administrator to assign you to a space.
            </div>
          )}

          {uploadError && (
            <div className="mt-3 flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {uploadError}
            </div>
          )}
        </motion.div>
      ) : (
        <div className="card bg-slate-800/20 border-slate-800 text-slate-400 text-xs flex items-center gap-2 py-3 px-4 rounded-xl">
          <ShieldAlert className="w-4 h-4 text-amber-400 flex-shrink-0" />
          Viewers have read-only access and cannot upload or delete documents.
        </div>
      )}

      {/* Filter Tabs by Upload Status (FR-2.6) */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-1.5 p-1 bg-[#151d35]/80 border border-slate-800 rounded-xl text-xs">
          {(['all', 'ready', 'processing', 'failed', 'pending'] as const).map(st => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg capitalize font-medium transition-colors ${
                statusFilter === st
                  ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
        <div className="text-slate-500 text-xs flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5" /> Showing {filteredDocs.length} of {docs.length}
        </div>
      </div>

      {/* Documents Table (FR-2.6: Status, Chunks, Uploader, Edit Metadata & Personal Delete) */}
      <div className="card p-0 overflow-hidden shadow-xl">
        <table className="w-full">
          <thead className="bg-[#0a0f1e]/80 border-b border-slate-800">
            <tr>
              <th className="th py-3.5 px-4 text-xs font-semibold text-slate-400">Document</th>
              <th className="th py-3.5 px-4 text-xs font-semibold text-slate-400">Status</th>
              <th className="th py-3.5 px-4 text-xs font-semibold text-slate-400">Chunks</th>
              <th className="th py-3.5 px-4 text-xs font-semibold text-slate-400">Owner</th>
              <th className="th py-3.5 px-4 text-xs font-semibold text-slate-400">Uploaded</th>
              <th className="th py-3.5 px-4 text-xs font-semibold text-slate-400">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {loading ? (
              <tr><td colSpan={6} className="td text-center py-12">
                <Loader2 className="w-5 h-5 animate-spin mx-auto text-indigo-400" />
              </td></tr>
            ) : filteredDocs.length === 0 ? (
              <tr><td colSpan={6} className="td text-center py-12 text-slate-500 text-sm">No documents match the selected status</td></tr>
            ) : (
              <AnimatePresence>
                {filteredDocs.map(doc => {
                  const isOwner = doc.uploadedBy === currentUser?.id;
                  const canEditMeta = currentUser?.role === 'admin' || isOwner;
                  const canDelete = currentUser?.role === 'admin' || isOwner;

                  return (
                    <motion.tr
                      key={doc._id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="table-row hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="td py-3 px-4">
                        <div className="flex items-start gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-slate-800/80 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <FileText className="w-3.5 h-3.5 text-indigo-400" />
                          </div>
                          <div>
                            <p className="text-white text-sm font-medium truncate max-w-[220px]">
                              {doc.title || doc.originalName}
                            </p>
                            {doc.title && (
                              <p className="text-[11px] text-slate-500 truncate max-w-[220px]">{doc.originalName}</p>
                            )}
                            {doc.description && (
                              <p className="text-[11px] text-slate-400 mt-0.5 truncate max-w-[240px] italic">
                                {doc.description}
                              </p>
                            )}
                            {doc.tags && doc.tags.length > 0 && (
                              <div className="flex gap-1 mt-1 flex-wrap">
                                {doc.tags.map((t, idx) => (
                                  <span key={idx} className="inline-flex items-center gap-1 text-[10px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-1.5 py-0.5 rounded-md">
                                    <Tag className="w-2.5 h-2.5" /> {t}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="td py-3 px-4"><StatusBadge status={doc.status} /></td>
                      <td className="td py-3 px-4 text-slate-400 text-xs font-mono">{doc.chunkCount || '—'}</td>
                      <td className="td py-3 px-4">
                        {isOwner ? (
                          <span className="text-[11px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-md font-medium">
                            You
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 font-mono">User #{doc.uploadedBy}</span>
                        )}
                      </td>
                      <td className="td py-3 px-4 text-slate-500 text-xs whitespace-nowrap">
                        {new Date(doc.createdAt).toLocaleDateString()}
                      </td>
                      <td className="td py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          {/* FR-2.3 Edit Metadata */}
                          {canEditMeta && (
                            <button
                              onClick={() => openEditModal(doc)}
                              className="btn-ghost p-1.5 rounded-lg border border-slate-700/80 hover:border-indigo-500/50 hover:text-indigo-300 transition"
                              title="Edit metadata (Title, Tags, Description)"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Admin Re-embed */}
                          {currentUser?.role === 'admin' && (
                            <button
                              onClick={() => reprocess(doc._id, doc.originalName)}
                              className="btn-ghost p-1.5 rounded-lg border border-slate-700/80 hover:border-indigo-500/50 hover:text-indigo-300 transition"
                              title="Re-embed document"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* FR-2.4 Delete Document */}
                          {canDelete ? (
                            <button
                              onClick={() => deleteDoc(doc._id, doc.title || doc.originalName)}
                              className="btn-danger p-1.5 rounded-lg hover:bg-red-500/20 hover:text-red-400 transition"
                              title="Delete document"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-600 italic">No access</span>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            )}
          </tbody>
        </table>
      </div>

      {/* FR-2.3 Edit Metadata Modal */}
      <AnimatePresence>
        {editDoc && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: 'spring', stiffness: 350, damping: 25 }}
              className="card w-full max-w-md border border-slate-700/80 bg-[#0f1629]/95 backdrop-blur-2xl shadow-2xl p-6 rounded-2xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
                    <Pencil className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div>
                    <h2 className="font-bold text-white text-sm">Edit Document Metadata</h2>
                    <p className="text-[11px] text-slate-400">{editDoc.originalName}</p>
                  </div>
                </div>
                <button onClick={() => setEditDoc(null)} className="text-slate-400 hover:text-white p-1 rounded-lg">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="label text-xs font-semibold text-slate-300 mb-1">Display Title</label>
                  <input
                    className="input bg-[#151d35] border-slate-700/80 text-sm focus:border-indigo-500"
                    placeholder="Enter document title..."
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                  />
                </div>

                <div>
                  <label className="label text-xs font-semibold text-slate-300 mb-1">Description</label>
                  <textarea
                    className="input bg-[#151d35] border-slate-700/80 text-sm focus:border-indigo-500 min-h-[70px] resize-none"
                    placeholder="Enter brief document description..."
                    value={editDesc}
                    onChange={e => setEditDesc(e.target.value)}
                  />
                </div>

                <div>
                  <label className="label text-xs font-semibold text-slate-300 mb-1">Tags (Comma-separated)</label>
                  <input
                    className="input bg-[#151d35] border-slate-700/80 text-sm focus:border-indigo-500"
                    placeholder="e.g. policy, HR, 2026"
                    value={editTags}
                    onChange={e => setEditTags(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2 border-t border-slate-800">
                <button
                  onClick={saveMetadata}
                  disabled={savingMeta}
                  className="btn-primary flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs rounded-xl shadow-lg shadow-indigo-500/20"
                >
                  {savingMeta ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Save Changes
                </button>
                <button
                  onClick={() => setEditDoc(null)}
                  className="btn-ghost px-4 py-2.5 text-xs rounded-xl border border-slate-700/80 text-slate-300"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
