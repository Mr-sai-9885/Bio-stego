'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import Link from 'next/link';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import DecryptMessage from '@/components/DecryptMessage';
import VerifyContactButton from '@/components/VerifyContactButton';
import SendMessageForm from '@/components/SendMessageForm';
import { getAllContactAliases, setContactAlias } from '@/lib/utils/contactAliases';
import { getAllDecryptedMessages, setDecryptedMessage } from '@/lib/utils/decryptedCache';

export type MessageRow = {
  id: string;
  sender_id: string;
  receiver_id: string;
  file_path: string;
  status: string;
  created_at: string;
  expires_at: string | null;
  carrier_type?: string;
  mime_type?: string;
  size_bytes?: number;
};

type ContactRow = {
  user_id: string;
  contact_user_id: string;
  verified: boolean;
};

function upsert(list: MessageRow[], row: MessageRow) {
  const i = list.findIndex((m) => m.id === row.id);
  if (i === -1) return [row, ...list];
  const copy = [...list];
  copy[i] = row;
  return copy;
}

function isExpired(expiresAt: string | null) {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() <= Date.now();
}

function fmt(ts: string | null) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return (
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) +
    ' ' +
    d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  );
}

type FilterCategory = 'all' | 'verified' | 'unknown' | 'sent' | 'expiring';

