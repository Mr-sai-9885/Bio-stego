'use client';

import { useState } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase/client';

export default function DownloadCarrier({ filePath }: { filePath: string }) {
  const supabase = createSupabaseBrowser();
  const [busy, setBusy] = useState(false);

  async function open() {
    setBusy(true);
    try {
      const { data, error } = await supabase.storage.from('carriers').download(filePath);
      if (error) throw error;

      const url = URL.createObjectURL(data);
      window.open(url, '_blank');
    } catch (err: any) {
      alert(`Carrier download failed: ${err?.message ?? 'Unknown error'}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={open}
      disabled={busy}
      className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-xs px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
      title="Download raw steganography carrier image"
    >
      <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
      {busy ? 'Downloading...' : 'Carrier Image'}
    </button>
  );
}