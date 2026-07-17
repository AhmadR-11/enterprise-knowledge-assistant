'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import { Brain } from 'lucide-react';

export default function RegisterPage() {
  const router = useRouter();
  const { user, hydrate, isHydrated } = useAuthStore();
  useEffect(() => { hydrate(); }, [hydrate]);
  useEffect(() => { if (isHydrated && user) router.push('/dashboard'); }, [isHydrated, user, router]);
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="card w-full max-w-sm text-center">
        <Brain className="w-8 h-8 text-indigo-400 mx-auto mb-3" />
        <h1 className="text-white font-semibold">Account Registration</h1>
        <p className="text-slate-400 text-sm mt-2">
          Accounts are created by system administrators.<br />
          Please contact your admin to get access.
        </p>
        <button onClick={() => router.push('/login')} className="btn-primary mt-4 w-full text-sm">
          Back to Login
        </button>
      </div>
    </div>
  );
}
