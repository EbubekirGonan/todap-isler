import { listAllTasks } from '../api';
import { useLoad } from '../useLoad';
import { Spinner } from './Spinner';
import { TaskCard } from './TaskCard';

type Props = {
  reloadKey: number;
  onOpenTask: (taskId: string) => void;
};

// Tüm işler: sahibi kim olursa olsun açık görevler, termin tarihine göre sıralı.
export function AllTasksScreen({ reloadKey, onOpenTask }: Props) {
  const key = `all:${reloadKey}`;
  const { data, error, loading } = useLoad(
    () => listAllTasks({ scope: 'all', includeDone: false, seeking: false }),
    key,
  );

  return (
    <div className="space-y-4">
      {loading && <Spinner />}
      {!loading && error && <p role="alert" className="text-red-700">{error}</p>}
      {!loading && !error && data && data.length === 0 && (
        <p className="text-slate-600">Açık iş yok.</p>
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
