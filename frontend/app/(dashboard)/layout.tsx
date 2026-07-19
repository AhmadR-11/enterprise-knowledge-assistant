'use client';
import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard, Users, Building2, FileText,
  ScrollText, LogOut, Brain, ChevronRight
} from 'lucide-react';
import { useAuthStore } from '@/lib/store';
import clsx from 'clsx';

const navItems = [
  { href: '/dashboard',        icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/admin/users',      icon: Users,           label: 'Users',      adminOnly: true },
  { href: '/admin/spaces',     icon: Building2,       label: 'Spaces',     adminOnly: true },
  { href: '/documents',        icon: FileText,        label: 'Documents' },
  { href: '/admin/audit-logs', icon: ScrollText,  label: 'Audit Logs', adminOnly: true },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const { user, logout, hydrate, isHydrated } = useAuthStore();

  useEffect(() => { hydrate(); }, [hydrate]);

  useEffect(() => {
    if (isHydrated && !user) router.push('/login');
  }, [isHydrated, user, router]);

  if (!isHydrated || !user) return null;

  const visibleItems = navItems.filter(i => !i.adminOnly || user.role === 'admin');

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 bg-[#0f1629] border-r border-slate-800 flex flex-col">
        {/* Logo */}
        <div className="px-4 py-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
              <Brain className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white leading-none">Knowledge</p>
              <p className="text-xs text-slate-500 mt-0.5">Assistant</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {visibleItems.map(({ href, icon: Icon, label }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={clsx(active ? 'sidebar-link-active' : 'sidebar-link')}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1">{label}</span>
                {active && <ChevronRight className="w-3 h-3 opacity-50" />}
              </Link>
            );
          })}
        </nav>

        {/* User info + logout */}
        <div className="px-3 py-4 border-t border-slate-800">
          <div className="flex items-center gap-3 px-2 mb-3">
            <div className="w-7 h-7 rounded-full bg-indigo-600/30 border border-indigo-500/30 flex items-center justify-center">
              <span className="text-xs font-semibold text-indigo-300">
                {user.email[0].toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-white font-medium truncate">{user.email}</p>
              <span className={clsx('text-[10px] capitalize font-medium',
                user.role === 'admin' ? 'text-indigo-400' :
                user.role === 'editor' ? 'text-emerald-400' : 'text-slate-400'
              )}>{user.role}</span>
            </div>
          </div>
          <button
            onClick={() => { logout(); router.push('/login'); }}
            className="btn-ghost w-full flex items-center gap-2 text-xs text-slate-500 hover:text-red-400"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
