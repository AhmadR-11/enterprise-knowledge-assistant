'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon } from 'lucide-react';
import clsx from 'clsx';

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <button
        type="button"
        className={clsx(
          'w-9 h-9 min-w-[36px] min-h-[36px] rounded-control flex items-center justify-center',
          'text-text-muted bg-transparent border border-transparent',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          className
        )}
        aria-label="Toggle theme"
        title="Toggle theme"
        disabled
      >
        <span className="w-4 h-4 rounded-full bg-surface-3 opacity-40 inline-block" />
      </button>
    );
  }

  const isDark = resolvedTheme === 'dark';
  const label = isDark ? 'Switch to light theme' : 'Switch to dark theme';

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={clsx(
        'w-9 h-9 min-w-[36px] min-h-[36px] rounded-control flex items-center justify-center',
        'text-text-secondary hover:text-text-primary hover:bg-surface-2 bg-transparent border border-transparent',
        'transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        className
      )}
      aria-label={label}
      title={label}
    >
      {isDark ? (
        <Sun className="w-4 h-4 text-warning transition-transform duration-150" />
      ) : (
        <Moon className="w-4 h-4 text-text-primary transition-transform duration-150" />
      )}
    </button>
  );
}

export default ThemeToggle;

