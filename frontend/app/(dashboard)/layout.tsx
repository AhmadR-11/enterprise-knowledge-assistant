'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Users,
  Building2,
  FileText,
  ScrollText,
  LogOut,
  Brain,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  AlertTriangle,
  MessageSquare
} from 'lucide-react';
import { useAuthStore } from '@/lib/store';
import api from '@/lib/api';
import FloatingChatWidget from '@/components/FloatingChatWidget';
import { toast } from 'sonner';
import clsx from 'clsx';

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/chat', icon: MessageSquare, label: 'Chat' },
  { href: '/documents', icon: FileText, label: 'Documents' },
  { href: '/admin/users', icon: Users, label: 'Users', adminOnly: true },
  { href: '/admin/spaces', icon: Building2, label: 'Spaces', adminOnly: true },
  { href: '/admin/audit-logs', icon: ScrollText, label: 'Audit Logs', adminOnly: true },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout, hydrate, isHydrated } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (isHydrated) {
      if (!user) {
        router.push('/login');
      } else if (pathname.startsWith('/admin') && user.role !== 'admin') {
        toast.error('Access Denied: Admin privileges required');
        router.push('/dashboard');
      }
    }
  }, [isHydrated, user, pathname, router]);

  if (!isHydrated || !user) return null;

  const visibleItems = navItems.filter((i) => !i.adminOnly || user.role === 'admin');

  const confirmLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (err) {
      console.warn('Backend logout request failed, clearing local session anyway:', err);
    } finally {
      logout();
      toast.info('Signed out successfully');
      setShowLogoutModal(false);
      router.push('/login');
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-text-primary">
      {/* Left Nav Rail (Slim, refined, collapsible) */}
      <motion.aside
        animate={{ width: sidebarOpen ? 232 : 64 }}
        transition={{ type: 'spring', stiffness: 350, damping: 32 }}
        className="flex-shrink-0 bg-sidebar border-r border-border flex flex-col z-20 relative overflow-hidden select-none"
      >
        {/* Header / Brand Mark */}
        <div className="h-14 px-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0 overflow-hidden">
            <div className="w-8 h-8 rounded-control bg-surface-2 border border-border flex items-center justify-center flex-shrink-0 text-accent">
              <Brain className="w-4 h-4" />
            </div>
            {sidebarOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col min-w-0"
              >
                <span className="text-xs font-semibold text-text-primary tracking-tight truncate">
                  Cortex
                </span>
                <span className="text-[10px] text-text-muted font-medium truncate">
                  Knowledge Assistant
                </span>
              </motion.div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded-control text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors"
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-2.5 py-3 space-y-1 overflow-y-auto">
          {visibleItems.map(({ href, icon: Icon, label }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={clsx(
                  'group flex items-center gap-2.5 px-2.5 py-2 rounded-control text-xs font-medium transition-all duration-150 relative',
                  active
                    ? 'bg-surface-2 text-text-primary font-semibold shadow-subtle'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-1'
                )}
                title={!sidebarOpen ? label : undefined}
              >
                {/* 2px Left Accent Indicator on Active */}
                {active && (
                  <motion.div
                    layoutId="nav-rail-indicator"
                    className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-accent rounded-r-full"
                    transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                  />
                )}
                <Icon
                  className={clsx(
                    'w-4 h-4 flex-shrink-0 transition-colors',
                    active ? 'text-accent' : 'text-text-muted group-hover:text-text-secondary'
                  )}
                />
                {sidebarOpen && (
                  <>
                    <span className="flex-1 truncate">{label}</span>
                    {active && <ChevronRight className="w-3 h-3 text-text-muted" />}
                  </>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User Block & Quiet Sign Out */}
        <div className="p-2.5 border-t border-border bg-sidebar/50">
          {sidebarOpen ? (
            <div className="flex items-center gap-2.5 px-1.5 py-1 mb-2">
              <div className="w-7 h-7 rounded-full bg-surface-3 border border-border flex items-center justify-center flex-shrink-0 text-text-primary text-[11px] font-semibold">
                {user.email[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-text-primary font-medium truncate leading-tight">
                  {user.email}
                </p>
                <div className="mt-0.5">
                  <span
                    className={clsx(
                      'badge text-[10px] py-0 px-1.5',
                      user.role === 'admin'
                        ? 'badge-admin'
                        : user.role === 'editor'
                        ? 'badge-editor'
                        : 'badge-viewer'
                    )}
                  >
                    {user.role}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex justify-center mb-2">
              <div className="w-7 h-7 rounded-full bg-surface-3 border border-border flex items-center justify-center text-text-primary text-[11px] font-semibold">
                {user.email[0].toUpperCase()}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowLogoutModal(true)}
            className={clsx(
              'flex items-center gap-2 text-xs text-text-muted hover:text-danger hover:bg-danger/10 rounded-control transition-colors py-1.5',
              sidebarOpen ? 'w-full px-2' : 'w-full justify-center'
            )}
            title="Sign Out"
            aria-label="Sign Out"
          >
            <LogOut className="w-3.5 h-3.5 flex-shrink-0" />
            {sidebarOpen && <span>Sign Out</span>}
          </button>
        </div>
      </motion.aside>

      {/* Main Content Pane */}
      <main className="flex-1 overflow-y-auto relative bg-bg">
        <AnimatePresence mode="wait">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="h-full"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Floating Widget (on non-chat pages) */}
      {pathname !== '/chat' && <FloatingChatWidget />}

      {/* Sign Out Confirmation Modal */}
      <AnimatePresence>
        {showLogoutModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.15 }}
              className="card w-full max-w-sm border border-border-strong bg-surface-1 shadow-popover p-6 text-center"
            >
              <div className="mx-auto w-10 h-10 rounded-card bg-danger/10 border border-danger/20 flex items-center justify-center mb-3 text-danger">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-semibold text-text-primary tracking-tight mb-1">
                Confirm Sign Out
              </h3>
              <p className="text-xs text-text-muted leading-relaxed mb-5">
                Are you sure you want to sign out of your workspace account? You will need your credentials to log back in.
              </p>
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowLogoutModal(false)}
                  className="btn-ghost flex-1 py-2 rounded-control border border-border text-text-secondary hover:text-text-primary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmLogout}
                  className="btn-danger flex-1 py-2 rounded-control font-medium"
                >
                  Sign Out
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
