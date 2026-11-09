import { listMyTasks } from '../api';
import { useLoad } from '../useLoad';
import { TaskCard } from './TaskCard';
import { Spinner } from './Spinner';

type Props = {
  reloadKey: number;
  onOpenTask: (taskId: string) => void;
};

export function MyTasksScreen({ reloadKey, onOpenTask }: Props) {
  const { data, error, loading } = useLoad(listMyTasks, String(reloadKey));

  if (loading) return <Spinner />;
  if (error) return <p role="alert" className="text-red-700">{error}</p>;
  if (!data || data.length === 0) {
    return <p className="text-slate-600">Üzerinizde iş yok. Havuzdan bir iş üstlenebilir veya yeni iş ekleyebilirsiniz.</p>;
  }

  return (
    <ul className="space-y-3">
      {data.map((task) => (
        <li key={task.id}>
          <TaskCard task={task} onOpen={() => onOpenTask(task.id)} />
        </li>
      ))}
    </ul>
  );
}
