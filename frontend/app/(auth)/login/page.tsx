'use client';
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Loader2, Brain } from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { toast } from 'sonner';

export default function LoginPage() {
  const router = useRouter();
  const login  = useAuthStore((s) => s.login);
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow]         = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const toastId = toast.loading('Signing in to workspace...');
    try {
      const { data } = await api.post('/auth/login', { email, password });
      login(data.data.token, data.data.user);
      toast.success(`Welcome back, ${data.data.user.email}!`, { id: toastId });
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
    <div className="min-h-screen flex items-center justify-center px-4 bg-[#0a0f1e] relative overflow-hidden">
      {/* Animated Background Glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{ scale: [1, 1.2, 1], opacity: [0.15, 0.25, 0.15] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-full blur-[120px]"
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm relative z-10"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <motion.div
            whileHover={{ scale: 1.05, rotate: 5 }}
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600/30 to-purple-600/30 border border-indigo-500/40 mb-4 shadow-xl shadow-indigo-500/10"
          >
            <Brain className="w-8 h-8 text-indigo-400" />
          </motion.div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Knowledge Assistant</h1>
          <p className="text-slate-400 text-xs mt-1 font-medium">Enterprise AI Document Portal</p>
        </div>

        {/* Form Card */}
        <div className="card border-slate-800/80 bg-[#0f1629]/90 shadow-2xl backdrop-blur-xl p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label text-xs font-semibold text-slate-300 mb-1.5">Email Address</label>
              <input
                id="email"
                type="email"
                className="input bg-[#151d35] border-slate-700/80 text-sm focus:border-indigo-500"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="label text-xs font-semibold text-slate-300 mb-1.5">Password</label>
              <div className="relative">
                <input
                  id="password"
                  type={show ? 'text' : 'password'}
                  className="input bg-[#151d35] border-slate-700/80 text-sm pr-10 focus:border-indigo-500"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                  onClick={() => setShow(!show)}
                >
                  {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-xl px-3.5 py-2.5"
              >
                {error}
              </motion.div>
            )}

            <button
              id="login-btn"
              type="submit"
              className="btn-primary w-full flex items-center justify-center gap-2 py-3 mt-2 rounded-xl text-sm font-semibold shadow-lg shadow-indigo-500/25"
              disabled={loading}
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Authenticating...' : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-[11px] text-slate-500 mt-6 font-medium">
          Enterprise Knowledge Assistant · Role-Based Access Control
        </p>
      </motion.div>
    </div>
  );
}
