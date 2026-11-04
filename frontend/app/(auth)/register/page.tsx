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
    <div className="min-h-screen flex items-center justify-center px-4 bg-bg select-none">
      <div className="card w-full max-w-sm text-center border border-border bg-surface-1 shadow-popover p-6 rounded-card">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-card bg-surface-2 border border-border mx-auto mb-3 text-accent shadow-subtle">
          <Brain className="w-5 h-5" />
        </div>
        <h1 className="text-text-primary font-semibold text-sm">Account Registration</h1>
        <p className="text-text-muted text-xs mt-2 leading-relaxed">
          Accounts are provisioned by workspace administrators.<br />
          Please contact your administrator to request access.
        </p>
        <button
          type="button"
          onClick={() => router.push('/login')}
          className="btn-primary mt-4 w-full text-xs py-2"
        >
          Back to Login
        </button>
      </div>
    </div>
  );
}
