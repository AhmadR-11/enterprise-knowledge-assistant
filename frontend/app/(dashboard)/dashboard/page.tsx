'use client';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, Users, MessageSquare, Building2, TrendingUp, Clock, RefreshCw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import api from '@/lib/api';
import { Stats, AuditLog } from '@/types';
import { format } from 'date-fns';
import { toast } from 'sonner';

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.2 } }
};

function StatCard({ icon: Icon, label, value, trend }: {
  icon: React.ElementType; label: string; value: number | string; trend?: string;
}) {
  return (
    <motion.div variants={itemVariants} className="card bg-surface-1 border border-border shadow-sm p-4 rounded-card hover:bg-surface-2 transition-colors duration-150">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium text-text-muted">{label}</p>
          <p className="text-2xl font-bold text-text-primary tabular-nums tracking-tight">{value}</p>
          {trend && <p className="text-[11px] text-text-muted font-medium">{trend}</p>}
        </div>
        <div className="w-9 h-9 rounded-control bg-surface-2 border border-border flex items-center justify-center text-text-muted shadow-sm">
          <Icon className="w-4 h-4" />
        </div>
      </div>
    </motion.div>
  );
}

function ActionBadge({ action }: { action: string }) {
  const isSuccess = action.includes('SUCCESS') || action === 'DOCUMENT_UPLOAD';
  const isFailure = action.includes('FAILURE') || action === 'DOCUMENT_DELETE';
  const isWarning = action.includes('WARNING');

  let style = 'badge bg-surface-2 text-text-secondary border-border';
  if (isSuccess) style = 'badge bg-success-soft text-success border-success-border';
  if (isFailure) style = 'badge bg-danger-soft text-danger border-danger-border';
  if (isWarning) style = 'badge bg-warning-soft text-warning border-warning-border';

  return (
    <span className={`${style} text-xs font-medium px-2 py-0.5 rounded-control capitalize`}>
      {action.replace(/_/g, ' ').toLowerCase()}
    </span>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = (isManual = false) => {
    if (isManual) setRefreshing(true);
    api.get('/audit/stats')
      .then(r => {
        setStats(r.data.data);
        if (isManual) toast.success('Dashboard metrics refreshed');
      })
      .catch(() => toast.error('Failed to load stats'))
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  };

  useEffect(() => { fetchStats(); }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-full min-h-[50vh]">
      <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin motion-reduce:animate-none" />
    </div>
  );

  const chartData = stats?.documentsByStatus
    ? Object.entries(stats.documentsByStatus).map(([status, count]) => ({
        status: status.toUpperCase(),
        count
      }))
    : [];

  const BAR_COLORS: Record<string, string> = {
    READY: 'var(--accent)',
    PROCESSING: 'var(--warning)',
    FAILED: 'var(--danger)'
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="p-6 max-w-6xl mx-auto space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold text-text-primary tracking-tight">Dashboard</h1>
          <p className="text-text-muted text-xs mt-1">Real-time system metrics, analytics & recent activity</p>
        </div>
        <button
          type="button"
          onClick={() => fetchStats(true)}
          disabled={refreshing}
          className="btn-ghost flex items-center gap-1.5 text-xs bg-surface-2 border border-border rounded-control hover:bg-surface-3 active:bg-surface-3 min-h-[36px] transition-colors duration-150 py-1.5 px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin motion-reduce:animate-none text-accent' : 'text-text-muted'}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <StatCard icon={FileText} label="Total Documents" value={stats?.totalDocuments ?? 0} />
        <StatCard icon={MessageSquare} label="Total Queries" value={stats?.totalQueries ?? 0} />
        <StatCard icon={Users} label="Active Users" value={stats?.activeUsers ?? 0} />
        <StatCard icon={Building2} label="Spaces" value={stats?.documentsBySpace?.length ?? 0} />
      </div>

      {/* Visual Analytics Chart + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Document Status Analytics Chart */}
        <motion.div variants={itemVariants} className="card flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-accent" />
              <h2 className="font-semibold text-text-primary text-xs tracking-tight">Document Ingestion Analytics</h2>
            </div>
            <span className="text-[11px] text-text-muted font-medium">By Status</span>
          </div>

          {chartData.length > 0 ? (
            <div className="h-60 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="status" stroke="var(--text-muted)" fontSize={11} tickLine={false} />
                  <YAxis stroke="var(--text-muted)" fontSize={11} allowDecimals={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--surface-1)',
                      borderColor: 'var(--border-strong)',
                      borderRadius: '8px',
                      color: 'var(--text-primary)',
                      fontSize: '12px'
                    }}
                    cursor={{ fill: 'var(--surface-3)' }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={BAR_COLORS[entry.status] || 'var(--accent)'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-text-muted text-xs py-12">
              No document statistics available
            </div>
          )}
        </motion.div>

        {/* Recent Activity Feed */}
        <motion.div variants={itemVariants} className="card flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-text-muted" />
              <h2 className="font-semibold text-text-primary text-xs tracking-tight">Recent System Activity</h2>
            </div>
            <span className="text-[11px] text-text-muted font-medium">Audit Stream</span>
          </div>

          {stats?.recentActivity?.length ? (
            <div className="space-y-2 flex-1 overflow-y-auto pr-1 max-h-60">
              {stats.recentActivity.map((log: AuditLog) => (
                <div key={log._id} className="flex items-center justify-between gap-3 p-2 rounded-control bg-surface-2 border border-border hover:border-border-strong transition-colors duration-150">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-text-primary truncate">{log.email}</p>
                    <div className="mt-0.5">
                      <ActionBadge action={log.action} />
                    </div>
                  </div>
                  <span className="text-[10px] text-text-muted font-mono whitespace-nowrap tabular-nums">
                    {log.timestamp ? format(new Date(log.timestamp), 'MMM d, HH:mm') : ''}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-text-muted text-xs py-12">
              No recent audit activity
            </div>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}
