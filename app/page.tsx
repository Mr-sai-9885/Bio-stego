import Link from 'next/link';
import { createSupabaseServer } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  let user = null;

  try {
    const supabase = await createSupabaseServer();
    // Use a quick timeout so an unreachable Supabase URL doesn't hang initial page load
    const userPromise = supabase.auth.getUser();
    const timeoutPromise = new Promise<{ data: { user: null } }>((resolve) =>
      setTimeout(() => resolve({ data: { user: null } }), 1200)
    );
    const { data } = await Promise.race([userPromise, timeoutPromise]);
    user = data?.user;
  } catch {
    user = null;
  }

  // If user is already authenticated, redirect straight to their dashboard
  if (user) {
    redirect('/dashboard');
  }

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-12 bg-white text-slate-900">
      {/* Hero Section */}
      <div className="text-center space-y-4 pt-4">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-cyan-50 border border-cyan-200 text-cyan-800 text-xs font-mono font-medium mb-2 shadow-sm">
          <span className="w-2 h-2 rounded-full bg-cyan-600 animate-pulse"></span>
          MILITARY-GRADE COVERT COMMUNICATION
        </div>

        <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-slate-900 tracking-tight leading-tight">
          BioSteg <span className="bg-gradient-to-r from-cyan-600 to-indigo-600 bg-clip-text text-transparent">Steganographic</span> Messaging
        </h1>

        <p className="text-sm md:text-base text-slate-600 max-w-2xl mx-auto leading-relaxed">
          Zero-knowledge peer-to-peer secure messaging. Messages are mathematically encrypted using ECDH-P256 and imperceptibly embedded into PNG image pixels, protected by FIDO2 WebAuthn biometric sensors.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
          <Link
            href="/login"
            className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white font-semibold text-xs md:text-sm px-6 py-3 rounded-xl shadow-lg shadow-cyan-900/20 transition-all flex items-center gap-2"
          >
            Sign In to Secure Inbox
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </Link>

          <Link
            href="/register"
            className="bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 font-semibold text-xs md:text-sm px-6 py-3 rounded-xl shadow-sm transition-colors"
          >
            Register Passkey Identity
          </Link>
        </div>
      </div>

      {/* 3 Pillars of BioSteg Architecture */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
        {/* Pillar 1 */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
          <div className="w-12 h-12 rounded-xl bg-cyan-50 border border-cyan-200 flex items-center justify-center text-cyan-600 mb-4">
            <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 004 11m0 0a8 8 0 008 8c.7 0 1.385-.06 2.05-.174" />
            </svg>
          </div>
          <h3 className="text-base font-bold text-slate-900 mb-2">WebAuthn Biometrics</h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            Decryption tokens are strictly gated behind local biometric verification (Touch ID, Windows Hello, Fingerprint). Without hardware verification, carriers cannot be retrieved.
          </p>
        </div>

        {/* Pillar 2 */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 mb-4">
            <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <h3 className="text-base font-bold text-slate-900 mb-2">Auto E2EE Key Exchange</h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            WhatsApp-grade asynchronous key exchange. Every message derives an ephemeral ECDH shared secret over NIST Curve P-256 with HKDF-SHA256 and authenticated AES-256-GCM.
          </p>
        </div>

        {/* Pillar 3 */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 mb-4">
            <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-base font-bold text-slate-900 mb-2">PNG LSB Steganography</h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            Encrypted byte streams are woven into the Least Significant Bits of red, green, and blue color channels of ordinary PNG photos. Invisible to visual inspection and statistical filters.
          </p>
        </div>
      </div>

      {/* Security Workflow Blueprint */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 md:p-8 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900 mb-1">Covert Transmission Protocol</h2>
        <p className="text-xs text-slate-500 mb-6">
          How secret messages traverse public networks safely without raising surveillance alerts
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <span className="font-mono text-cyan-600 font-bold block mb-1">01 / Encrypt</span>
            <p className="text-slate-600">
              Sender encrypts plaintext using the recipient&apos;s published ECDH public key and random ephemeral salt.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <span className="font-mono text-cyan-600 font-bold block mb-1">02 / Embed</span>
            <p className="text-slate-600">
              Ciphertext is encoded into the RGB channel LSBs of an ordinary cover PNG photo.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <span className="font-mono text-cyan-600 font-bold block mb-1">03 / Gate</span>
            <p className="text-slate-600">
              Carrier is uploaded to Supabase Storage. Download is locked until recipient passes WebAuthn biometric verification.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <span className="font-mono text-cyan-600 font-bold block mb-1">04 / Decrypt</span>
            <p className="text-slate-600">
              Recipient extracts bits from carrier and recovers the original plaintext using their device&apos;s private key.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}