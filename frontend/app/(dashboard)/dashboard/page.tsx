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
    transition: { staggerChildren: 0.08 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } }
};

function StatCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType; label: string; value: number | string; color: string;
}) {
  return (
    <motion.div variants={itemVariants} className="card card-hover">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wide font-medium mb-1">{label}</p>
          <p className="text-3xl font-bold text-white tracking-tight">{value}</p>
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color} shadow-inner`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </motion.div>
  );
}

function ActionBadge({ action }: { action: string }) {
  const colors: Record<string, string> = {
    AUTH_LOGIN_SUCCESS:  'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    AUTH_LOGIN_FAILURE:  'bg-red-500/20 text-red-300 border-red-500/30',
    AUTH_REGISTER_SUCCESS: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    DOCUMENT_UPLOAD:     'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    DOCUMENT_DELETE:     'bg-amber-500/20 text-amber-300 border-amber-500/30',
  };
  return (
    <span className={`badge border text-[11px] px-2 py-0.5 rounded-md ${colors[action] || 'bg-slate-500/20 text-slate-300 border-slate-700'}`}>
      {action.replace(/_/g, ' ')}
    </span>
  );
}

export default function DashboardPage() {
  const [stats, setStats]   = useState<Stats | null>(null);
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
      <div className="w-7 h-7 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const chartData = stats?.documentsByStatus
    ? Object.entries(stats.documentsByStatus).map(([status, count]) => ({
        status: status.toUpperCase(),
        count
      }))
    : [];

  const BAR_COLORS: Record<string, string> = {
    READY: '#10b981',
    PROCESSING: '#6366f1',
    FAILED: '#ef4444'
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
          <h1 className="text-2xl font-bold text-white tracking-wide">Dashboard</h1>
          <p className="text-slate-400 text-sm mt-1">Real-time system metrics, analytics & recent activity</p>
        </div>
        <button
          onClick={() => fetchStats(true)}
          disabled={refreshing}
          className="btn-ghost flex items-center gap-2 text-xs bg-slate-800/60 border border-slate-700/60 rounded-xl hover:bg-slate-700/60 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-indigo-400' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={FileText}       label="Total Documents" value={stats?.totalDocuments ?? 0} color="bg-indigo-500/20 text-indigo-400" />
        <StatCard icon={MessageSquare}  label="Total Queries"   value={stats?.totalQueries ?? 0}   color="bg-emerald-500/20 text-emerald-400" />
        <StatCard icon={Users}          label="Active Users"    value={stats?.activeUsers ?? 0}     color="bg-amber-500/20 text-amber-400" />
        <StatCard icon={Building2}      label="Spaces"          value={stats?.documentsBySpace?.length ?? 0} color="bg-purple-500/20 text-purple-400" />
      </div>

      {/* Visual Analytics Chart + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Document Status Analytics Chart */}
        <motion.div variants={itemVariants} className="card flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-indigo-400" />
              <h2 className="font-semibold text-white text-sm">Document Ingestion Analytics</h2>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">By Status</span>
          </div>

          {chartData.length > 0 ? (
            <div className="h-64 w-full pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="status" stroke="#64748b" fontSize={11} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={11} allowDecimals={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f1629', borderColor: '#334155', borderRadius: '12px', color: '#fff', fontSize: '12px' }}
                    cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
                  />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={BAR_COLORS[entry.status] || '#6366f1'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-sm py-12">
              No document statistics available
            </div>
          )}
        </motion.div>

        {/* Recent Activity Feed */}
        <motion.div variants={itemVariants} className="card flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-400" />
              <h2 className="font-semibold text-white text-sm">Recent System Activity</h2>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">Audit Stream</span>
          </div>

          {stats?.recentActivity?.length ? (
            <div className="space-y-3 flex-1 overflow-y-auto pr-1">
              {stats.recentActivity.map((log: AuditLog) => (
                <div key={log._id} className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-[#151d35]/50 border border-slate-800/60 hover:border-slate-700/60 transition">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-200 truncate">{log.email}</p>
                    <div className="mt-1">
                      <ActionBadge action={log.action} />
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono whitespace-nowrap">
                    {log.timestamp ? format(new Date(log.timestamp), 'MMM d, HH:mm') : ''}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-sm py-12">
              No recent audit activity
            </div>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}
