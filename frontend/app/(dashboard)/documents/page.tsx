'use client';
import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Trash2, RefreshCw, Loader2, FileText, AlertCircle, CheckCircle } from 'lucide-react';
import api from '@/lib/api';
import { Document, Space } from '@/types';
import { toast } from 'sonner';

function StatusBadge({ status }: { status: Document['status'] }) {
  const map = {
    ready:      'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    processing: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    failed:     'bg-red-500/20 text-red-300 border-red-500/30',
    pending:    'bg-slate-500/20 text-slate-300 border-slate-700',
  };
  return (
    <span className={`badge border text-[11px] px-2 py-0.5 rounded-md ${map[status]}`}>{status}</span>
  );
}

export default function DocumentsPage() {
  const [docs, setDocs]         = useState<Document[]>([]);
  const [spaces, setSpaces]     = useState<Space[]>([]);
  const [loading, setLoading]   = useState(true);
  const [uploading, setUploading] = useState(false);
  const [spaceId, setSpaceId]   = useState('');
  const [file, setFile]         = useState<File | null>(null);
  const [drag, setDrag]         = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchDocs = () => {
    setLoading(true);
    api.get('/documents')
      .then(r => setDocs(r.data.data.documents))
      .catch(() => toast.error('Failed to load documents'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDocs();
    api.get('/spaces/my').then(r => setSpaces(r.data.data.spaces)).catch(() => {});
  }, []);

  const uploadFile = async () => {
    if (!file || !spaceId) {
      setUploadError('Please select both a file and a space');
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
    } catch {
      toast.error('Failed to delete document', { id: toastId });
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

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f) {
      setFile(f);
      toast.info(`Selected file: ${f.name}`);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="p-6 max-w-5xl mx-auto space-y-6"
    >
      <div>
        <h1 className="text-2xl font-bold text-white tracking-wide">Documents</h1>
        <p className="text-slate-400 text-sm mt-1">{docs.length} documents indexed in knowledge base</p>
      </div>

      {/* Upload Zone */}
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
          <select className="input flex-1 bg-[#151d35] border-slate-700/70 text-slate-200" value={spaceId} onChange={e => setSpaceId(e.target.value)}>
            <option value="">Select Target Space...</option>
            {spaces.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button
            onClick={uploadFile}
            disabled={uploading || !file}
            className="btn-primary flex items-center gap-2 text-sm whitespace-nowrap px-5 py-2.5 rounded-xl shadow-lg shadow-indigo-500/20 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? 'Processing...' : 'Upload File'}
          </button>
        </div>
        {uploadError && (
          <div className="mt-3 flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {uploadError}
          </div>
        )}
      </motion.div>

      {/* Documents Table */}
      <div className="card p-0 overflow-hidden shadow-xl">
        <table className="w-full">
          <thead className="bg-[#0a0f1e]/80 border-b border-slate-800">
            <tr>
              <th className="th py-3.5 px-4 text-xs font-semibold text-slate-400">Document Name</th>
              <th className="th py-3.5 px-4 text-xs font-semibold text-slate-400">Status</th>
              <th className="th py-3.5 px-4 text-xs font-semibold text-slate-400">Chunks</th>
              <th className="th py-3.5 px-4 text-xs font-semibold text-slate-400">Uploaded</th>
              <th className="th py-3.5 px-4 text-xs font-semibold text-slate-400">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {loading ? (
              <tr><td colSpan={5} className="td text-center py-12">
                <Loader2 className="w-5 h-5 animate-spin mx-auto text-indigo-400" />
              </td></tr>
            ) : docs.length === 0 ? (
              <tr><td colSpan={5} className="td text-center py-12 text-slate-500 text-sm">No documents uploaded yet</td></tr>
            ) : (
              <AnimatePresence>
                {docs.map(doc => (
                  <motion.tr
                    key={doc._id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="table-row hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="td py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-slate-800/80 flex items-center justify-center flex-shrink-0">
                          <FileText className="w-3.5 h-3.5 text-indigo-400" />
                        </div>
                        <span className="text-white text-sm font-medium truncate max-w-[220px]">{doc.originalName}</span>
                      </div>
                    </td>
                    <td className="td py-3 px-4"><StatusBadge status={doc.status} /></td>
                    <td className="td py-3 px-4 text-slate-400 text-xs font-mono">{doc.chunkCount || '—'}</td>
                    <td className="td py-3 px-4 text-slate-500 text-xs whitespace-nowrap">
                      {new Date(doc.createdAt).toLocaleDateString()}
                    </td>
                    <td className="td py-3 px-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => reprocess(doc._id, doc.originalName)}
                          className="btn-ghost text-xs flex items-center gap-1.5 border border-slate-700/80 py-1 px-2.5 rounded-lg hover:border-indigo-500/50 hover:text-indigo-300 transition"
                        >
                          <RefreshCw className="w-3 h-3" /> Re-embed
                        </button>
                        <button
                          onClick={() => deleteDoc(doc._id, doc.originalName)}
                          className="btn-danger p-1.5 rounded-lg hover:bg-red-500/20 hover:text-red-400 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            )}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
