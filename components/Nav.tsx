'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import PanicButton from '@/components/PanicButton';
import LogoutButton from '@/components/LogoutButton';

export default function Nav() {
  const pathname = usePathname();
  const supabase = createSupabaseBrowser();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [hasLocalKey, setHasLocalKey] = useState<boolean>(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    // Gracefully check auth user without blocking on network error
    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (data?.user) {
          setUserEmail(data.user.email ?? 'Authenticated');
          const key = localStorage.getItem(`bsteg_priv_${data.user.id}`);
          setHasLocalKey(!!key);
        } else {
          setUserEmail(null);
        }
      })
      .catch(() => {
        // Fallback gracefully if Supabase network is unreachable
        setUserEmail(null);
      });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUserEmail(session.user.email ?? 'Authenticated');
        const key = localStorage.getItem(`bsteg_priv_${session.user.id}`);
        setHasLocalKey(!!key);
      } else {
        setUserEmail(null);
        setHasLocalKey(false);
      }
    });

    return () => {
      listener?.subscription?.unsubscribe?.();
    };
  }, [supabase]);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const navItems = [
    {
      name: 'Dashboard',
      href: '/dashboard',
      icon: (
        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
    },
    {
      name: 'Secure Messages',
      href: '/messages',
      icon: (
        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
    },
    {
      name: 'Contacts',
      href: '/contacts',
      icon: (
        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
    },
    {
      name: 'Key Vault & E2EE',
      href: '/keys',
      icon: (
        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
        </svg>
      ),
    },
    {
      name: 'WebAuthn Security',
      href: '/webauthn',
      icon: (
        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 004 11m0 0a8 8 0 008 8c.7 0 1.385-.06 2.05-.174" />
        </svg>
      ),
    },
    {
      name: 'Home / Portal',
      href: '/',
      icon: (
        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
    },
  ];

  return (
    <>
      {/* Mobile Top Header */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 bg-[#0a0f1d] border-b border-slate-800 fixed top-0 left-0 right-0 z-40">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-cyan-600 flex items-center justify-center font-bold text-white text-xs shadow-md shadow-cyan-900/50">
            BS
          </div>
          <span className="font-semibold text-white tracking-wide text-sm">BioSteg</span>
        </div>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="text-slate-400 hover:text-white p-1 rounded focus:outline-none"
        >
          <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={mobileOpen ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'} />
          </svg>
        </button>
      </div>

      {/* Dark Navy Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-[#0a0f1d] border-r border-slate-800/80 flex flex-col justify-between transition-transform duration-200 md:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div>
          <div className="px-5 py-5 border-b border-slate-800/60 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2.5 no-underline">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-cyan-950">
                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div>
                <span className="font-bold text-base text-white tracking-tight block leading-tight">BioSteg</span>
                <span className="text-[10px] text-cyan-400 font-mono tracking-widest uppercase">E2EE • Stego</span>
              </div>
            </Link>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-1 mt-2">
            {navItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-medium transition-all ${
                    active
                      ? 'bg-gradient-to-r from-cyan-950/80 to-slate-900 text-cyan-400 border border-cyan-800/50 shadow-sm'
                      : 'text-slate-300 hover:text-white hover:bg-slate-900/60'
                  }`}
                >
                  <span className={active ? 'text-cyan-400' : 'text-slate-400'}>{item.icon}</span>
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Bottom User & Security Profile Section */}
        <div className="p-3 border-t border-slate-800/70 bg-[#070b14] space-y-3">
          {userEmail ? (
            <div className="px-2.5 py-2 rounded-lg bg-slate-900/80 border border-slate-800/80">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-slate-400 font-medium">SESSION</span>
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Active
                </span>
              </div>
              <p className="text-xs text-slate-200 truncate font-mono" title={userEmail}>
                {userEmail}
              </p>
              <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
                <span>E2EE Key</span>
                <span className={hasLocalKey ? 'text-cyan-400 font-mono' : 'text-amber-400 font-mono'}>
                  {hasLocalKey ? 'Ready (P-256)' : 'Needs Setup'}
                </span>
              </div>
            </div>
          ) : (
            <div className="px-2.5 py-2 rounded-lg bg-slate-900/40 border border-slate-800/60 text-center">
              <span className="text-xs text-slate-400 block mb-2">No active session</span>
              <div className="flex gap-2">
                <Link
                  href="/login"
                  className="flex-1 text-center py-1.5 px-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-medium"
                >
                  Login
                </Link>
                <Link
                  href="/register"
                  className="flex-1 text-center py-1.5 px-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-medium"
                >
                  Register
                </Link>
              </div>
            </div>
          )}

          {userEmail && (
            <div className="space-y-1.5">
              <LogoutButton />
              <PanicButton />
            </div>
          )}
        </div>
      </aside>

      {/* Backdrop overlay for mobile */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
        />
      )}
    </>
  );
}