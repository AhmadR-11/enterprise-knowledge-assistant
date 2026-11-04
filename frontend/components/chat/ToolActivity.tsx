'use client';

import React, { useMemo } from 'react';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { ToolActivityItem } from '@/types';

interface ToolActivityProps {
  activities?: ToolActivityItem[];
}

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
    if (status === 'done') return 'Read document details';
    return 'Failed to read document';
  }

  if (status === 'running') return `Running ${name}…`;
  if (status === 'done') return `Completed ${name}`;
  return `${name} failed`;
}

function formatDuration(ms?: number): string | null {
  if (typeof ms !== 'number' || ms <= 0) return null;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function ToolActivity({ activities }: ToolActivityProps) {
  if (!activities || activities.length === 0) {
    return null;
  }

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
      className="mb-2.5 space-y-1"
    >
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {latestAnnouncement}
      </div>

      {activities.map((activity) => {
        const text = getHumanToolText(activity);
        const duration = formatDuration(activity.durationMs);

        return (
          <div
            key={activity.id}
            className="inline-flex items-center justify-between gap-3 px-2.5 py-1 rounded-control bg-surface-1 border border-border text-xs text-text-secondary mr-2"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              {activity.status === 'running' && (
                <Loader2
                  className="w-3.5 h-3.5 text-accent animate-spin motion-reduce:animate-none flex-shrink-0"
                  aria-hidden="true"
                />
              )}
              {activity.status === 'done' && (
                <CheckCircle2
                  className="w-3.5 h-3.5 text-accent flex-shrink-0"
                  aria-hidden="true"
                />
              )}
              {activity.status === 'failed' && (
                <AlertCircle
                  className="w-3.5 h-3.5 text-danger flex-shrink-0"
                  aria-hidden="true"
                />
              )}
              <span className="truncate text-[12px]">{text}</span>
            </div>

            {duration && (
              <span className="text-[11px] text-text-muted font-mono tabular-nums flex-shrink-0">
                {duration}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
