'use client';
import { useEffect, useState } from 'react';
import { FileText, Users, MessageSquare, Building2, TrendingUp, Clock } from 'lucide-react';
import api from '@/lib/api';
import { Stats, AuditLog } from '@/types';
import { format } from 'date-fns';

function StatCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType; label: string; value: number | string; color: string;
}) {
  return (
    <div className="card card-hover animate-slide-up">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wide font-medium mb-1">{label}</p>
          <p className="text-3xl font-bold text-white">{value}</p>
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}

function ActionBadge({ action }: { action: string }) {
  const colors: Record<string, string> = {
    AUTH_LOGIN_SUCCESS:  'bg-emerald-500/20 text-emerald-300',
    AUTH_LOGIN_FAILURE:  'bg-red-500/20 text-red-300',
    AUTH_REGISTER_SUCCESS: 'bg-blue-500/20 text-blue-300',
  };
  return (
    <span className={`badge ${colors[action] || 'bg-slate-500/20 text-slate-300'}`}>
      {action.replace(/_/g, ' ')}
    </span>
  );
}

export default function DashboardPage() {
  const [stats, setStats]   = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/audit/stats')
      .then(r => setStats(r.data.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-full min-h-[50vh]">
      <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-slate-400 text-sm mt-1">System overview and recent activity</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={FileText}       label="Total Documents" value={stats?.totalDocuments ?? 0} color="bg-indigo-500/20 text-indigo-400" />
        <StatCard icon={MessageSquare}  label="Total Queries"   value={stats?.totalQueries ?? 0}   color="bg-emerald-500/20 text-emerald-400" />
        <StatCard icon={Users}          label="Active Users"    value={stats?.activeUsers ?? 0}     color="bg-amber-500/20 text-amber-400" />
        <StatCard icon={Building2}      label="Spaces"          value={stats?.documentsBySpace?.length ?? 0} color="bg-purple-500/20 text-purple-400" />
      </div>

      {/* Document status + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Document Status */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-indigo-400" />
            <h2 className="font-semibold text-white text-sm">Document Status</h2>
          </div>
          {stats?.documentsByStatus && Object.keys(stats.documentsByStatus).length > 0 ? (
            <div className="space-y-3">
              {Object.entries(stats.documentsByStatus).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between">
                  <span className={`badge-${status} badge capitalize`}>{status}</span>
                  <span className="text-white font-semibold">{count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 text-sm">No documents yet</p>
          )}
        </div>

        {/* Recent Activity */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 text-indigo-400" />
            <h2 className="font-semibold text-white text-sm">Recent Activity</h2>
          </div>
          {stats?.recentActivity?.length ? (
            <div className="space-y-2.5">
              {stats.recentActivity.map((log: AuditLog) => (
                <div key={log._id} className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-400 truncate">{log.email}</p>
                    <ActionBadge action={log.action} />
                  </div>
                  <span className="text-[10px] text-slate-600 whitespace-nowrap">
                    {log.timestamp ? format(new Date(log.timestamp), 'MMM d, HH:mm') : ''}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 text-sm">No recent activity</p>
          )}
        </div>
      </div>
    </div>
  );
}
