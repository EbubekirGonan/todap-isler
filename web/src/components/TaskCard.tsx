import type { ReactNode } from 'react';
import { STATUS_LABELS, dueDateLabel, formatDateTime } from '../format';
import type { Task } from '../api';

type Props = {
  task: Task;
  onOpen: () => void;
  actions?: ReactNode;
};

export function TaskCard({ task, onOpen, actions }: Props) {
  const owners = task.assignments.filter((assignment) => assignment.role === 'owner');

  return (
    <article className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <h3 className="font-semibold text-slate-900">{task.title}</h3>
        <div className="mt-2">
          <TaskBadges task={task} />
        </div>
        <p className="mt-2 text-xs font-medium text-slate-600">
          {owners.length}/{task.estimatedPeople}
        </p>
        {dueDateLabel(task) && <p className="mt-1 text-xs text-slate-600">{dueDateLabel(task)}</p>}
        <p className="mt-1 text-xs text-slate-500">Son hareket: {formatDateTime(task.lastActivityAt)}</p>
      </button>
      {actions && <div className="mt-3 flex gap-2">{actions}</div>}
    </article>
  );
}

// Durum, görünürlük, ekip, proje ve üst iş etiketleri. Hem kartta hem detayda kullanılır.
export function TaskBadges({ task }: { task: Task }) {
  return (
    <div className="flex flex-wrap gap-1.5 text-xs">
      <Badge>{STATUS_LABELS[task.status]}</Badge>
      {task.teamOnly && <Badge tone="violet">Ekibe özel</Badge>}
      {task.teamName && <Badge tone="amber">{task.teamName}</Badge>}
      {task.projectName && <Badge tone="teal">Proje: {task.projectName}</Badge>}
      {task.parentTitle && <Badge tone="sky">Üst iş: {task.parentTitle}</Badge>}
    </div>
  );
}

type BadgeTone = 'slate' | 'violet' | 'teal' | 'sky' | 'amber';

const BADGE_TONES: Record<BadgeTone, string> = {
  slate: 'bg-slate-100 text-slate-700',
  violet: 'bg-violet-100 text-violet-800',
  teal: 'bg-teal-100 text-teal-800',
  sky: 'bg-sky-100 text-sky-800',
  amber: 'bg-amber-100 text-amber-800',
};

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: BadgeTone }) {
  return <span className={`rounded-full px-2 py-0.5 font-medium ${BADGE_TONES[tone]}`}>{children}</span>;
}
