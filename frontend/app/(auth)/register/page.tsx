'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import { Brain } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function RegisterPage() {
  const router = useRouter();
  const { user, hydrate, isHydrated } = useAuthStore();
  useEffect(() => { hydrate(); }, [hydrate]);
  useEffect(() => { if (isHydrated && user) router.push('/dashboard'); }, [isHydrated, user, router]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-bg select-none relative overflow-hidden">
      {/* Theme Toggle Top-Right */}
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      {/* Subtle Radial Accent Glow at 6% Opacity (Only place glow is permitted) */}
      <div
        aria-hidden="true"
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] h-[480px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, var(--accent-soft) 0%, transparent 70%)',
        }}
      />

      <div className="card w-full max-w-sm text-center border border-border bg-surface-1 shadow-md p-6 rounded-card relative z-10">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-control bg-surface-2 border border-border mx-auto mb-3 text-accent shadow-sm">
          <Brain className="w-5 h-5 text-accent" />
        </div>
        <h1 className="text-text-primary font-semibold text-base tracking-tight">Account registration</h1>
        <p className="text-text-muted text-xs mt-2 leading-relaxed">
          Accounts are provisioned by workspace administrators.<br />
          Please contact your administrator to request access.
        </p>
        <button
          type="button"
          onClick={() => router.push('/login')}
          className="btn-primary mt-4 w-full text-xs py-2 min-h-[36px] active:bg-accent-fill/90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Back to login
        </button>
      </div>
    </div>
  );
}
