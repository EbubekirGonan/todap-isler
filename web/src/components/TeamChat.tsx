import { useCallback, useEffect, useState } from 'react';
import {
  deleteTeamMessage,
  listTeamMessages,
  postTeamMessage,
  updateTeamMessage,
  type TeamMessage,
} from '../api';
import { formatDate, formatTime } from '../format';
import { Spinner } from './Spinner';

const MAX_LENGTH = 2000;
const PREVIEW_COUNT = 3;

type Props = {
  teamId: string;
  canWrite: boolean;
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'İşlem tamamlanamadı. Tekrar deneyin.';
}

// Ekip sohbeti yalnızca ekip sayfasında görünür. Otomatik yenileme yoktur; "Yenile" ve sekmeye dönüşte yüklenir.
export function TeamChat({ teamId, canWrite }: Props) {
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [composing, setComposing] = useState(false);
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [expanded, setExpanded] = useState(false);

  const loadLatest = useCallback(async () => {
    try {
      const page = await listTeamMessages(teamId);
      setMessages(page.messages);
      setHasMore(page.hasMore);
      setLoadError(null);
    } catch (err) {
      setLoadError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const page = await listTeamMessages(teamId);
        if (!active) return;
        setMessages(page.messages);
        setHasMore(page.hasMore);
        setLoadError(null);
      } catch (err) {
        if (active) setLoadError(errorMessage(err));
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    function onVisible() {
      if (document.visibilityState === 'visible') void load();
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [teamId]);

  const collapsible = messages.length > PREVIEW_COUNT || hasMore;
  const visibleMessages = (expanded ? [...messages] : messages.slice(-PREVIEW_COUNT)).reverse();

  async function loadOlder() {
    const oldest = messages[0];
    if (!oldest) return;
    setLoadingOlder(true);
    try {
      const page = await listTeamMessages(teamId, oldest.id);
      setMessages((prev) => [...page.messages, ...prev]);
      setHasMore(page.hasMore);
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setLoadingOlder(false);
    }
  }

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setActionError(null);
    try {
      await postTeamMessage(teamId, body);
      setDraft('');
      setComposing(false);
      await loadLatest();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  async function saveEdit(message: TeamMessage) {
    const body = editDraft.trim();
    if (!body) return;
    setActionError(null);
    try {
      await updateTeamMessage(teamId, message.id, body);
      const updatedAt = new Date().toISOString();
      setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, body, updatedAt } : m)));
      setEditingId(null);
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  async function remove(message: TeamMessage) {
    if (!window.confirm('Bu mesaj silinsin mi?')) return;
    setActionError(null);
    try {
      await deleteTeamMessage(teamId, message.id);
      setMessages((prev) => prev.filter((m) => m.id !== message.id));
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  function cancelCompose() {
    setDraft('');
    setComposing(false);
  }

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-800">Ekip sohbeti</h2>
        <button
          type="button"
          onClick={() => void loadLatest()}
          aria-label="Yenile"
          title="Yenile"
          className="rounded-full p-1.5 text-teal-700 hover:bg-teal-50"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" />
            <path d="M3 21v-5h5" />
            <path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" />
            <path d="M21 3v5h-5" />
          </svg>
        </button>
      </div>
      {!canWrite && <p className="mt-1 text-xs text-slate-500">Yalnızca okuma: bu sohbete ekip üyeleri yazabilir.</p>}

      <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
        {((canWrite && !composing) || expanded) && (
          <div className="mb-3 flex items-center justify-between gap-2">
            {canWrite && !composing ? (
              <button
                type="button"
                onClick={() => setComposing(true)}
                aria-label="Mesaj yaz"
                title="Mesaj yaz"
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50 text-2xl leading-none text-teal-700 hover:bg-teal-100"
              >
                +
              </button>
            ) : <span />}
            {expanded && (
              <button
                type="button"
                onClick={() => setExpanded(false)}
                aria-label="Mesaj kutusunu kapat"
                title="Kapat"
                className="rounded-full p-1 text-slate-500 hover:bg-slate-100"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            )}
          </div>
        )}
        {canWrite && composing && (
          <div className="mb-3 space-y-2">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={MAX_LENGTH}
              rows={2}
              autoFocus
              placeholder="Ekibe mesaj yazın"
              aria-label="Mesaj"
              className="w-full rounded-lg border border-slate-300 p-2 text-sm"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">
                {draft.length}/{MAX_LENGTH}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={cancelCompose}
                  aria-label="İptal"
                  title="İptal"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-600 hover:bg-red-200"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={!draft.trim() || sending}
                  aria-label="Gönder"
                  title="Gönder"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-50"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}
        {loading && <Spinner />}
        {loadError && <p role="alert" className="text-red-700">{loadError}</p>}
        {!loading && !loadError && messages.length === 0 && (
          <p className="text-sm text-slate-600">Henüz mesaj yok.</p>
        )}
        <div className="relative">
          <ul className="space-y-3">
            {visibleMessages.map((message, index) => (
              <li key={message.id}>
                {(index === 0 || formatDate(message.createdAt) !== formatDate(visibleMessages[index - 1].createdAt)) && (
                  <div className="mb-3 text-center text-xs font-medium text-slate-500">
                    <time dateTime={message.createdAt}>{formatDate(message.createdAt)}</time>
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-lg p-3 ${
                    message.isMine ? 'ml-auto bg-teal-50' : 'mr-auto bg-slate-100'
                  }`}
                >
                <div className="flex items-baseline justify-between gap-2 text-xs text-slate-500">
                  <span className="font-medium text-slate-700">
                    {message.authorName}
                    {message.isMine && ' (siz)'}
                  </span>
                  <span>
                    <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
                    {message.updatedAt && ' · düzenlendi'}
                  </span>
                </div>

                {editingId === message.id ? (
                  <div className="mt-2 space-y-2">
                    <textarea
                      value={editDraft}
                      onChange={(event) => setEditDraft(event.target.value)}
                      maxLength={MAX_LENGTH}
                      rows={3}
                      aria-label="Mesajı düzenle"
                      className="w-full rounded-lg border border-slate-300 p-2 text-sm"
                    />
                    <div className="flex justify-end gap-2 text-sm">
                      <button type="button" onClick={() => setEditingId(null)} className="px-3 py-1 text-slate-600">
                        Vazgeç
                      </button>
                      <button
                        type="button"
                        onClick={() => void saveEdit(message)}
                        disabled={!editDraft.trim()}
                        className="rounded-lg bg-teal-700 px-3 py-1 text-white disabled:opacity-50"
                      >
                        Kaydet
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800">{message.body}</p>
                )}

                {message.isMine && editingId !== message.id && (
                  <div className="mt-2 flex gap-3 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(message.id);
                        setEditDraft(message.body);
                      }}
                      className="font-medium text-teal-700"
                    >
                      Düzenle
                    </button>
                    <button type="button" onClick={() => void remove(message)} className="font-medium text-red-700">
                      Sil
                    </button>
                  </div>
                )}
                </div>
              </li>
            ))}
          </ul>
          {!expanded && collapsible && (
            <div className="absolute inset-x-0 bottom-0 flex h-28 items-center justify-center bg-gradient-to-t from-white via-white/80 to-transparent backdrop-blur-[2px]">
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="rounded-full bg-white px-4 py-1.5 text-sm font-medium text-teal-700 shadow-sm ring-1 ring-teal-200"
              >
                Eski konuşmaları gör
              </button>
            </div>
          )}
        </div>
        {expanded && hasMore && (
          <button
            type="button"
            onClick={() => void loadOlder()}
            disabled={loadingOlder}
            className="mt-3 w-full text-sm font-medium text-teal-700 disabled:opacity-50"
          >
            {loadingOlder ? 'Yükleniyor…' : 'Daha eski mesajlar'}
          </button>
        )}
        {actionError && <p role="alert" className="mt-2 text-sm text-red-700">{actionError}</p>}
      </div>
    </section>
  );
}
