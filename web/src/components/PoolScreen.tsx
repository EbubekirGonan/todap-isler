import { useState } from 'react';
import { claimTask, listPoolTasks, supportTask, type PoolScope } from '../api';
import { useLoad } from '../useLoad';
import { TaskCard } from './TaskCard';

type Props = {
  reloadKey: number;
  onOpenTask: (taskId: string) => void;
  onChanged: () => void;
};

export function PoolScreen({ reloadKey, onOpenTask, onChanged }: Props) {
  const [personal, setPersonal] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const scope: PoolScope = personal ? 'mine-team' : 'public';
  const { data, error, loading } = useLoad(() => listPoolTasks(scope), `${scope}:${reloadKey}`);

  async function runPoolAction(action: () => Promise<void>, fallbackMessage: string) {
    setActionError(null);
    try {
      await action();
      onChanged();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : fallbackMessage);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex">
        <button
          type="button"
          aria-pressed={personal}
          onClick={() => setPersonal((value) => !value)}
          className={`rounded-full px-3 py-1 text-sm font-medium ${
            personal ? 'bg-violet-700 text-white' : 'bg-slate-200 text-slate-600'
          }`}
        >
          Bana özel
        </button>
      </div>

      {actionError && <p role="alert" className="text-sm text-red-700">{actionError}</p>}

      {loading && <p className="text-slate-600">Yükleniyor…</p>}
      {!loading && error && <p role="alert" className="text-red-700">{error}</p>}
      {!loading && !error && data && data.length === 0 && (
        <p className="text-slate-600">Havuzda bekleyen iş yok.</p>
      )}
      {!loading && !error && data && data.length > 0 && (
        <ul className="space-y-3">
          {data.map((task) => (
            <li key={task.id}>
              <TaskCard
                task={task}
                onOpen={() => onOpenTask(task.id)}
                actions={
                  <>
                    <button
                      type="button"
                      onClick={() => runPoolAction(() => claimTask(task.id), 'İşe katkı sağlanamadı. Tekrar deneyin.')}
                      className="rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white"
                    >
                      Katkı sağlarım
                    </button>
                    <button
                      type="button"
                      onClick={() => runPoolAction(() => supportTask(task.id), 'Destek eklenemedi. Tekrar deneyin.')}
                      className="rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-800"
                    >
                      Destek atabilirim
                    </button>
                  </>
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
