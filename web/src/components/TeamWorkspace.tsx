import { useState } from 'react';
import { getTeam, listTeamTasks, type Team } from '../api';
import { formatDateOnly } from '../format';
import { useLoad } from '../useLoad';
import { Spinner } from './Spinner';
import { TaskCard } from './TaskCard';

type Props = {
  team: Team;
  reloadKey: number;
  onOpenTask: (taskId: string) => void;
};

export function TeamWorkspace({ team, reloadKey, onOpenTask }: Props) {
  const [includeDone, setIncludeDone] = useState(false);
  const detail = useLoad(() => getTeam(team.id), `${team.id}:${reloadKey}`);
  const tasks = useLoad(() => listTeamTasks(team.id, includeDone), `${team.id}:${reloadKey}:${includeDone}`);

  return (
    <div className="space-y-5">
      {team.type === 'term' && team.term_start && team.term_end && (
        <TermBar start={team.term_start} end={team.term_end} />
      )}

      <section>
        <h2 className="text-sm font-semibold text-slate-800">Üyeler</h2>
        {detail.loading && <Spinner />}
        {detail.error && <p role="alert" className="text-red-700">{detail.error}</p>}
        {detail.data && (
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            {detail.data.members.map((member) => (
              <li key={member.userId}>
                {member.name}
                {member.roleTitle && <span className="text-slate-500"> · {member.roleTitle}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-800">Ekip işleri</h2>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={includeDone}
              onChange={(event) => setIncludeDone(event.target.checked)}
              className="h-4 w-4 accent-teal-700"
            />
            Tamamlananları göster
          </label>
        </div>

        <div className="mt-3">
          {tasks.loading && <Spinner />}
          {tasks.error && <p role="alert" className="text-red-700">{tasks.error}</p>}
          {tasks.data && tasks.data.length === 0 && (
            <p className="text-slate-600">Bu ekipte henüz iş yok.</p>
          )}
          {tasks.data && tasks.data.length > 0 && (
            <ul className="space-y-3">
              {tasks.data.map((task) => (
                <li key={task.id}>
                  <TaskCard task={task} onOpen={() => onOpenTask(task.id)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

// Dönem ilerlemesi Türkiye saatine (Europe/Istanbul) göre hesaplanır.
function TermBar({ start, end }: { start: string; end: string }) {
  const [today] = useState(istanbulToday);

  const day = 86_400_000;
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  const todayMs = Date.parse(`${today}T00:00:00Z`);
  const total = Math.max(endMs - startMs, day);
  const percent = Math.min(Math.max((todayMs - startMs) / total, 0), 1) * 100;
  const remainingDays = Math.round((endMs - todayMs) / day);

  const status = todayMs > endMs ? 'Dönem sona erdi' : `${remainingDays} gün kaldı`;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>
          {formatDateOnly(start)} – {formatDateOnly(end)}
        </span>
        <span className="font-medium text-slate-800">{status}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-teal-600" style={{ width: `${percent}%` }} />
      </div>
    </section>
  );
}

function istanbulToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
