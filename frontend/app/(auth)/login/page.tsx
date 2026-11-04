'use client';
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Loader2, Brain, Shield, Edit3, Eye as EyeIcon } from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { toast } from 'sonner';

type RoleOption = 'admin' | 'editor' | 'viewer';

const ROLES: { id: RoleOption; label: string; icon: React.ElementType }[] = [
  { id: 'admin',  label: 'Admin',  icon: Shield },
  { id: 'editor', label: 'Editor', icon: Edit3 },
  { id: 'viewer', label: 'Viewer', icon: EyeIcon },
];

export default function LoginPage() {
  const router = useRouter();
  const login  = useAuthStore((s) => s.login);
  const [selectedRole, setSelectedRole] = useState<RoleOption>('editor');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow]         = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const toastId = toast.loading(`Signing in as ${selectedRole.toUpperCase()}...`);
    try {
      const { data } = await api.post('/auth/login', {
        email,
        password,
        role: selectedRole
      });
      login(data.data.token, data.data.user);
      toast.success(`Welcome back (${data.data.user.role.toUpperCase()})!`, { id: toastId });
      router.push('/dashboard');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      const msg = e.response?.data?.message || 'Invalid email or password';
      setError(msg);
      toast.error(msg, { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-bg relative overflow-hidden select-none">
      {/* Subtle Radial Accent Glow at 6% Opacity (Only place glow is permitted) */}
      <div
        aria-hidden="true"
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] h-[480px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(45, 212, 191, 0.06) 0%, transparent 70%)',
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-sm relative z-10"
      >
        {/* Brand Mark */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-11 h-11 rounded-card bg-surface-2 border border-border mb-3 text-accent shadow-subtle">
            <Brain className="w-5 h-5" />
          </div>
          <h1 className="text-lg font-semibold text-text-primary tracking-tight">Cortex Assistant</h1>
          <p className="text-text-muted text-xs mt-0.5">Enterprise Knowledge Portal</p>
        </div>

        {/* Centered Card */}
        <div className="card border border-border bg-surface-1 shadow-popover p-6 rounded-card">
          {/* Role Toggle Selector */}
          <div className="mb-4">
            <label className="label text-center mb-2">
              Select Role Mode
            </label>
            <div className="grid grid-cols-3 gap-1 p-0.5 bg-surface-2 border border-border rounded-control relative">
              {ROLES.map(({ id, label, icon: Icon }) => {
                const isSelected = selectedRole === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => { setSelectedRole(id); setError(''); }}
                    className={`relative flex items-center justify-center gap-1.5 py-1.5 rounded-[6px] text-xs font-medium transition-colors z-10 ${
                      isSelected ? 'bg-surface-3 text-text-primary border border-border-strong shadow-subtle' : 'text-text-muted hover:text-text-secondary'
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-accent' : 'text-text-muted'}`} />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="label">Email Address</label>
              <input
                id="email"
                type="email"
                className="input text-xs"
                placeholder={`${selectedRole}@company.com`}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input
                  id="password"
                  type={show ? 'text' : 'password'}
                  className="input text-xs pr-9"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
                  onClick={() => setShow(!show)}
                >
                  {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="text-danger text-xs bg-danger/10 border border-danger/20 rounded-control px-3 py-2 leading-relaxed">
                {error}
              </div>
            )}

            <button
              id="login-btn"
              type="submit"
              className="btn-primary w-full flex items-center justify-center gap-2 py-2 mt-2 rounded-control text-xs font-medium"
              disabled={loading}
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}
              {loading ? `Signing in…` : `Sign In as ${selectedRole.toUpperCase()}`}
            </button>
          </form>
        </div>

        <p className="text-center text-[11px] text-text-muted mt-5">
          Enterprise Knowledge Assistant · Role-Based Access Control
        </p>
      </motion.div>
    </div>
  );
}
