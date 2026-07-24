// app/layout.tsx
import type { Metadata } from 'next';
import { Toaster } from 'sonner';
import './globals.css';

export const metadata: Metadata = {
  title: 'Enterprise Knowledge Assistant',
  description: 'AI-powered internal document Q&A system with role-based access control',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#0a0f1e] text-slate-100 font-sans antialiased">
        {children}
        <Toaster position="top-right" theme="dark" richColors closeButton />
      </body>
    </html>
  );
}
