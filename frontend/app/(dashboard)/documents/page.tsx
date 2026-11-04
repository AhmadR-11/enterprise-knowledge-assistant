'use client';
import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Trash2, RefreshCw, Loader2, FileText, AlertCircle, CheckCircle, ShieldAlert, Pencil, Tag, X, Check, Filter } from 'lucide-react';
import api from '@/lib/api';
import { Document, Space } from '@/types';
import { useAuthStore } from '@/lib/store';
import { toast } from 'sonner';

function StatusBadge({ status }: { status: Document['status'] }) {
  const map: Record<string, string> = {
    ready:      'badge-ready',
    processing: 'badge-processing',
    failed:     'badge-failed',
    pending:    'badge-pending',
  };
  return (
    <span className={`badge ${map[status] || 'badge-pending'} text-[10px] font-mono px-2 py-0.5 rounded-control uppercase tracking-wider`}>
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

  const openEditModal = (doc: Document) => {
    setEditDoc(doc);
    setEditTitle(doc.title || doc.originalName);
    setEditDesc(doc.description || '');
    setEditTags(doc.tags ? doc.tags.join(', ') : '');
  };

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
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="p-6 max-w-5xl mx-auto space-y-6"
    >
      <div>
        <h1 className="text-xl font-semibold text-text-primary tracking-tight">Documents</h1>
        <p className="text-text-muted text-xs mt-0.5">
          <span className="font-mono tabular-nums">{docs.length}</span> documents indexed across your assigned knowledge space(s)
        </p>
      </div>

      {/* Upload Zone */}
      {canUpload ? (
        <div className="card border-dashed border border-border hover:border-border-strong bg-surface-1/40 hover:bg-surface-1/70 transition-all rounded-card shadow-subtle p-5">
          <div
            onDragOver={e => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
            className={`flex flex-col items-center justify-center py-6 gap-2.5 rounded-control transition-all cursor-pointer ${drag ? 'bg-surface-2 border border-accent-border' : 'bg-surface-2/40'}`}
            onClick={() => fileRef.current?.click()}
          >
            <div className="w-10 h-10 rounded-control bg-surface-2 border border-border flex items-center justify-center text-accent shadow-subtle">
              <Upload className="w-4 h-4" />
            </div>
            <div className="text-center">
              <p className="text-text-primary font-medium text-xs">
                {file ? (
                  <span className="text-accent flex items-center gap-1.5 justify-center font-medium">
                    <CheckCircle className="w-3.5 h-3.5 text-success" /> {file.name}
                  </span>
                ) : (
                  'Drag & drop or click to upload file'
                )}
              </p>
              <p className="text-text-muted text-[11px] mt-0.5">PDF, DOCX, TXT, MD — max 20MB</p>
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

          <div className="flex gap-2.5 mt-3.5">
            <select
              className="input flex-1 bg-surface-2 border-border text-text-primary text-xs"
              value={spaceId}
              onChange={e => setSpaceId(e.target.value)}
            >
              <option value="">Select Assigned Space...</option>
              {spaces.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button
              type="button"
              onClick={uploadFile}
              disabled={uploading || !file || !spaceId}
              className="btn-primary text-xs whitespace-nowrap px-4 py-2"
            >
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Upload className="w-3.5 h-3.5 mr-1.5" />}
              {uploading ? 'Processing...' : 'Upload File'}
            </button>
          </div>

          {spaces.length === 0 && (
            <div className="mt-3 flex items-center gap-2 text-warning text-xs bg-warning/10 border border-warning/20 rounded-control px-3 py-2">
              <ShieldAlert className="w-4 h-4 flex-shrink-0" />
              <span>You are not assigned to any space yet. Contact an Administrator to assign you to a space.</span>
            </div>
          )}

          {uploadError && (
            <div className="mt-3 flex items-center gap-2 text-danger text-xs bg-danger/10 border border-danger/20 rounded-control px-3 py-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="card bg-surface-1 border-border text-text-muted text-xs flex items-center gap-2 py-3 px-4 rounded-card">
          <ShieldAlert className="w-4 h-4 text-warning flex-shrink-0" />
          <span>Viewers have read-only access and cannot upload or delete documents.</span>
        </div>
      )}

      {/* Filter Tabs by Upload Status */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1 p-0.5 bg-surface-2 border border-border rounded-control text-xs">
          {(['all', 'ready', 'processing', 'failed', 'pending'] as const).map(st => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-2.5 py-1 rounded-[6px] capitalize font-medium text-xs transition-colors ${
                statusFilter === st
                  ? 'bg-surface-3 text-text-primary border border-border-strong shadow-subtle'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
        <div className="text-text-muted text-xs flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5" /> Showing {filteredDocs.length} of {docs.length}
        </div>
      </div>

      {/* Documents Table */}
      <div className="card p-0 overflow-hidden shadow-subtle rounded-card border border-border">
        <table className="w-full">
          <thead className="bg-surface-1 border-b border-border">
            <tr>
              <th className="th py-3 px-4 text-2xs font-semibold text-text-muted">Document</th>
              <th className="th py-3 px-4 text-2xs font-semibold text-text-muted">Status</th>
              <th className="th py-3 px-4 text-2xs font-semibold text-text-muted">Chunks</th>
              <th className="th py-3 px-4 text-2xs font-semibold text-text-muted">Owner</th>
              <th className="th py-3 px-4 text-2xs font-semibold text-text-muted">Uploaded</th>
              <th className="th py-3 px-4 text-2xs font-semibold text-text-muted">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr><td colSpan={6} className="td text-center py-12">
                <Loader2 className="w-5 h-5 animate-spin mx-auto text-accent" />
              </td></tr>
            ) : filteredDocs.length === 0 ? (
              <tr><td colSpan={6} className="td text-center py-12 text-text-muted text-xs">No documents match the selected status</td></tr>
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
                      className="table-row hover:bg-surface-2 transition-colors"
                    >
                      <td className="td py-3 px-4">
                        <div className="flex items-start gap-2.5">
                          <div className="w-7 h-7 rounded-control bg-surface-2 border border-border flex items-center justify-center flex-shrink-0 mt-0.5 text-text-muted">
                            <FileText className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <p className="text-text-primary text-xs font-medium truncate max-w-[220px]">
                              {doc.title || doc.originalName}
                            </p>
                            {doc.title && (
                              <p className="text-[11px] text-text-muted truncate max-w-[220px]">{doc.originalName}</p>
                            )}
                            {doc.description && (
                              <p className="text-[11px] text-text-muted mt-0.5 truncate max-w-[240px] italic">
                                {doc.description}
                              </p>
                            )}
                            {doc.tags && doc.tags.length > 0 && (
                              <div className="flex gap-1 mt-1 flex-wrap">
                                {doc.tags.map((t, idx) => (
                                  <span key={idx} className="inline-flex items-center gap-1 text-[10px] bg-surface-2 text-text-secondary border border-border px-1.5 py-0.5 rounded-control">
                                    <Tag className="w-2.5 h-2.5" /> {t}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="td py-3 px-4"><StatusBadge status={doc.status} /></td>
                      <td className="td py-3 px-4 text-text-muted text-xs font-mono tabular-nums">{doc.chunkCount || '—'}</td>
                      <td className="td py-3 px-4">
                        {isOwner ? (
                          <span className="badge badge-editor text-[10px] py-0 px-1.5">
                            You
                          </span>
                        ) : (
                          <span className="text-xs text-text-muted font-mono tabular-nums">User #{doc.uploadedBy}</span>
                        )}
                      </td>
                      <td className="td py-3 px-4 text-text-muted text-xs whitespace-nowrap font-mono tabular-nums">
                        {new Date(doc.createdAt).toLocaleDateString()}
                      </td>
                      <td className="td py-3 px-4">
                        <div className="flex items-center gap-1">
                          {canEditMeta && (
                            <button
                              type="button"
                              onClick={() => openEditModal(doc)}
                              className="btn-ghost p-1.5 rounded-control border border-border hover:border-border-strong text-text-muted hover:text-text-primary transition"
                              title="Edit metadata"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {currentUser?.role === 'admin' && (
                            <button
                              type="button"
                              onClick={() => reprocess(doc._id, doc.originalName)}
                              className="btn-ghost p-1.5 rounded-control border border-border hover:border-border-strong text-text-muted hover:text-text-primary transition"
                              title="Re-embed document"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canDelete ? (
                            <button
                              type="button"
                              onClick={() => deleteDoc(doc._id, doc.title || doc.originalName)}
                              className="btn-danger p-1.5 rounded-control"
                              title="Delete document"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <span className="text-[11px] text-text-muted italic">Read-only</span>
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

      {/* Edit Metadata Modal */}
      <AnimatePresence>
        {editDoc && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ duration: 0.15 }}
              className="card w-full max-w-md border border-border-strong bg-surface-1 shadow-popover p-5 rounded-card space-y-4"
            >
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-control bg-surface-2 border border-border flex items-center justify-center text-accent">
                    <Pencil className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-text-primary text-xs">Edit Document Metadata</h2>
                    <p className="text-[10px] text-text-muted truncate max-w-[200px]">{editDoc.originalName}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditDoc(null)}
                  className="text-text-muted hover:text-text-primary p-1 rounded-control"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="label">Display Title</label>
                  <input
                    className="input text-xs"
                    placeholder="Enter document title..."
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                  />
                </div>

                <div>
                  <label className="label">Description</label>
                  <textarea
                    className="input text-xs min-h-[70px] resize-none"
                    placeholder="Enter brief document description..."
                    value={editDesc}
                    onChange={e => setEditDesc(e.target.value)}
                  />
                </div>

                <div>
                  <label className="label">Tags (Comma-separated)</label>
                  <input
                    className="input text-xs"
                    placeholder="e.g. policy, HR, architecture"
                    value={editTags}
                    onChange={e => setEditTags(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={saveMetadata}
                  disabled={savingMeta}
                  className="btn-primary flex-1 text-xs py-2"
                >
                  {savingMeta ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
                  Save Changes
                </button>
                <button
                  type="button"
                  onClick={() => setEditDoc(null)}
                  className="btn-ghost px-4 py-2 text-xs border border-border text-text-secondary hover:text-text-primary"
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
