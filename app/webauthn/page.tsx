'use client';

import { useState, useEffect } from 'react';
import { registerPasskey, verifyBiometric, getBiometricStatus } from '@/lib/webauthn/browser';

export default function WebauthnPage() {
  const [statusVerified, setStatusVerified] = useState<boolean | null>(null);
  const [deviceCompatible, setDeviceCompatible] = useState<boolean | null>(null);
  const [busyAction, setBusyAction] = useState<'register' | 'verify' | 'check' | null>(null);
  const [msg, setMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  useEffect(() => {
    // Check browser compatibility for WebAuthn
    if (typeof window !== 'undefined') {
      const isAvailable = !!(
        window.PublicKeyCredential &&
        typeof window.PublicKeyCredential === 'function'
      );
      setDeviceCompatible(isAvailable);
    }

    // Check current biometric status on mount
    (async () => {
      try {
        const s = await getBiometricStatus();
        setStatusVerified(s?.verified ?? false);
      } catch {
        setStatusVerified(false);
      }
    })();
  }, []);

  async function handleRegisterPasskey() {
    setBusyAction('register');
    setMsg(null);
    try {
      await registerPasskey();
      setMsg({
        type: 'success',
        text: 'Passkey registered successfully! Your biometric authenticator is now linked.',
      });
      const s = await getBiometricStatus();
      setStatusVerified(s?.verified ?? false);
    } catch (e: any) {
      setMsg({
        type: 'error',
        text: e?.message ?? 'Passkey registration could not be completed.',
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleVerifyBiometric() {
    setBusyAction('verify');
    setMsg(null);
    try {
      await verifyBiometric();
      setMsg({
        type: 'success',
        text: 'Biometric verification passed! Secure UV session cookie issued.',
      });
      setStatusVerified(true);
    } catch (e: any) {
      setMsg({
        type: 'error',
        text: e?.message ?? 'Biometric verification failed or was cancelled.',
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCheckStatus() {
    setBusyAction('check');
    setMsg(null);
    try {
      const s = await getBiometricStatus();
      setStatusVerified(s?.verified ?? false);
      setMsg({
        type: 'info',
        text: s?.verified
          ? 'Biometric session is ACTIVE (User Verified). You can decrypt secret messages.'
          : 'No active biometric session found. Please verify using fingerprint / passkey.',
      });
    } catch (e: any) {
      setMsg({
        type: 'error',
        text: e?.message ?? 'Failed to check biometric status.',
      });
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 bg-white text-slate-900">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-sky-50 via-slate-50 to-indigo-50 border border-slate-200 rounded-2xl p-6 shadow-sm relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-cyan-100 border border-cyan-200 flex items-center justify-center text-cyan-700 shadow-sm">
              <svg width="28" height="28" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 004 11m0 0a8 8 0 008 8c.7 0 1.385-.06 2.05-.174" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
                  WebAuthn Biometric Security
                </h1>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-cyan-100 border border-cyan-300 text-cyan-800 font-semibold">
                  FIDO2 / UV
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1">
                Hardware-backed biometric passkeys gating server-side message decryption access
              </p>
            </div>
          </div>

          {/* Quick status pill */}
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 flex items-center gap-3 shadow-sm">
            <span className="text-xs text-slate-500 font-medium">UV Session:</span>
            <div className="flex items-center gap-1.5 font-mono text-xs font-semibold">
              <span
                className={`w-2 h-2 rounded-full ${
                  statusVerified ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                }`}
              />
              <span className={statusVerified ? 'text-emerald-700' : 'text-amber-700'}>
                {statusVerified === null
                  ? 'Checking...'
                  : statusVerified
                  ? 'Verified'
                  : 'Unverified'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Device Compatibility Alert */}
      {deviceCompatible === false && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800 flex items-center gap-3">
          <span className="text-lg">⚠️</span>
          <div>
            <strong>Device Not Compatible:</strong> WebAuthn (PublicKeyCredential) is not supported in this browser. Please use Chrome, Edge, Safari, or Firefox with biometric hardware enabled.
          </div>
        </div>
      )}

      {/* Feedback Alert */}
      {msg && (
        <div
          className={`p-4 rounded-xl text-xs flex items-center gap-3 ${
            msg.type === 'error'
              ? 'bg-red-50 border border-red-200 text-red-700'
              : msg.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
              : 'bg-cyan-50 border border-cyan-200 text-cyan-700'
          }`}
        >
          <span className="text-sm">
            {msg.type === 'error' ? '❌' : msg.type === 'success' ? '✅' : 'ℹ️'}
          </span>
          <span className="flex-1">{msg.text}</span>
          <button
            onClick={() => setMsg(null)}
            className="text-slate-400 hover:text-slate-700 text-xs px-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Actions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Register Passkey */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between shadow-sm">
          <div>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-slate-900 mb-1">1. Register Passkey</h3>
            <p className="text-xs text-slate-500 leading-relaxed mb-4">
              Bind your device&apos;s fingerprint scanner, Touch ID, Windows Hello, or hardware key to your account.
            </p>
          </div>
          <button
            onClick={handleRegisterPasskey}
            disabled={busyAction !== null || deviceCompatible === false}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold py-2.5 px-3 rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            {busyAction === 'register' ? (
              <>
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeDasharray="30 60" />
                </svg>
                Registering Sensor...
              </>
            ) : (
              'Register Passkey'
            )}
          </button>
        </div>

        {/* Card 2: Verify Biometrics */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between shadow-sm">
          <div>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-slate-900 mb-1">2. Verify Biometrics</h3>
            <p className="text-xs text-slate-500 leading-relaxed mb-4">
              Touch the biometric sensor to verify your identity and obtain an active <code className="text-cyan-700 font-mono">bsteg_uv</code> session cookie.
            </p>
          </div>
          <button
            onClick={handleVerifyBiometric}
            disabled={busyAction !== null || deviceCompatible === false}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold py-2.5 px-3 rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            {busyAction === 'verify' ? (
              <>
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeDasharray="30 60" />
                </svg>
                Scanning Biometrics...
              </>
            ) : (
              'Scan Biometrics Now'
            )}
          </button>
        </div>

        {/* Card 3: Check Status */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between shadow-sm">
          <div>
            <div className="w-8 h-8 rounded-lg bg-cyan-50 text-cyan-600 flex items-center justify-center mb-3">
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-slate-900 mb-1">3. Live Status Check</h3>
            <p className="text-xs text-slate-500 leading-relaxed mb-4">
              Validate current backend verification status against server policies and token expiration.
            </p>
          </div>
          <button
            onClick={handleCheckStatus}
            disabled={busyAction !== null}
            className="w-full bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold py-2.5 px-3 rounded-lg flex items-center justify-center gap-2 transition-colors border border-slate-300 cursor-pointer"
          >
            {busyAction === 'check' ? (
              <>
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeDasharray="30 60" />
                </svg>
                Querying Status...
              </>
            ) : (
              'Check Status'
            )}
          </button>
        </div>
      </div>

      {/* Security Architecture Reference */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-2">
          <span>🛡️</span> Zero-Knowledge Biometric Architecture
        </h3>
        <p className="text-xs text-slate-600 leading-relaxed mb-3">
          BioSteg never stores raw fingerprint or biometric imagery. WebAuthn operates entirely inside your hardware device&apos;s Secure Enclave / TPM. When you touch the biometric sensor, a cryptographic signature is generated and verified server-side via SimpleWebAuthn.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-700">
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
            <span className="font-semibold text-cyan-800 block mb-1">Decryption Gateway</span>
            The server decrypt endpoint (<code className="text-slate-600 font-mono text-[11px]">/api/messages/decrypt</code>) will refuse to release steganographic carrier bytes unless your biometric cookie is actively verified.
          </div>
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
            <span className="font-semibold text-emerald-800 block mb-1">Hardware Isolation</span>
            Your private key remains safely inside local browser storage and hardware tokens. Even if an attacker gains database access, they cannot decrypt carriers without your biometric signature.
          </div>
        </div>
      </div>
    </div>
  );
}