'use client';

import { useState, useEffect } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import { embedPayloadInPng, createDefaultCarrierFile } from '@/lib/stego/pngLsb';
import { utf8ToBytes } from '@/lib/utils/encoding';
import { encryptForReceiver } from '@/lib/crypto/e2ee';

export default function SendMessageForm({
  initialReceiverId = '',
  initialPlaintext = '',
  onSent,
  onMessageSent,
  onClose,
  title = 'Embed & Send Steganographic Carrier',
}: {
  initialReceiverId?: string;
  initialPlaintext?: string;
  onSent?: () => void;
  onMessageSent?: (messageId: string, plaintext: string) => void;
  onClose?: () => void;
  title?: string;
}) {
  const supabase = createSupabaseBrowser();

  const [receiverId, setReceiverId] = useState(initialReceiverId);
  const [recipientType, setRecipientType] = useState<'email' | 'id'>(
    initialReceiverId ? 'id' : 'email'
  );
  const [cover, setCover] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [plaintext, setPlaintext] = useState(initialPlaintext);
  const [expirationHours, setExpirationHours] = useState('24');
  const [info, setInfo] = useState<{ type: 'error' | 'success' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [progressStep, setProgressStep] = useState<string>('');

  useEffect(() => {
    if (initialReceiverId) {
      setReceiverId(initialReceiverId);
      setRecipientType('id');
    }
  }, [initialReceiverId]);

  useEffect(() => {
    if (initialPlaintext) {
      setPlaintext(initialPlaintext);
    }
  }, [initialPlaintext]);

  // Handle cover image selection & preview
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) {
      setCover(null);
      setCoverPreview(null);
      return;
    }
    if (file.type !== 'image/png') {
      setInfo({ type: 'error', text: 'Carrier image must be a PNG file format.' });
      return;
    }
    setCover(file);
    const objectUrl = URL.createObjectURL(file);
    setCoverPreview(objectUrl);
    setInfo(null);
  }

  async function onSend() {
    setInfo(null);

    const recipientInput = receiverId.trim();
    if (!recipientInput) {
      return setInfo({
        type: 'error',
        text: recipientType === 'id'
          ? 'Enter recipient UUID.'
          : "Enter the recipient's email address.",
      });
    }
    if (!plaintext.trim()) {
      return setInfo({ type: 'error', text: 'Enter your secret message text.' });
    }

    setBusy(true);

    try {
      let rid = recipientInput;
      if (recipientType !== 'id') {
        setProgressStep('Finding recipient account...');
        const response = await fetch('/api/recipients/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: recipientType, identifier: recipientInput }),
        });
        const result = await response.json() as { recipientId?: string; error?: string };
        if (!response.ok || !result.recipientId) {
          throw new Error(result.error ?? 'Could not find the recipient account.');
        }
        rid = result.recipientId;
      }

      let activeCover = cover;
      if (!activeCover) {
        setProgressStep('Creating aesthetic default PNG carrier...');
        activeCover = await createDefaultCarrierFile();
        setCover(activeCover);
      }
      // 1) Verify current user session
      setProgressStep('Authenticating session...');
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userRes?.user) {
        throw new Error(userErr?.message ?? 'Please sign in to send messages.');
      }

      const senderId = userRes.user.id;
      if (rid === senderId) {
        throw new Error('Sender and recipient UUIDs cannot be identical.');
      }

      // 2) Fetch recipient public key
      setProgressStep('Querying recipient ECDH public key...');
      const { data: keyRow, error: keyErr } = await supabase
        .from('user_keys')
        .select('public_jwk')
        .eq('user_id', rid)
        .maybeSingle();

      if (keyErr) throw new Error(`Recipient key lookup failed: ${keyErr.message}`);
      if (!keyRow?.public_jwk) {
        throw new Error(
          'Recipient has not registered an ECDH public key yet. The recipient must log in once to run Key Setup.'
        );
      }

      // 3) Encrypt plaintext using ECDH-P256 + HKDF + AES-256-GCM
      setProgressStep('Encrypting payload with ECDH-P256 & AES-256-GCM...');
      const payloadObj = await encryptForReceiver(plaintext, keyRow.public_jwk);

      // 4) Steganography: Embed encrypted payload bytes into PNG LSB
      setProgressStep('Embedding ciphertext into PNG Least Significant Bits (LSB)...');
      const payloadBytes = utf8ToBytes(JSON.stringify(payloadObj));
      const stegoBlob = await embedPayloadInPng(activeCover, payloadBytes);

      // 5) Upload Stego Carrier to Supabase Storage
      setProgressStep('Uploading carrier image to secure storage...');
      const messageId = crypto.randomUUID();
      const filePath = `${senderId}/${messageId}.png`;

      const uploadRes = await supabase.storage.from('carriers').upload(filePath, stegoBlob, {
        contentType: 'image/png',
        upsert: false,
      });

      if (uploadRes.error) {
        throw new Error(`Carrier storage upload failed: ${uploadRes.error.message}`);
      }

      // 6) Calculate expiration timestamp
      const hoursNum = parseInt(expirationHours, 10) || 24;
      const expiresAt = new Date(Date.now() + hoursNum * 60 * 60 * 1000).toISOString();

      // 7) Insert message record into database
      setProgressStep('Finalizing message registration...');
      const { error: insertErr } = await supabase.from('messages').insert({
        id: messageId,
        sender_id: senderId,
        receiver_id: rid,
        file_path: filePath,
        carrier_type: 'image',
        mime_type: 'image/png',
        size_bytes: stegoBlob.size,
        status: 'sent',
        expires_at: expiresAt,
      });

      if (insertErr) {
        throw new Error(`Database insert failed: ${insertErr.message}`);
      }

      setInfo({
        type: 'success',
        text: `Message encrypted and embedded successfully! (ID: ${messageId.slice(0, 8)}..., size: ${stegoBlob.size} bytes)`,
      });

      onMessageSent?.(messageId, plaintext);

      // Reset form fields
      setPlaintext('');
      setCover(null);
      setCoverPreview(null);
      onSent?.();
      if (onClose) {
        setTimeout(() => onClose(), 1200);
      }
    } catch (e: any) {
      setInfo({ type: 'error', text: e?.message ?? 'Send operation failed' });
    } finally {
      setBusy(false);
      setProgressStep('');
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm text-slate-900">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-cyan-50 text-cyan-600 flex items-center justify-center">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">{title}</h3>
            <p className="text-xs text-slate-500">
              End-to-End encrypted & invisible inside a PNG cover photo
            </p>
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-md text-sm cursor-pointer"
            title="Close"
          >
            ✕
          </button>
        )}
      </div>

      {info && (
        <div
          className={`p-3 rounded-lg mb-4 text-xs flex items-center gap-2 ${
            info.type === 'error'
              ? 'bg-red-50 border border-red-200 text-red-700'
              : info.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
              : 'bg-cyan-50 border border-cyan-200 text-cyan-700'
          }`}
        >
          <span>{info.type === 'error' ? '⚠️' : '✓'}</span>
          <span>{info.text}</span>
        </div>
      )}

      <div className="space-y-4">
        {/* Recipient lookup */}
        <div>
          <label htmlFor="recipient-type" className="block text-xs font-semibold text-slate-700 mb-1">
            Send to
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              id="recipient-type"
              value={recipientType}
              onChange={(e) => {
                const value = e.target.value;
                if (value === 'email' || value === 'id') {
                  setRecipientType(value);
                  setReceiverId('');
                }
              }}
              disabled={busy}
              className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-cyan-600"
            >
              <option value="email">Email address</option>
              <option value="id">User ID (advanced)</option>
            </select>
            <input
              type={recipientType === 'email' ? 'email' : 'text'}
              value={receiverId}
              onChange={(e) => setReceiverId(e.target.value)}
              placeholder={
                recipientType === 'email'
                  ? 'name@example.com'
                  : 'Recipient UUID'
              }
              className="min-w-0 flex-1 bg-slate-50 border border-slate-300 rounded-lg px-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-cyan-600 focus:bg-white"
              disabled={busy}
            />
          </div>
        </div>

        {/* Carrier Image Selector */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Carrier Image (PNG Only)
          </label>
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <label className="cursor-pointer bg-slate-50 hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs px-3.5 py-2 rounded-lg flex items-center gap-2 transition-colors">
              <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {cover ? 'Change PNG' : 'Select PNG Cover'}
              <input
                type="file"
                accept="image/png"
                onChange={handleFileChange}
                disabled={busy}
                className="hidden"
              />
            </label>

            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                const auto = await createDefaultCarrierFile();
                setCover(auto);
                setCoverPreview(URL.createObjectURL(auto));
              }}
              className="bg-cyan-50 hover:bg-cyan-100 text-cyan-800 border border-cyan-200 text-xs px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <span>⚡</span>
              <span>Use Default Gradient Carrier</span>
            </button>

            {cover && (
              <div className="flex items-center gap-3">
                {coverPreview && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={coverPreview}
                    alt="Carrier Preview"
                    className="w-10 h-10 object-cover rounded-md border border-slate-300"
                  />
                )}
                <div className="text-xs text-slate-700">
                  <span className="font-mono block truncate max-w-xs font-semibold">{cover.name}</span>
                  <span className="text-[11px] text-slate-500">
                    {(cover.size / 1024).toFixed(1)} KB
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Secret Message Textarea */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-semibold text-slate-700">
              Secret Plaintext
            </label>
            <span className="text-[11px] text-slate-500">
              {plaintext.length} characters
            </span>
          </div>
          <textarea
            value={plaintext}
            onChange={(e) => setPlaintext(e.target.value)}
            placeholder="Type your confidential message here. It will be encrypted with the recipient's ECDH key and embedded into the PNG pixels..."
            rows={3}
            disabled={busy}
            className="w-full bg-slate-50 border border-slate-300 rounded-lg p-3 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-cyan-600 focus:bg-white resize-none font-sans"
          />
        </div>

        {/* Expiration Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-600 font-medium">Self-Destruct:</label>
            <select
              value={expirationHours}
              onChange={(e) => setExpirationHours(e.target.value)}
              disabled={busy}
              className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-xs text-slate-800 focus:outline-none"
            >
              <option value="1">1 Hour</option>
              <option value="6">6 Hours</option>
              <option value="24">24 Hours (Default)</option>
              <option value="72">3 Days</option>
              <option value="168">7 Days</option>
            </select>
          </div>

          <button
            onClick={onSend}
            disabled={busy}
            className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2 rounded-lg flex items-center justify-center gap-2 shadow-sm transition-all self-end sm:self-auto cursor-pointer"
          >
            {busy ? (
              <>
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeDasharray="30 60" />
                </svg>
                {progressStep || 'Processing...'}
              </>
            ) : (
              'Encrypt & Embed into PNG'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}