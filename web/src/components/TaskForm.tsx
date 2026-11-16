import { useState, type FormEvent } from 'react';
import { createTask, type Project, type Team } from '../api';
import { ParentTaskSelect } from './ParentTaskSelect';
import { Sheet } from './Sheet';

type Props = {
  teams: Team[];
  projects: Project[];
  defaultProjectId?: string | null;
  // Verilirse yeni iş bu işin alt işi olarak eklenir; faaliyet ve üst iş önceden seçilir.
  parentTask?: { id: string; title: string; projectId: string | null } | null;
  onCreated: () => void;
  onClose: () => void;
};

// Ekip seçici her zaman gösterilir ve varsayılan olarak "Ekip yok" seçilidir.
// Faaliyet seçici, en az bir faaliyet varsa gösterilir; "Faaliyet yok" seçeneği bulunur.
export function TaskForm({ teams, projects, defaultProjectId = null, parentTask = null, onCreated, onClose }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState(parentTask ? (parentTask.projectId ?? '') : (defaultProjectId ?? ''));
  const [parentTaskId, setParentTaskId] = useState(parentTask?.id ?? '');
  const [teamId, setTeamId] = useState('');
  const [teamOnly, setTeamOnly] = useState(false);
  const [estimatedPeople, setEstimatedPeople] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('Başlık zorunludur.');
      return;
    }

    const trimmedEstimate = estimatedPeople.trim();
    const estimate = trimmedEstimate === '' ? null : Number(trimmedEstimate);
    if (estimate !== null && (!Number.isInteger(estimate) || estimate < 1 || estimate > 50)) {
      setError('Tahmini kişi sayısı 1 ile 50 arasında bir tam sayı olmalıdır.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await createTask({
        title: trimmedTitle,
        description: description.trim() || null,
        // Alt işte faaliyet ve ekip üst işten miras alınır; bu alanlar gönderilmez.
        projectId: parentTask ? null : projectId || null,
        teamId: parentTask ? null : teamId || null,
        teamOnly: !parentTask && teamOnly && teamId !== '',
        estimatedPeople: estimate,
        dueDate: dueDate || null,
        parentTaskId: parentTask ? parentTask.id : projectId && parentTaskId ? parentTaskId : null,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'İş eklenemedi. Tekrar deneyin.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={parentTask ? 'Yeni alt iş' : 'Yeni iş'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-sm font-medium text-slate-800">
          Başlık
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={200}
            required
            autoFocus
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base"
          />
        </label>

        <label className="block text-sm font-medium text-slate-800">
          Açıklama (isteğe bağlı)
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={5000}
            rows={4}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base"
          />
        </label>

        {parentTask ? (
          <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Faaliyet ve ekip üst işten otomatik alınır.
          </p>
        ) : (
          projects.length > 0 && (
            <label className="block text-sm font-medium text-slate-800">
              Faaliyet (isteğe bağlı)
              <select
                value={projectId}
                onChange={(event) => {
                  setProjectId(event.target.value);
                  // Üst iş farklı faaliyette kalamaz; faaliyet değişince seçim sıfırlanır.
                  setParentTaskId('');
                }}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base"
              >
                <option value="">Faaliyet yok</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
          )
        )}

        {!parentTask && projectId !== '' && (
          <ParentTaskSelect
            projectId={projectId}
            value={parentTaskId}
            current={null}
            onChange={setParentTaskId}
          />
        )}

        {!parentTask && (
          <label className="block text-sm font-medium text-slate-800">
            Ekip
            <select
              value={teamId}
              onChange={(event) => {
                setTeamId(event.target.value);
                if (!event.target.value) setTeamOnly(false);
              }}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base"
            >
              <option value="">Ekip yok</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="block text-sm font-medium text-slate-800">
          Tahmini Gerekli Kişi Sayısı
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={50}
            value={estimatedPeople}
            onChange={(event) => setEstimatedPeople(event.target.value)}
            placeholder="1"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base"
          />
          <span className="mt-1 block text-xs font-normal text-slate-500">Boş bırakılırsa 1 kişi sayılır.</span>
        </label>

        <label className="block text-sm font-medium text-slate-800">
          Son tarih (isteğe bağlı)
          <input
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base"
          />
        </label>

        {!parentTask && (
          <label className="flex items-center gap-3 rounded-md bg-slate-50 px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={teamOnly}
              disabled={teamId === ''}
              onChange={(event) => setTeamOnly(event.target.checked)}
              className="h-4 w-4 accent-teal-700"
            />
            <span>
              <span className="block font-medium text-slate-900">Ekibe özel</span>
              <span className="text-slate-500">
                {teamId === '' ? 'Görünürlük için bir ekip seçin' : 'Yalnızca bu ekibin üyeleri görür'}
              </span>
            </span>
          </label>
        )}

        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-teal-700 px-4 py-3 font-medium text-white disabled:opacity-50"
        >
          {busy ? 'Ekleniyor…' : 'İşi ekle'}
        </button>
      </form>
    </Sheet>
  );
}
