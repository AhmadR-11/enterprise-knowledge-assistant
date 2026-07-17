'use client';
import { useEffect, useState, useRef } from 'react';
import { Upload, Trash2, RefreshCw, Loader2, FileText, AlertCircle } from 'lucide-react';
import api from '@/lib/api';
import { Document, Space } from '@/types';

function StatusBadge({ status }: { status: Document['status'] }) {
  const map = {
    ready:      'bg-emerald-500/20 text-emerald-300 border-emerald-500/20',
    processing: 'bg-amber-500/20 text-amber-300 border-amber-500/20',
    failed:     'bg-red-500/20 text-red-300 border-red-500/20',
    pending:    'bg-slate-500/20 text-slate-300 border-slate-500/20',
  };
  return (
    <span className={`badge border ${map[status]}`}>{status}</span>
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
    api.get('/documents').then(r => setDocs(r.data.data.documents)).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDocs();
    api.get('/spaces/my').then(r => setSpaces(r.data.data.spaces)).catch(() => {});
  }, []);

  const uploadFile = async () => {
    if (!file || !spaceId) { setUploadError('Please select a file and a space'); return; }
    setUploading(true); setUploadError('');
    const form = new FormData();
    form.append('file', file);
    form.append('spaceId', spaceId);
    try {
      await api.post('/documents', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setFile(null); if (fileRef.current) fileRef.current.value = '';
      fetchDocs();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setUploadError(err.response?.data?.message || 'Upload failed');
    } finally { setUploading(false); }
  };

  const deleteDoc = async (id: string) => {
    if (!confirm('Delete this document?')) return;
    await api.delete(`/documents/${id}`).catch(() => {});
    fetchDocs();
  };

  const reprocess = async (id: string) => {
    await api.post(`/documents/${id}/reprocess`).catch(() => {});
    fetchDocs();
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Documents</h1>
        <p className="text-slate-400 text-sm mt-1">{docs.length} documents in system</p>
      </div>

      {/* Upload Zone */}
      <div className="card mb-6 border-dashed border-2 border-slate-700 hover:border-indigo-500/50 transition-colors">
        <div
          onDragOver={e => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          className={`flex flex-col items-center justify-center py-8 gap-3 rounded-lg transition-colors cursor-pointer ${drag ? 'bg-indigo-500/5' : ''}`}
          onClick={() => fileRef.current?.click()}
        >
          <div className="w-12 h-12 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
            <Upload className="w-5 h-5 text-indigo-400" />
          </div>
          <div className="text-center">
            <p className="text-white font-medium text-sm">
              {file ? file.name : 'Drag & drop or click to upload'}
            </p>
            <p className="text-slate-500 text-xs mt-1">PDF, DOCX, TXT — max 20MB</p>
          </div>
          <input ref={fileRef} type="file" className="hidden" accept=".pdf,.docx,.txt,.md"
            onChange={e => setFile(e.target.files?.[0] || null)} />
        </div>

        <div className="flex gap-3 mt-4">
          <select className="input flex-1" value={spaceId} onChange={e => setSpaceId(e.target.value)}>
            <option value="">Select space...</option>
            {spaces.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button onClick={uploadFile} disabled={uploading || !file} className="btn-primary flex items-center gap-2 text-sm whitespace-nowrap">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
        </div>
        {uploadError && (
          <div className="mt-3 flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {uploadError}
          </div>
        )}
      </div>

      {/* Documents Table */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full">
          <thead className="bg-[#0a0f1e]/60">
            <tr>
              <th className="th">Name</th>
              <th className="th">Status</th>
              <th className="th">Chunks</th>
              <th className="th">Uploaded</th>
              <th className="th">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="td text-center py-12">
                <Loader2 className="w-5 h-5 animate-spin mx-auto text-indigo-400" />
              </td></tr>
            ) : docs.length === 0 ? (
              <tr><td colSpan={5} className="td text-center py-12 text-slate-500">No documents yet</td></tr>
            ) : docs.map(doc => (
              <tr key={doc._id} className="table-row">
                <td className="td">
                  <div className="flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                    <span className="text-white text-sm truncate max-w-[200px]">{doc.originalName}</span>
                  </div>
                </td>
                <td className="td"><StatusBadge status={doc.status} /></td>
                <td className="td text-slate-400">{doc.chunkCount || '—'}</td>
                <td className="td text-slate-500 text-xs whitespace-nowrap">
                  {new Date(doc.createdAt).toLocaleDateString()}
                </td>
                <td className="td">
                  <div className="flex gap-2">
                    <button onClick={() => reprocess(doc._id)} className="btn-ghost text-xs flex items-center gap-1 border border-slate-700 py-1 px-2 rounded-lg">
                      <RefreshCw className="w-3 h-3" /> Re-embed
                    </button>
                    <button onClick={() => deleteDoc(doc._id)} className="btn-danger">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
