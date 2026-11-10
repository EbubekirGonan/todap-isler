import { useState } from 'react';
import {
  linkProjectTeam,
  listProjects,
  listProjectTasks,
  unlinkProjectTeam,
  type Project,
  type Team,
} from '../api';
import { formatDateOnly } from '../format';
import { useLoad } from '../useLoad';
import { ProjectForm } from './ProjectForm';
import { Spinner } from './Spinner';
import { TaskCard } from './TaskCard';

type Props = {
  reloadKey: number;
  teams: Team[];
  onOpenTask: (taskId: string) => void;
  onChanged: () => void;
};

export function ProjectsScreen({ reloadKey, teams, onOpenTask, onChanged }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const { data, error, loading } = useLoad(listProjects, `projects:${reloadKey}`);

  if (selectedId) {
    return (
      <ProjectDetail
        projectId={selectedId}
        project={data?.find((item) => item.id === selectedId) ?? null}
        teams={teams}
        reloadKey={reloadKey}
        onBack={() => setSelectedId(null)}
        onOpenTask={onOpenTask}
        onChanged={onChanged}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Faaliyetler</h2>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white"
        >
          + Faaliyet ekle
        </button>
      </div>

      {loading && <Spinner />}
      {!loading && error && <p role="alert" className="text-red-700">{error}</p>}
      {!loading && !error && data && data.length === 0 && (
        <p className="text-slate-600">Henüz faaliyet yok.</p>
      )}
      {!loading && !error && data && data.length > 0 && (
        <ul className="space-y-3">
          {data.map((project) => (
            <li key={project.id}>
              <ProjectCard project={project} onOpen={() => setSelectedId(project.id)} />
            </li>
          ))}
        </ul>
      )}

      {creating && (
        <ProjectForm
          teams={teams}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function ProjectTeams({ project, teams, onChanged }: { project: Project; teams: Team[]; onChanged: () => void }) {
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const linkedIds = new Set(project.teams.map((team) => team.id));
  const available = teams.filter((team) => !linkedIds.has(team.id));

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'İşlem tamamlanamadı. Tekrar deneyin.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 space-y-2 border-t border-slate-200 pt-3">
      <h3 className="text-sm font-medium text-slate-800">Bağlı ekipler</h3>
      {project.teams.length === 0 && <p className="text-xs text-slate-600">Henüz bağlı ekip yok.</p>}
      {project.teams.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {project.teams.map((team) => (
            <li key={team.id} className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-800">
              {team.name}
              <button
                type="button"
                disabled={busy}
                aria-label={`${team.name} bağlantısını kaldır`}
                onClick={() => run(() => unlinkProjectTeam(project.id, team.id))}
                className="ml-1 text-slate-500 disabled:opacity-50"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {available.length > 0 && (
        <div className="flex gap-2">
          <select
            value={selectedTeamId}
            onChange={(event) => setSelectedTeamId(event.target.value)}
            aria-label="Bağlanacak ekip"
            className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-2 text-sm"
          >
            <option value="">Ekip seçin</option>
            {available.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || !selectedTeamId}
            onClick={() =>
              run(async () => {
                await linkProjectTeam(project.id, selectedTeamId);
                setSelectedTeamId('');
              })
            }
            className="rounded-md bg-teal-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Ekle
          </button>
        </div>
      )}
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    </div>
  );
}

function ProjectCard({ project, onOpen }: { project: Project; onOpen: () => void }) {
  const { progress } = project;
  const dueText = project.dueDate ? `Bitiş: ${formatDateOnly(project.dueDate)}` : null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="block w-full rounded-xl bg-white p-4 text-left shadow-sm ring-1 ring-slate-200"
    >
      <h3 className="font-semibold text-slate-900">{project.name}</h3>
      {project.teams.length > 0 && <p className="mt-1 text-xs text-slate-500">{project.teams.map((team) => team.name).join(', ')}</p>}
      <p className="mt-2 text-xs text-slate-600">
        {progress.done}/{progress.total} tamamlandı
        {progress.openCount > 0 && ` · ${progress.openCount} görevde kişi aranıyor`}
      </p>
      {dueText && <p className="mt-1 text-xs text-slate-500">{dueText}</p>}
    </button>
  );
}

function ProjectDetail({
  projectId,
  project,
  teams,
  reloadKey,
  onBack,
  onOpenTask,
  onChanged,
}: {
  projectId: string;
  project: Project | null;
  teams: Team[];
  reloadKey: number;
  onBack: () => void;
  onOpenTask: (taskId: string) => void;
  onChanged: () => void;
}) {
  const { data, error, loading } = useLoad(
    () => listProjectTasks(projectId),
    `project-tasks:${projectId}:${reloadKey}`,
  );

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="text-sm font-medium text-teal-800">
        ← Faaliyetler
      </button>

      {project && (
        <section className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">{project.name}</h2>
          {project.description && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{project.description}</p>}
          <p className="mt-2 text-xs text-slate-600">
            {project.progress.done}/{project.progress.total} tamamlandı
            {project.progress.openCount > 0 && ` · ${project.progress.openCount} görevde kişi aranıyor`}
          </p>
          <ProjectTeams project={project} teams={teams} onChanged={onChanged} />
        </section>
      )}

      {loading && <Spinner />}
      {!loading && error && <p role="alert" className="text-red-700">{error}</p>}
      {!loading && !error && data && data.length === 0 && (
        <p className="text-slate-600">Bu faaliyette henüz iş yok.</p>
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
