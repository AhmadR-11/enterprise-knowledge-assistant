'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Users, Building2, FileText,
  ScrollText, LogOut, Brain, ChevronRight,
  PanelLeftClose, PanelLeftOpen, AlertTriangle
} from 'lucide-react';
import { useAuthStore } from '@/lib/store';
import FloatingChatWidget from '@/components/FloatingChatWidget';
import { toast } from 'sonner';
import clsx from 'clsx';

const navItems = [
  { href: '/dashboard',        icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/documents',        icon: FileText,        label: 'Documents' },
  { href: '/admin/users',      icon: Users,           label: 'Users',      adminOnly: true },
  { href: '/admin/spaces',     icon: Building2,       label: 'Spaces',     adminOnly: true },
  { href: '/admin/audit-logs', icon: ScrollText,  label: 'Audit Logs', adminOnly: true },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const { user, logout, hydrate, isHydrated } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  useEffect(() => { hydrate(); }, [hydrate]);

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

  const visibleItems = navItems.filter(i => !i.adminOnly || user.role === 'admin');

  const confirmLogout = () => {
    logout();
    toast.info('Signed out successfully');
    setShowLogoutModal(false);
    router.push('/login');
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#0a0f1e]">
      {/* Sidebar */}
      <motion.aside
        animate={{ width: sidebarOpen ? 240 : 72 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="flex-shrink-0 bg-[#0f1629] border-r border-slate-800/80 flex flex-col z-20 relative overflow-hidden"
      >
        {/* Logo & Toggle */}
        <div className="px-3 py-4 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0 overflow-hidden">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center flex-shrink-0 shadow-lg shadow-indigo-500/10">
              <Brain className="w-5 h-5 text-indigo-400" />
            </div>
            {sidebarOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col min-w-0"
              >
                <p className="text-sm font-bold text-white tracking-wide truncate">Knowledge</p>
                <p className="text-[10px] text-slate-500 font-medium truncate">Enterprise AI Assistant</p>
              </motion.div>
            )}
          </div>

          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition"
            title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
          {visibleItems.map(({ href, icon: Icon, label }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={clsx(
                  'relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-200',
                  active
                    ? 'text-white'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                )}
                title={!sidebarOpen ? label : undefined}
              >
                {active && (
                  <motion.div
                    layoutId="sidebar-active-pill"
                    className="absolute inset-0 bg-indigo-600/20 border border-indigo-500/30 rounded-xl"
                    transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                  />
                )}
                <Icon className={clsx('w-4 h-4 flex-shrink-0 relative z-10', active ? 'text-indigo-400' : 'text-slate-400')} />
                {sidebarOpen && (
                  <>
                    <span className="flex-1 relative z-10 truncate">{label}</span>
                    {active && <ChevronRight className="w-3 h-3 text-indigo-400 relative z-10" />}
                  </>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User info + logout button */}
        <div className="px-3 py-4 border-t border-slate-800/80">
          {sidebarOpen ? (
            <div className="flex items-center gap-3 px-2 mb-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 border border-indigo-400/30 flex items-center justify-center shadow-md flex-shrink-0">
                <span className="text-xs font-bold text-white">
                  {user.email[0].toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white font-medium truncate">{user.email}</p>
                <span className={clsx('text-[10px] capitalize font-semibold',
                  user.role === 'admin' ? 'text-indigo-400' :
                  user.role === 'editor' ? 'text-emerald-400' : 'text-slate-400'
                )}>{user.role}</span>
              </div>
            </div>
          ) : (
            <div className="flex justify-center mb-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-600 to-purple-600 border border-indigo-400/30 flex items-center justify-center shadow-md">
                <span className="text-xs font-bold text-white">
                  {user.email[0].toUpperCase()}
                </span>
              </div>
            </div>
          )}

          <button
            onClick={() => setShowLogoutModal(true)}
            className={clsx(
              "btn-ghost flex items-center gap-2 text-xs text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all",
              sidebarOpen ? "w-full px-3 py-2" : "w-full justify-center py-2"
            )}
            title="Sign Out"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {sidebarOpen && <span>Sign Out</span>}
          </button>
        </div>
      </motion.aside>

      {/* Main content with page transition */}
      <main className="flex-1 overflow-y-auto relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="h-full"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Global Floating AI Chat Widget */}
      <FloatingChatWidget />

      {/* Sign Out Warning Confirmation Modal */}
      <AnimatePresence>
        {showLogoutModal && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }}
              transition={{ type: 'spring', stiffness: 350, damping: 25 }}
              className="card w-full max-w-sm border border-slate-700/80 bg-[#0f1629]/95 backdrop-blur-2xl shadow-2xl p-6 text-center"
            >
              <div className="mx-auto w-12 h-12 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center mb-4 shadow-lg shadow-red-500/10">
                <AlertTriangle className="w-6 h-6 text-red-400" />
              </div>
              <h3 className="text-lg font-bold text-white tracking-tight mb-1">Confirm Sign Out</h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-6">
                Are you sure you want to sign out of your workspace account? You will need to log back in to access documents and spaces.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowLogoutModal(false)}
                  className="btn-ghost flex-1 text-xs py-2.5 rounded-xl border border-slate-700/80 text-slate-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmLogout}
                  className="flex-1 text-xs py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-red-700 text-white font-semibold shadow-lg shadow-red-600/25 hover:from-red-500 hover:to-red-600 transition"
                >
                  Yes, Sign Out
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
