import { useState } from 'react';
import { listAllTasks } from '../api';
import { useLoad } from '../useLoad';
import { Spinner } from './Spinner';
import { TaskCard } from './TaskCard';

type Props = {
  reloadKey: number;
  onOpenTask: (taskId: string) => void;
};

// Tüm işler: sahibi kim olursa olsun görevler, termin tarihine göre sıralı. Varsayılan yalnızca açık işler.
export function AllTasksScreen({ reloadKey, onOpenTask }: Props) {
  const [openOnly, setOpenOnly] = useState(true);
  const key = `all:${reloadKey}:${openOnly}`;
  const { data, error, loading } = useLoad(
    () => listAllTasks({ scope: 'all', includeDone: !openOnly, seeking: false }),
    key,
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          type="button"
          aria-pressed={openOnly}
          onClick={() => setOpenOnly((value) => !value)}
          className={`rounded-full px-3 py-1 text-sm font-medium ${
            openOnly ? 'bg-teal-100 text-teal-800' : 'bg-slate-200 text-slate-600'
          }`}
        >
          Açık
        </button>
      </div>

      {loading && <Spinner />}
      {!loading && error && <p role="alert" className="text-red-700">{error}</p>}
      {!loading && !error && data && data.length === 0 && (
        <p className="text-slate-600">{openOnly ? 'Açık iş yok.' : 'İş yok.'}</p>
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