export default function RealtimeMessages({
  initialMessages,
  userId,
  initialVerifiedContactIds,
  defaultSelectedPeer = '',
}: {
  initialMessages: MessageRow[];
  userId: string;
  initialVerifiedContactIds: string[];
  defaultSelectedPeer?: string;
}) {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [messages, setMessages] = useState<MessageRow[]>(initialMessages);
  const [verifiedIds, setVerifiedIds] = useState<Set<string>>(() => new Set(initialVerifiedContactIds));
  const [aliases, setAliases] = useState<Record<string, string>>({});
  const [peerEmails, setPeerEmails] = useState<Record<string, string>>({});
  const [peerEmailError, setPeerEmailError] = useState('');
  const [decryptedMap, setDecryptedMap] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<FilterCategory>('all');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPeer, setSelectedPeer] = useState<string>(defaultSelectedPeer);

  // Compact chat bar states
  const [quickText, setQuickText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Modal for full carrier embed or new stego message
  const [showCarrierModal, setShowCarrierModal] = useState(false);
  const [modalInitialText, setModalInitialText] = useState('');
  const [modalInitialReceiverId, setModalInitialReceiverId] = useState('');

  // Editing contact alias in chat header
  const [isEditingAlias, setIsEditingAlias] = useState(false);
  const [tempAlias, setTempAlias] = useState('');

  useEffect(() => setMessages(initialMessages), [initialMessages]);
  useEffect(() => setVerifiedIds(new Set(initialVerifiedContactIds)), [initialVerifiedContactIds]);

  // Load contact aliases and cached decrypted messages
  useEffect(() => {
    if (userId) {
      setAliases(getAllContactAliases(userId));
      setDecryptedMap(getAllDecryptedMessages(userId));
    }

    function onAliasChange() {
      if (userId) {
        setAliases(getAllContactAliases(userId));
      }
    }

    function onDecryptedChange() {
      if (userId) {
        setDecryptedMap(getAllDecryptedMessages(userId));
      }
    }

    window.addEventListener('contact_alias_updated', onAliasChange);
    window.addEventListener('bsteg_decrypted_updated', onDecryptedChange);
    return () => {
      window.removeEventListener('contact_alias_updated', onAliasChange);
      window.removeEventListener('bsteg_decrypted_updated', onDecryptedChange);
    };
  }, [userId]);

  // Auto-scroll to bottom of chat when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, selectedPeer, decryptedMap]);

  // Realtime subscriptions
  useEffect(() => {
    const inboxChannel = supabase
      .channel(`messages_inbox_${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${userId}` },
        async (payload) => {
          const row = payload.new as MessageRow;
          setMessages((prev) => upsert(prev, row));

          if (row.status === 'sent') {
            await supabase.from('messages').update({ status: 'delivered' }).eq('id', row.id);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `receiver_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as MessageRow;
          setMessages((prev) => upsert(prev, row));
        }
      )
      .subscribe();

    const outboxChannel = supabase
      .channel(`messages_outbox_${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `sender_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as MessageRow;
          setMessages((prev) => upsert(prev, row));
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `sender_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as MessageRow;
          setMessages((prev) => upsert(prev, row));
        }
      )
      .subscribe();

    const contactsChannel = supabase
      .channel(`contacts_${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'contacts', filter: `user_id=eq.${userId}` },
        (payload) => {
          const ev = payload.eventType;
          const row = (payload.new ?? payload.old) as ContactRow;

          setVerifiedIds((prev) => {
            const next = new Set(prev);
            if (ev === 'DELETE') {
              next.delete(row.contact_user_id);
              return next;
            }
            if (row.verified) next.add(row.contact_user_id);
            else next.delete(row.contact_user_id);
            return next;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(inboxChannel);
      supabase.removeChannel(outboxChannel);
      supabase.removeChannel(contactsChannel);
    };
  }, [supabase, userId]);

  // Group messages by peer
  const peerList = useMemo(() => {
    const peersMap = new Map<string, { lastMessage: MessageRow; count: number }>();

    for (const m of messages) {
      const peer = m.sender_id === userId ? m.receiver_id : m.sender_id;
      if (!peersMap.has(peer)) {
        peersMap.set(peer, { lastMessage: m, count: 1 });
      } else {
        const item = peersMap.get(peer)!;
        item.count += 1;
      }
    }

    return Array.from(peersMap.entries()).map(([peerId, data]) => ({
      peerId,
      ...data,
      isVerified: verifiedIds.has(peerId),
      alias: aliases[peerId] || null,
    }));
  }, [messages, userId, verifiedIds, aliases]);

  // Set default peer if not selected
  useEffect(() => {
    if (!selectedPeer && peerList.length > 0) {
      setSelectedPeer(peerList[0].peerId);
    }
  }, [peerList, selectedPeer]);

  // Filter conversations
  const filteredPeers = useMemo(() => {
    return peerList.filter(({ peerId, lastMessage, isVerified, alias }) => {
      const q = searchQuery.toLowerCase().trim();
      if (q) {
        const matchesPeer = peerId.toLowerCase().includes(q);
        const matchesAlias = alias ? alias.toLowerCase().includes(q) : false;
        const matchesEmail = peerEmails[peerId]?.toLowerCase().includes(q) ?? false;
        if (!matchesPeer && !matchesAlias && !matchesEmail) return false;
      }
      if (filter === 'verified') return isVerified;
      if (filter === 'unknown') return !isVerified && lastMessage.sender_id !== userId;
      if (filter === 'sent') return lastMessage.sender_id === userId;
      if (filter === 'expiring') return isExpired(lastMessage.expires_at);
      return true;
    });
  }, [peerList, searchQuery, filter, userId, peerEmails]);

  // Messages for active thread
  const activeConversationMessages = useMemo(() => {
    if (!selectedPeer) return [];
    return messages
      .filter(
        (m) =>
          (m.sender_id === userId && m.receiver_id === selectedPeer) ||
          (m.sender_id === selectedPeer && m.receiver_id === userId)
      )
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [messages, userId, selectedPeer]);

  const peerIdsKey = useMemo(
    () =>
      Array.from(
        new Set([
          ...messages.map((message) => (
            message.sender_id === userId ? message.receiver_id : message.sender_id
          )),
          ...(selectedPeer ? [selectedPeer] : []),
        ])
      ).join(','),
    [messages, userId, selectedPeer]
  );

  useEffect(() => {
    if (!peerIdsKey) {
      setPeerEmails({});
      setPeerEmailError('');
      return;
    }

    const controller = new AbortController();
    async function loadPeerEmails() {
      try {
        const response = await fetch('/api/messages/peers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ peerIds: peerIdsKey.split(',') }),
          signal: controller.signal,
        });
        const result = await response.json() as { emails?: Record<string, string>; error?: string };
        if (!response.ok || !result.emails) {
          throw new Error(result.error ?? 'Could not load message contact emails.');
        }
        setPeerEmails(result.emails);
        setPeerEmailError('');
      } catch (error) {
        if (controller.signal.aborted) return;
        setPeerEmailError(
          error instanceof Error ? error.message : 'Could not load message contact emails.'
        );
      }
    }

    void loadPeerEmails();
    return () => controller.abort();
  }, [peerIdsKey]);

  const isSelectedPeerVerified = verifiedIds.has(selectedPeer);
  const selectedPeerAlias = aliases[selectedPeer] || null;
  const selectedPeerEmail = peerEmails[selectedPeer] || null;

  function handleSaveAlias() {
    if (!selectedPeer || !userId) return;
    setContactAlias(userId, selectedPeer, tempAlias);
    setAliases(getAllContactAliases(userId));
    setIsEditingAlias(false);
  }

  // Open the carrier modal with the typed message ready to embed and send.
  function handleQuickSend(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const textToSend = quickText.trim();
    if (!textToSend) return;

    setModalInitialReceiverId(selectedPeer);
    setModalInitialText(textToSend);
    setShowCarrierModal(true);
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-xl flex flex-col md:flex-row h-[80vh] overflow-hidden text-slate-900">
      {/* LEFT PANE: Conversations Directory */}
      <div className="w-full md:w-80 lg:w-96 border-b md:border-b-0 md:border-r border-slate-200 flex flex-col bg-slate-50">
        {/* Search & New Message Header */}
        <div className="p-3.5 border-b border-slate-200 space-y-2.5 bg-white">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 tracking-wide">Secure Chats</h2>
            <button
              onClick={() => {
                setModalInitialReceiverId('');
                setModalInitialText('');
                setShowCarrierModal(true);
              }}
              className="bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-semibold px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
            >
              <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              New Stego
            </button>
          </div>

          {/* Search Box */}
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or email..."
              className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-cyan-600 focus:bg-white"
            />
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          {/* Category Filter Pills */}
          <div className="flex gap-1 overflow-x-auto pb-0.5 text-[11px] font-medium no-scrollbar">
            {(['all', 'verified', 'unknown', 'sent', 'expiring'] as FilterCategory[]).map((cat) => (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                className={`px-2.5 py-1 rounded-md capitalize transition-colors shrink-0 cursor-pointer ${
                  filter === cat
                    ? 'bg-cyan-100 text-cyan-900 font-bold border border-cyan-300'
                    : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-200">
          {filteredPeers.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              <p>No conversations found.</p>
              <button
                onClick={() => {
                  setModalInitialReceiverId('');
                  setModalInitialText('');
                  setShowCarrierModal(true);
                }}
                className="mt-2 text-cyan-700 font-semibold hover:underline cursor-pointer"
              >
                Send first stego message
              </button>
            </div>
          ) : (
            filteredPeers.map(({ peerId, lastMessage, isVerified, count, alias }) => {
              const active = selectedPeer === peerId;
              const expired = isExpired(lastMessage.expires_at);
              const hasDecrypted = !!decryptedMap[lastMessage.id];

              return (
                <div
                  key={peerId}
                  onClick={() => setSelectedPeer(peerId)}
                  className={`p-3 cursor-pointer transition-colors flex items-start gap-3 ${
                    active
                      ? 'bg-white border-l-4 border-cyan-600 shadow-xs'
                      : 'hover:bg-slate-100/70'
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-cyan-100 border border-cyan-200 flex items-center justify-center text-cyan-800 font-bold text-xs shrink-0 relative">
                    {(alias || peerEmails[peerId] || peerId).slice(0, 2).toUpperCase()}
                    {isVerified && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className="text-xs font-bold text-slate-900 truncate">
                        {alias || peerEmails[peerId] || 'Email unavailable'}
                      </span>
                      <span suppressHydrationWarning className="text-[10px] text-slate-500 shrink-0">
                        {mounted ? fmt(lastMessage.created_at).split(' ')[0] : ''}
                      </span>
                    </div>

                    {alias && peerEmails[peerId] && (
                      <span className="text-[10px] text-slate-400 truncate block">
                        {peerEmails[peerId]}
                      </span>
                    )}

                    <div className="flex items-center justify-between text-[11px] text-slate-500 mt-0.5">
                      <span className="truncate flex items-center gap-1 font-sans">
                        {lastMessage.sender_id === userId ? (
                          <span className="text-cyan-700 font-semibold">You: </span>
                        ) : null}
                        {expired ? (
                          <span className="text-red-600 italic">Self-destructed</span>
                        ) : hasDecrypted ? (
                          <span className="text-slate-700 font-normal truncate">
                            {decryptedMap[lastMessage.id]}
                          </span>
                        ) : (
                          <span className="italic text-slate-400">🔒 Encrypted Stego</span>
                        )}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-200 text-slate-700 font-semibold">
                        {count}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* RIGHT PANE: Chat Stream & WhatsApp-style Type Box */}
      <div className="flex-1 flex flex-col bg-white h-full overflow-hidden">
        {selectedPeer ? (
          <>
            {/* Chat Room Header */}
            <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-cyan-100 border border-cyan-200 flex items-center justify-center text-cyan-800 font-bold text-sm shrink-0 shadow-xs">
                  {selectedPeerAlias
                    ? selectedPeerAlias.slice(0, 2).toUpperCase()
                    : (selectedPeerEmail || selectedPeer).slice(0, 2).toUpperCase()}
                </div>

                <div className="min-w-0">
                  {isEditingAlias ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={tempAlias}
                        onChange={(e) => setTempAlias(e.target.value)}
                        placeholder="Contact name..."
                        className="bg-white border border-cyan-600 rounded px-2 py-0.5 text-xs text-slate-900 focus:outline-none"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveAlias();
                          if (e.key === 'Escape') setIsEditingAlias(false);
                        }}
                      />
                      <button
                        onClick={handleSaveAlias}
                        className="bg-cyan-600 text-white text-[11px] px-2 py-0.5 rounded font-medium cursor-pointer"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setIsEditingAlias(false)}
                        className="text-slate-500 text-[11px] px-1 cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900 truncate">
                        {selectedPeerAlias || selectedPeerEmail || 'Email unavailable'}
                      </span>
                      <button
                        onClick={() => {
                          setTempAlias(selectedPeerAlias || '');
                          setIsEditingAlias(true);
                        }}
                        className="text-slate-400 hover:text-cyan-700 p-0.5 rounded cursor-pointer"
                        title="Change sender name in wishlist"
                      >
                        <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                          isSelectedPeerVerified
                            ? 'bg-emerald-100 border border-emerald-300 text-emerald-800'
                            : 'bg-amber-100 border border-amber-300 text-amber-800'
                        }`}
                      >
                        {isSelectedPeerVerified ? 'Verified Contact' : 'Unverified Peer'}
                      </span>
                    </div>
                  )}

                  {peerEmailError ? (
                    <span role="status" className="text-[10px] text-amber-700 block truncate">
                      {peerEmailError}
                    </span>
                  ) : selectedPeerEmail ? (
                    <span className="text-[10px] text-slate-500 block truncate">{selectedPeerEmail}</span>
                  ) : (
                    <span className="text-[10px] text-slate-400 block truncate">Email unavailable</span>
                  )}
                </div>
              </div>

              {/* Verify Contact Action if unverified */}
              {!isSelectedPeerVerified && (
                <VerifyContactButton
                  contactUserId={selectedPeer}
                  onVerified={(id) => setVerifiedIds((prev) => new Set(prev).add(id))}
                />
              )}
            </div>

            {/* SPACIOUS WhatsApp-Style Message Stream */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-3 bg-white">
              {activeConversationMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs">
                  <div className="w-12 h-12 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center mb-2 text-xl">
                    💬
                  </div>
                  <span className="font-semibold text-slate-600">No messages yet.</span>
                  <span className="text-[11px] text-slate-400 mt-1">
                    Send a message below. Once biometrically verified, messages appear as clean text just like WhatsApp!
                  </span>
                </div>
              ) : (
                activeConversationMessages.map((m) => {
                  const isMine = m.sender_id === userId;
                  const expired = isExpired(m.expires_at);
                  const decryptedContent = decryptedMap[m.id];

                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-md rounded-2xl px-4 py-2.5 shadow-xs ${
                          isMine
                            ? 'bg-cyan-700 text-white rounded-tr-none'
                            : 'bg-slate-100 border border-slate-200 text-slate-900 rounded-tl-none'
                        }`}
                      >
                        {/* CASE 1: Expired message */}
                        {expired ? (
                          <div className="text-xs text-red-700 font-semibold bg-red-100/80 border border-red-300 rounded-lg p-2 text-center">
                            ⌛ Message expired (Self-destructed)
                          </div>
                        ) : decryptedContent ? (
                          /* CASE 2: DECRYPTED & VERIFIED -> TRUE WHATSAPP TEXT (NO CARRIER BADGE) */
                          <div>
                            <p className="text-sm whitespace-pre-wrap leading-relaxed select-text font-normal">
                              {decryptedContent}
                            </p>
                            <div
                              className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
                                isMine ? 'text-cyan-200' : 'text-slate-400'
                              }`}
                            >
                              <span suppressHydrationWarning>{mounted ? fmt(m.created_at) : ''}</span>
                              {isMine && <span className="font-bold">✓✓</span>}
                            </div>
                          </div>
                        ) : isMine ? (
                          /* CASE 3: Outgoing stego message (awaiting local cache or sent in earlier session) */
                          <div>
                            <div className="flex items-center gap-1.5 text-xs text-cyan-100 font-medium">
                              <span>🔒</span>
                              <span>Encrypted Stego Message</span>
                            </div>
                            <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-cyan-200">
                              <span suppressHydrationWarning>{mounted ? fmt(m.created_at) : ''}</span>
                              <span className="font-bold">✓</span>
                            </div>
                          </div>
                        ) : (
                          /* CASE 4: Incoming message not yet biometrically decrypted */
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-lg">🔒</span>
                              <div>
                                <span className="text-xs font-bold text-slate-900 block">
                                  Encrypted Stego Message
                                </span>
                                <span className="text-[10px] text-slate-500">
                                  Carrier received • Biometric verification required
                                </span>
                              </div>
                            </div>

                            <DecryptMessage
                              messageId={m.id}
                              filePath={m.file_path}
                              onDecrypted={(txt) => {
                                setDecryptedMap((prev) => ({ ...prev, [m.id]: txt }));
                              }}
                            />

                            <div suppressHydrationWarning className="mt-2 text-right text-[10px] text-slate-400">
                              {mounted ? fmt(m.created_at) : ''}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* COMPACT WHATSAPP-STYLE BOTTOM TYPE BOX */}
            <div className="p-3 bg-slate-50 border-t border-slate-200">
              <form onSubmit={handleQuickSend} className="flex items-center gap-2">
                {/* Clean Type Box */}
                <input
                  type="text"
                  value={quickText}
                  onChange={(e) => setQuickText(e.target.value)}
                  placeholder="Type secret message... (Click Send to embed into PNG)"
                  className="flex-1 bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-xs md:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-cyan-600 focus:ring-1 focus:ring-cyan-600 shadow-xs"
                />

                {/* Send Button */}
                <button
                  type="submit"
                  disabled={!quickText.trim()}
                  className="bg-cyan-600 hover:bg-cyan-700 disabled:opacity-40 text-white font-semibold text-xs md:text-sm px-4 py-2.5 rounded-xl shadow-sm transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <span>Send</span>
                  <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="h-full flex items-center justify-center text-slate-400 text-xs bg-white">
            Select a conversation on the left to start viewing secure messages.
          </div>
        )}
      </div>

      {/* Pop-up Carrier Modal when clicking Send or New Stego */}
      {showCarrierModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-xl w-full p-2 shadow-2xl relative">
            <SendMessageForm
              initialReceiverId={modalInitialReceiverId}
              initialPlaintext={modalInitialText}
              title="Embed into PNG Carrier & Send"
              onMessageSent={(msgId, text) => {
                setDecryptedMessage(userId, msgId, text);
                setDecryptedMap((prev) => ({ ...prev, [msgId]: text }));
              }}
              onSent={() => {
                setShowCarrierModal(false);
                setQuickText('');
                setModalInitialText('');
                setModalInitialReceiverId('');
              }}
              onClose={() => {
                setShowCarrierModal(false);
                setModalInitialReceiverId('');
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}