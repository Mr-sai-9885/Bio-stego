import type { Metadata, Viewport } from 'next';
import Nav from '@/components/Nav';
import './globals.css';

export const metadata: Metadata = {
  title: 'BioSteg - Secure Biometric Steganography Messaging',
  description: 'Military-grade end-to-end encrypted messaging with WebAuthn biometrics and PNG LSB steganography.',
};

export const viewport: Viewport = {
  themeColor: '#0a0f1d',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-white text-slate-900 min-h-screen antialiased flex flex-col md:flex-row">
        <Nav />
        <div className="flex-1 min-h-screen md:pl-64 pt-14 md:pt-0 flex flex-col bg-white overflow-y-auto">
          <main className="flex-1 w-full max-w-7xl mx-auto p-4 md:p-6 lg:p-8 bg-white">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}