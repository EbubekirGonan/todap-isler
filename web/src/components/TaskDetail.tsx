import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  addTaskComment,
  assignTask,
  claimTask,
  getTask,
  listUsers,
  releaseTask,
  supportTask,
  updateTask,
  type Task,
  type TaskPatch,
  type TaskStatus,
} from '../api';
import { formatDateOnly, formatDateTime, historyLabel, STATUS_LABELS } from '../format';
import { useLoad } from '../useLoad';
import { Sheet } from './Sheet';
import { Spinner } from './Spinner';
import { TaskBadges } from './TaskCard';

const STATUS_OPTIONS: TaskStatus[] = ['planning', 'in_progress', 'nearly_done', 'done'];

type Props = {
  taskId: string;
  currentUserId: string;
  onClose: () => void;
  onChanged: () => void;
};

export function TaskDetail({ taskId, currentUserId, onClose, onChanged }: Props) {
  const [version, setVersion] = useState(0);
  const [assignOpen, setAssignOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const { data: task, error, loading } = useLoad(() => getTask(taskId), `${taskId}:${version}`);
  const { data: users, error: usersError } = useLoad(() => listUsers(), String(assignOpen));
  const menuRef = useRef<HTMLDivElement>(null);

  // Menü, dışarı tıklanınca veya Escape ile kapanır.
  useEffect(() => {
    if (!menuOpen) return;
    function handlePointerDown(event: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      // Yakalama aşamasında dinlenir; Escape yalnızca menüyü kapatır, detay penceresini kapatmaz.
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      event.stopPropagation();
    }
    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [menuOpen]);

  // Katkı, destek ve bırakma işlemlerinden önce kullanıcıdan onay alınır.
  function confirmAndRun(message: string, action: () => Promise<unknown>) {
    if (window.confirm(message)) void runAction(action);
  }

  async function runAction(action: () => Promise<unknown>) {
    setBusy(true);
    setActionError(null);
    try {
      await action();
      setVersion((value) => value + 1);
      onChanged();
      return true;
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'İşlem tamamlanamadı. Tekrar deneyin.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = commentText.trim();
    if (!text) return;
    if (await runAction(() => addTaskComment(taskId, text))) {
      setCommentText('');
    }
  }

  const isDone = task?.status === 'done';
  const owners = task?.assignments.filter((a) => a.role === 'owner') ?? [];
  const supporters = task?.assignments.filter((a) => a.role === 'support') ?? [];
  const isOwnerMine = owners.some((a) => a.userId === currentUserId);
  const isSupporterMine = supporters.some((a) => a.userId === currentUserId);

  return (
    <Sheet title={task?.title ?? 'Görev'} onClose={onClose}>
      {loading && <Spinner label="Görev yükleniyor" />}
      {!loading && error && <p role="alert" className="text-red-700">{error}</p>}

      {task && (
        <div className="space-y-5">
          <TaskBadges task={task} />

          {!editing && task.description && <p className="whitespace-pre-wrap text-slate-800">{task.description}</p>}

          {editing ? (
            <TaskEditForm
              task={task}
              ownerCount={owners.length}
              disabled={busy}
              onCancel={() => setEditing(false)}
              onSave={async (patch) => {
                if (await runAction(() => updateTask(taskId, patch))) setEditing(false);
              }}
            />
          ) : (
            <div className="space-y-1 text-sm text-slate-700">
              <p className="font-medium text-slate-900">
                Katkı Sağlarım: {owners.length}/{task.estimatedPeople}
              </p>
              {owners.map((a) => (
                <p key={a.userId} className="pl-3">
                  {a.name}
                </p>
              ))}
              <p className="pt-2 font-medium text-slate-900">Destek atabilirim: {supporters.length}</p>
              {supporters.map((a) => (
                <p key={a.userId} className="pl-3">
                  {a.name}
                </p>
              ))}
              {task.dueDate && <p className="pt-2">Son tarih: {formatDateOnly(task.dueDate)}</p>}
              <p className="pt-2">Son hareket: {formatDateTime(task.lastActivityAt)}</p>
            </div>
          )}

          {!isDone && (
            <div className="flex flex-wrap gap-2">
              {!isOwnerMine && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    confirmAndRun('Bu işe katkı sağlamak istediğinize emin misiniz?', () => claimTask(taskId))
                  }
                  className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  Katkı sağlarım
                </button>
              )}
              {!isSupporterMine && !isOwnerMine && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    confirmAndRun('Bu işe destek atmak istediğinize emin misiniz?', () => supportTask(taskId))
                  }
                  className="rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-800 disabled:opacity-50"
                >
                  Destek atabilirim
                </button>
              )}
              <div ref={menuRef} className="relative ml-auto">
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((open) => !open)}
                  className="rounded-md bg-slate-100 px-3 py-2 text-sm font-medium text-slate-800"
                >
                  İşlemler
                </button>
                {menuOpen && (
                  <ul
                    role="menu"
                    className="absolute right-0 z-10 mt-1 w-56 overflow-hidden rounded-md bg-white text-sm shadow-lg ring-1 ring-slate-200"
                  >
                    <li>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          setEditing(true);
                        }}
                        className="w-full px-3 py-2 text-left hover:bg-slate-100"
                      >
                        Düzenle
                      </button>
                    </li>
                    <li>
                      <button
                        type="button"
                        role="menuitem"
                        aria-expanded={assignOpen}
                        onClick={() => {
                          setMenuOpen(false);
                          setAssignOpen((open) => !open);
                        }}
                        className="w-full px-3 py-2 text-left hover:bg-slate-100"
                      >
                        Başkasına ata
                      </button>
                    </li>
                    {(isOwnerMine || isSupporterMine) && (
                      <li>
                        <button
                          type="button"
                          role="menuitem"
                          disabled={busy}
                          onClick={() => {
                            setMenuOpen(false);
                            confirmAndRun('Bu işten ayrılmak istediğinize emin misiniz?', () => releaseTask(taskId));
                          }}
                          className="w-full px-3 py-2 text-left hover:bg-slate-100 disabled:opacity-50"
                        >
                          Bırakmak durumundayım
                        </button>
                      </li>
                    )}
                  </ul>
                )}
              </div>
            </div>
          )}

          {assignOpen && !isDone && (
            <section aria-label="Kişi seç" className="rounded-xl border border-slate-200 p-3">
              <h3 className="mb-2 text-sm font-semibold text-slate-900">Kime atansın?</h3>
              {usersError && <p role="alert" className="text-sm text-red-700">{usersError}</p>}
              <ul className="grid grid-cols-2 gap-2">
                {(users ?? []).map((user) => (
                  <li key={user.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => runAction(() => assignTask(taskId, user.id))}
                      className="w-full rounded-md bg-white px-3 py-2 text-left text-sm ring-1 ring-slate-200 disabled:opacity-50"
                    >
                      {user.name}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {actionError && <p role="alert" className="text-sm text-red-700">{actionError}</p>}

          <section aria-label="Yorumlar">
            <h3 className="mb-2 font-semibold text-slate-900">Yorumlar</h3>
            {task.comments.length === 0 && <p className="text-sm text-slate-500">Henüz yorum yok.</p>}
            <ul className="space-y-3">
              {task.comments.map((comment) => (
                <li key={comment.id} className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">
                    {comment.author_name} · {formatDateTime(comment.created_at)}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{comment.body}</p>
                </li>
              ))}
            </ul>
            <form onSubmit={handleComment} className="mt-3 space-y-2">
              <textarea
                aria-label="Yorum"
                value={commentText}
                onChange={(event) => setCommentText(event.target.value)}
                maxLength={2000}
                rows={3}
                placeholder="Yorum yazın"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={busy || commentText.trim() === ''}
                className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Yorum ekle
              </button>
            </form>
          </section>

          <details className="text-sm">
            <summary className="cursor-pointer font-semibold text-slate-900">Geçmiş</summary>
            <ul className="mt-2 space-y-1 text-slate-600">
              {task.history.map((entry, index) => (
                <li key={index}>
                  {formatDateTime(entry.created_at)} · {entry.actor_name} · {historyLabel(entry.field)}
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </Sheet>
  );
}

type TaskEditFormProps = {
  task: Task;
  ownerCount: number;
  disabled: boolean;
  onSave: (patch: TaskPatch) => Promise<void>;
  onCancel: () => void;
};

// Görev alanlarını yerinde düzenler. Üst bileşen düzenleme modunu açıp kapatır; ayrı pencere açılmaz.
function TaskEditForm({ task, ownerCount, disabled, onSave, onCancel }: TaskEditFormProps) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [estimate, setEstimate] = useState(String(task.estimatedPeople));
  const [dueDate, setDueDate] = useState(task.dueDate ?? '');
  const parsedEstimate = Number(estimate);
  const estimateValid =
    Number.isInteger(parsedEstimate) && parsedEstimate >= 1 && parsedEstimate <= 50 && parsedEstimate >= ownerCount;
  const valid = title.trim() !== '' && estimateValid;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid) return;
    if (!window.confirm('Değişiklikleri kaydetmek istediğinize emin misiniz?')) return;
    onSave({
      title: title.trim(),
      description: description.trim() || null,
      status,
      estimatedPeople: parsedEstimate,
      dueDate: dueDate || null,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label className="block text-sm font-medium text-slate-800">
        Başlık
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={200}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base"
        />
      </label>
      <label className="block text-sm font-medium text-slate-800">
        Durum
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as TaskStatus)}
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {STATUS_LABELS[option]}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-medium text-slate-800">
        Açıklama (isteğe bağlı)
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={5000}
          rows={4}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base"
        />
      </label>
      <label className="block text-sm font-medium text-slate-800">
        Tahmini Gerekli Kişi Sayısı
        <input
          type="number"
          inputMode="numeric"
          min={Math.max(1, ownerCount)}
          max={50}
          value={estimate}
          onChange={(event) => setEstimate(event.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base"
        />
        <span className="mt-1 block text-xs font-normal text-slate-500">
          En az {Math.max(1, ownerCount)} kişi olmalı (şu an {ownerCount} katkı sağlıyor).
        </span>
      </label>
      <label className="block text-sm font-medium text-slate-800">
        Son tarih (isteğe bağlı)
        <input
          type="date"
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base"
        />
      </label>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={disabled || !valid}
          className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Kaydet
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onCancel}
          className="rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-800 disabled:opacity-50"
        >
          Vazgeç
        </button>
      </div>
    </form>
  );
}
