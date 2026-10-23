import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseServer } from '@/lib/supabase/server';
import KeySetup from '@/components/KeySetup';

export const dynamic = 'force-dynamic';

export default async function KeysPage() {
  const supabase = await createSupabaseServer();
  const { data } = await supabase.auth.getUser();

  if (!data?.user) {
    redirect('/login');
  }

  return (
    <div className="space-y-6 bg-white text-slate-900 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
              ZERO-KNOWLEDGE IDENTITY
            </span>
            <span className="text-xs text-slate-400 font-mono">ECDH-P256 + HKDF</span>
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
            Cryptographic Key Setup & Passkey Vault
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage your local private decryption key and publish your public key to the BioSteg directory
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/messages"
            className="inline-flex items-center gap-1.5 bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-all shadow-sm cursor-pointer"
          >
            <span>💬</span>
            <span>Return to Messages</span>
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold px-3.5 py-2 rounded-xl transition-all border border-slate-200 cursor-pointer"
          >
            <span>Dashboard</span>
          </Link>
        </div>
      </div>

      {/* Primary Key Setup Component */}
      <KeySetup />

      {/* Security Architectural Notes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
          <div className="flex items-center gap-2 mb-2 text-indigo-700 font-semibold text-xs">
            <span>🛡️</span>
            <span>Zero-Knowledge Private Key Storage</span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Your private key is generated client-side inside this browser using the W3C Web Cryptography API.
            It is <strong>never transmitted</strong> to any server, database, or external service.
            Only your matching public key is published so senders can encrypt hidden payloads for you.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
          <div className="flex items-center gap-2 mb-2 text-emerald-700 font-semibold text-xs">
            <span>👆</span>
            <span>Biometric Hardware Gating</span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Steganographic carrier bytes in storage are gated behind biometric verification (Touch ID, Windows Hello).
            Even if an attacker gains physical access or downloads the carrier, they cannot decrypt the ciphertext
            without both your biometric signature and your private key.
          </p>
        </div>
      </div>
    </div>
  );
}
