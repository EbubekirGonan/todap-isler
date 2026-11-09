import { useState } from 'react';
import { listProjects, listProjectTasks, type Project, type Team } from '../api';
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
        reloadKey={reloadKey}
        onBack={() => setSelectedId(null)}
        onOpenTask={onOpenTask}
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
      {project.teamName && <p className="mt-1 text-xs text-slate-500">{project.teamName}</p>}
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
        <div className="h-full bg-teal-600" style={{ width: `${progress.percent}%` }} />
      </div>
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
  reloadKey,
  onBack,
  onOpenTask,
}: {
  projectId: string;
  project: Project | null;
  reloadKey: number;
  onBack: () => void;
  onOpenTask: (taskId: string) => void;
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
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
            <div className="h-full bg-teal-600" style={{ width: `${project.progress.percent}%` }} />
          </div>
          <p className="mt-2 text-xs text-slate-600">
            {project.progress.done}/{project.progress.total} tamamlandı
            {project.progress.openCount > 0 && ` · ${project.progress.openCount} görevde kişi aranıyor`}
          </p>
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
