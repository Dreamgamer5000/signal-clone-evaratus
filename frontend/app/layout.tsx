import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ToastHost } from '@/components/ToastHost';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'Signal',
  description: 'A private messenger clone',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: "(function(){try{var s=localStorage.getItem('theme')||'system';var d=s==='dark'||(s==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';}catch(e){}})();",
          }}
        />
      </head>
      <body className="font-sans antialiased bg-surface text-gray-90">
        {children}
        <ToastHost />
      </body>
    </html>
  );
}
