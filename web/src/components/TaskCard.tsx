import type { ReactNode } from 'react';
import { STATUS_LABELS, formatDateTime } from '../format';
import type { Task } from '../api';

type Props = {
  task: Task;
  onOpen: () => void;
  actions?: ReactNode;
};

export function TaskCard({ task, onOpen, actions }: Props) {
  const owners = task.assignments.filter((assignment) => assignment.role === 'owner');
  const supporters = task.assignments.filter((assignment) => assignment.role === 'support');

  return (
    <article className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <h3 className="font-semibold text-slate-900">{task.title}</h3>
        <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
          <Badge>{STATUS_LABELS[task.status]}</Badge>
          {task.needsAssignee && <Badge tone="amber">Kişi lazım</Badge>}
          {task.teamOnly && <Badge tone="violet">Ekibe özel</Badge>}
          {task.teamName && <Badge>{task.teamName}</Badge>}
          {task.projectName && <Badge>{task.projectName}</Badge>}
        </div>
        <p className="mt-2 text-sm text-slate-600">
          {owners.length > 0 ? `Sahibi: ${owners.map((owner) => owner.name).join(', ')}` : 'Sahibi yok'}
          {supporters.length > 0 && ` · Destek: ${supporters.map((supporter) => supporter.name).join(', ')}`}
        </p>
        <p className="mt-1 text-xs text-slate-500">Son hareket: {formatDateTime(task.lastActivityAt)}</p>
      </button>
      {actions && <div className="mt-3 flex gap-2">{actions}</div>}
    </article>
  );
}

type BadgeTone = 'slate' | 'amber' | 'violet';

const BADGE_TONES: Record<BadgeTone, string> = {
  slate: 'bg-slate-100 text-slate-700',
  amber: 'bg-amber-100 text-amber-800',
  violet: 'bg-violet-100 text-violet-800',
};

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: BadgeTone }) {
  return <span className={`rounded-full px-2 py-0.5 font-medium ${BADGE_TONES[tone]}`}>{children}</span>;
}
