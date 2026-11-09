import { useState, type FormEvent } from 'react';
import {
  addTaskComment,
  assignTask,
  claimTask,
  getTask,
  listUsers,
  releaseTask,
} from '../api';
import { formatDateTime, historyLabel, STATUS_LABELS } from '../format';
import { useLoad } from '../useLoad';
import { Badge } from './TaskCard';
import { Sheet } from './Sheet';

type Props = {
  taskId: string;
  currentUserId: string;
  assignNow: boolean;
  onClose: () => void;
  onChanged: () => void;
};

export function TaskDetail({ taskId, currentUserId, assignNow, onClose, onChanged }: Props) {
  const [version, setVersion] = useState(0);
  const [assignOpen, setAssignOpen] = useState(assignNow);
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
  const hasOwner = task?.assignments.some((assignment) => assignment.role === 'owner') ?? false;
  const isMine = task?.assignments.some((assignment) => assignment.userId === currentUserId) ?? false;

  return (
    <Sheet title={task?.title ?? 'Görev'} onClose={onClose}>
      {loading && <p className="text-slate-600">Yükleniyor…</p>}
      {!loading && error && <p role="alert" className="text-red-700">{error}</p>}

      {task && (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-1.5 text-xs">
            <Badge>{STATUS_LABELS[task.status]}</Badge>
            {task.needsAssignee && <Badge tone="amber">Kişi lazım</Badge>}
            {task.teamOnly && <Badge tone="violet">Ekibe özel</Badge>}
            {task.teamName && <Badge>{task.teamName}</Badge>}
            {task.projectName && <Badge>{task.projectName}</Badge>}
          </div>

          {task.description && <p className="whitespace-pre-wrap text-slate-800">{task.description}</p>}

          <div className="text-sm text-slate-600">
            <p>
              Sahibi:{' '}
              {task.assignments.filter((a) => a.role === 'owner').map((a) => a.name).join(', ') || 'yok'}
            </p>
            {task.assignments.some((a) => a.role === 'support') && (
              <p>
                Destek:{' '}
                {task.assignments.filter((a) => a.role === 'support').map((a) => a.name).join(', ')}
              </p>
            )}
            <p className="text-xs text-slate-500">Son hareket: {formatDateTime(task.lastActivityAt)}</p>
          </div>

          {!isDone && (
            <div className="flex flex-wrap gap-2">
              {!hasOwner && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => runAction(() => claimTask(taskId))}
                  className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  Üstlen
                </button>
              )}
              {isMine && (
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
