import { listProjectTasks } from '../api';
import { useLoad } from '../useLoad';

type Props = {
  projectId: string;
  value: string;
  // Düzenlenen iş kendi üst işi olamaz; listeden çıkarılır.
  excludeTaskId?: string;
  // Üst iş değeri listede değilse (ör. başka görünürlükte) seçenek olarak eklenir.
  current?: { id: string; title: string } | null;
  onChange: (value: string) => void;
};

// Alt iş yalnızca aynı faaliyetteki bir işin altına eklenebilir; bu yüzden liste faaliyete göre yüklenir.
export function ParentTaskSelect({ projectId, value, excludeTaskId, current, onChange }: Props) {
  const { data: tasks, error, loading } = useLoad(() => listProjectTasks(projectId), projectId);

  const options: { id: string; title: string }[] = (tasks ?? [])
    .filter((task) => task.id !== excludeTaskId)
    .map((task) => ({ id: task.id, title: task.title }));
  if (current && current.id !== excludeTaskId && !options.some((task) => task.id === current.id)) {
    options.unshift(current);
  }

  return (
    <label className="block text-sm font-medium text-slate-800">
      Üst iş (isteğe bağlı)
      <select
        value={value}
        disabled={loading || !!error}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base disabled:opacity-60"
      >
        <option value="">Üst iş yok</option>
        {options.map((task) => (
          <option key={task.id} value={task.id}>
            {task.title}
          </option>
        ))}
      </select>
      {error && <span className="mt-1 block text-xs font-normal text-red-700">{error}</span>}
    </label>
  );
}
