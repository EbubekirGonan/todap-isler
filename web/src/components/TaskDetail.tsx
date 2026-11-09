import { useState, type FormEvent } from 'react';
import {
  addTaskComment,
  assignTask,
  claimTask,
  getTask,
  listUsers,
  releaseTask,
  supportTask,
  updateTask,
  type TaskStatus,
} from '../api';
import { formatDateTime, historyLabel, STATUS_LABELS } from '../format';
import { useLoad } from '../useLoad';
import { Sheet } from './Sheet';
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
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const { data: task, error, loading } = useLoad(() => getTask(taskId), `${taskId}:${version}`);
  const { data: users, error: usersError } = useLoad(() => listUsers(), String(assignOpen));

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
      {loading && <p className="text-slate-600">Yükleniyor…</p>}
      {!loading && error && <p role="alert" className="text-red-700">{error}</p>}

      {task && (
        <div className="space-y-5">
          <TaskBadges task={task} />

          {task.description && <p className="whitespace-pre-wrap text-slate-800">{task.description}</p>}

          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-800">
              Durum
              <select
                value={task.status}
                disabled={busy}
                onChange={(event) => runAction(() => updateTask(taskId, { status: event.target.value as TaskStatus }))}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base"
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </label>

            <EstimateField
              key={version}
              value={task.estimatedPeople}
              ownerCount={owners.length}
              disabled={busy}
              onSave={(value) => runAction(() => updateTask(taskId, { estimatedPeople: value }))}
            />
          </div>

          <div className="text-sm text-slate-600">
            <p>
              Katkı sağlayan ({owners.length}/{task.estimatedPeople}):{' '}
              {owners.map((a) => a.name).join(', ') || 'yok'}
            </p>
            {supporters.length > 0 && <p>Destek: {supporters.map((a) => a.name).join(', ')}</p>}
            <p className="text-xs text-slate-500">Son hareket: {formatDateTime(task.lastActivityAt)}</p>
          </div>

          {!isDone && (
            <div className="flex flex-wrap gap-2">
              {!isOwnerMine && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => runAction(() => claimTask(taskId))}
                  className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  Katkı sağlarım
                </button>
              )}
              {!isSupporterMine && !isOwnerMine && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => runAction(() => supportTask(taskId))}
                  className="rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-800 disabled:opacity-50"
                >
                  Destek atabilirim
                </button>
              )}
              {(isOwnerMine || isSupporterMine) && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => runAction(() => releaseTask(taskId))}
                  className="rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-800 disabled:opacity-50"
                >
                  Bırak
                </button>
              )}
              <button
                type="button"
                aria-expanded={assignOpen}
                onClick={() => setAssignOpen((open) => !open)}
                className="rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-800"
              >
                Ata
              </button>
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

type EstimateFieldProps = {
  value: number;
  ownerCount: number;
  disabled: boolean;
  onSave: (value: number) => Promise<boolean>;
};

// Tahmini kişi sayısı düzenleyici. Üst bileşen sürüm değişince key ile yeniden oluşturur.
function EstimateField({ value, ownerCount, disabled, onSave }: EstimateFieldProps) {
  const [text, setText] = useState(String(value));
  const parsed = Number(text);
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= 50 && parsed >= ownerCount;

  return (
    <div className="flex items-end gap-2">
      <label className="block flex-1 text-sm font-medium text-slate-800">
        Tahmini Gerekli Kişi Sayısı
        <input
          type="number"
          inputMode="numeric"
          min={Math.max(1, ownerCount)}
          max={50}
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base"
        />
      </label>
      <button
        type="button"
        disabled={disabled || !valid || parsed === value}
        onClick={() => onSave(parsed)}
        className="rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-800 disabled:opacity-50"
      >
        Kaydet
      </button>
    </div>
  );
}
