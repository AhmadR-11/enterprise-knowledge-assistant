import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { Toaster } from 'sonner';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'Enterprise Knowledge Assistant (Cortex)',
  description: 'AI-powered internal document Q&A system with role-based access control',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="bg-bg text-text-primary font-sans antialiased selection:bg-accent-soft selection:text-accent">
        {children}
        <Toaster
          position="top-right"
          theme="dark"
          closeButton
          toastOptions={{
            style: {
              background: 'var(--surface-1)',
              border: '1px solid var(--border-strong)',
              color: 'var(--text-primary)',
            },
          }}
        />
      </body>
    </html>
  );
}
