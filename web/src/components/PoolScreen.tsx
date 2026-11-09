import { useState } from 'react';
import { claimTask, listPoolTasks, type PoolScope } from '../api';
import { useLoad } from '../useLoad';
import { TaskCard } from './TaskCard';

type Props = {
  reloadKey: number;
  onOpenTask: (taskId: string, assignNow: boolean) => void;
  onChanged: () => void;
};

export function PoolScreen({ reloadKey, onOpenTask, onChanged }: Props) {
  const [personal, setPersonal] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const scope: PoolScope = personal ? 'mine-team' : 'public';
  const { data, error, loading } = useLoad(() => listPoolTasks(scope), `${scope}:${reloadKey}`);

  async function handleClaim(taskId: string) {
    setActionError(null);
    try {
      await claimTask(taskId);
      onChanged();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'İş üstlenilemedi. Tekrar deneyin.');
    }
  }

  return (
    <div className="space-y-4">
      <label className="flex items-center justify-between rounded-xl bg-white px-4 py-3 text-sm ring-1 ring-slate-200">
        <span>
          <span className="block font-medium text-slate-900">Bana özel</span>
          <span className="text-slate-500">Üyesi olduğum ekiplerin ekibe özel işleri</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          aria-checked={personal}
          checked={personal}
          onChange={(event) => setPersonal(event.target.checked)}
          className="h-5 w-9 accent-teal-700"
        />
      </label>

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
                onOpen={() => onOpenTask(task.id, false)}
                actions={
                  <>
                    <button
                      type="button"
                      onClick={() => handleClaim(task.id)}
                      className="rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white"
                    >
                      Üstlen
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenTask(task.id, true)}
                      className="rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-800"
                    >
                      Ata
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
