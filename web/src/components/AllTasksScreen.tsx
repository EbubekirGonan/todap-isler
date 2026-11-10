import { useState } from 'react';
import { listAllTasks } from '../api';
import { useLoad } from '../useLoad';
import { Spinner } from './Spinner';
import { TaskCard } from './TaskCard';

type Props = {
  reloadKey: number;
  onOpenTask: (taskId: string) => void;
};

// Tüm işler: sahibi kim olursa olsun görevler. Varsayılan açık işler, termin tarihine göre sıralı.
// "Son değişiklik" en son değişen işi öne alır. "Gecikti" yalnızca bugünden önce termini geçmiş, tamamlanmamış işleri gösterir.
export function AllTasksScreen({ reloadKey, onOpenTask }: Props) {
  const [openOnly, setOpenOnly] = useState(true);
  const [recentFirst, setRecentFirst] = useState(false);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const key = `all:${reloadKey}:${openOnly}:${recentFirst}:${overdueOnly}`;
  const { data, error, loading } = useLoad(
    () =>
      listAllTasks({
        scope: 'all',
        includeDone: !openOnly,
        seeking: false,
        sort: recentFirst ? 'changed' : 'due',
        overdue: overdueOnly,
      }),
    key,
  );

  const chipClass = (active: boolean) =>
    `rounded-full px-3 py-1 text-sm font-medium ${
      active ? 'bg-teal-100 text-teal-800' : 'bg-slate-200 text-slate-600'
    }`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={openOnly}
          onClick={() => setOpenOnly((value) => !value)}
          className={chipClass(openOnly)}
        >
          Açık
        </button>
        <button
          type="button"
          aria-pressed={recentFirst}
          onClick={() => setRecentFirst((value) => !value)}
          className={chipClass(recentFirst)}
        >
          Son değişiklik
        </button>
        <button
          type="button"
          aria-pressed={overdueOnly}
          onClick={() => setOverdueOnly((value) => !value)}
          className={chipClass(overdueOnly)}
        >
          Gecikti
        </button>
      </div>

      {loading && <Spinner />}
      {!loading && error && <p role="alert" className="text-red-700">{error}</p>}
      {!loading && !error && data && data.length === 0 && (
        <p className="text-slate-600">
          {overdueOnly ? 'Geciken iş yok.' : openOnly ? 'Açık iş yok.' : 'İş yok.'}
        </p>
      )}
      {!loading && !error && data && data.length > 0 && (
        <ul className="space-y-3">
          {data.map((task) => (
            <li key={task.id}>
              <TaskCard task={task} onOpen={() => onOpenTask(task.id)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
