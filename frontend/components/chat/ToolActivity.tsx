'use client';

import React, { useMemo } from 'react';
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { ToolActivityItem } from '@/types';

interface ToolActivityProps {
  activities?: ToolActivityItem[];
}

/**
 * Maps raw tool names and execution status to human-readable text.
 */
function getHumanToolText(activity: ToolActivityItem): string {
  const { name, status, resultCount } = activity;

  if (name === 'searchKnowledgeBase') {
    if (status === 'running') return 'Searching knowledge base…';
    if (status === 'done') {
      const count = typeof resultCount === 'number' ? resultCount : 0;
      return count === 1 ? 'Found 1 source' : `Found ${count} sources`;
    }
    return 'Search failed';
  }

  if (name === 'getDocumentDetails') {
    if (status === 'running') return 'Reading document details…';
    if (status === 'done') return 'Read document';
    return 'Failed to read document';
  }

  // Fallback for custom or future tools
  if (status === 'running') return `Running ${name}…`;
  if (status === 'done') return `Completed ${name}`;
  return `${name} failed`;
}

/**
 * Formats duration in milliseconds to human friendly string.
 */
function formatDuration(ms?: number): string | null {
  if (typeof ms !== 'number' || ms <= 0) return null;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Compact status line above assistant answers showing real-time tool execution progress.
 * Respects prefers-reduced-motion and announces state transitions politely to screen readers.
 */
export function ToolActivity({ activities }: ToolActivityProps) {
  if (!activities || activities.length === 0) {
    return null;
  }

  // Generate concise screen-reader announcement for the active or latest tool
  const latestAnnouncement = useMemo(() => {
    const running = activities.find((a) => a.status === 'running');
    if (running) {
      return getHumanToolText(running);
    }
    const last = activities[activities.length - 1];
    return last ? getHumanToolText(last) : '';
  }, [activities]);

  return (
    <div
      role="status"
      aria-label="Assistant tool activity"
      className="mb-3 p-2.5 bg-[#0d1427]/80 border border-slate-800/80 rounded-xl space-y-1.5 transition-opacity duration-200 motion-reduce:transition-none"
    >
      {/* Screen Reader Live Region */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {latestAnnouncement}
      </div>

      {/* Render neat stack of tool activities */}
      {activities.map((activity) => {
        const text = getHumanToolText(activity);
        const duration = formatDuration(activity.durationMs);

        return (
          <div
            key={activity.id}
            className="flex items-center justify-between gap-2 text-xs leading-none"
          >
            <div className="flex items-center gap-2 min-w-0">
              {activity.status === 'running' && (
                <Loader2
                  className="w-3.5 h-3.5 text-indigo-400 animate-spin motion-reduce:animate-none flex-shrink-0"
                  aria-hidden="true"
                />
              )}
              {activity.status === 'done' && (
                <CheckCircle2
                  className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0"
                  aria-hidden="true"
                />
              )}
              {activity.status === 'failed' && (
                <AlertTriangle
                  className="w-3.5 h-3.5 text-amber-400 flex-shrink-0"
                  aria-hidden="true"
                />
              )}

              <span
                className={`truncate font-medium ${
                  activity.status === 'running'
                    ? 'text-indigo-200'
                    : activity.status === 'done'
                    ? 'text-slate-300'
                    : 'text-amber-300'
                }`}
              >
                {text}
              </span>
            </div>

            {duration && (
              <span className="text-[10px] text-slate-500 font-mono flex-shrink-0">
                {duration}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

