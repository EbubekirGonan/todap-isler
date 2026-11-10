import { useState, type FormEvent } from 'react';
import { createProject, type Team } from '../api';
import { Sheet } from './Sheet';

type Props = {
  teams: Team[];
  onCreated: () => void;
  onClose: () => void;
};

export function ProjectForm({ teams, onCreated, onClose }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Faaliyet adı zorunludur.');
      return;
    }
    if (startDate && dueDate && dueDate < startDate) {
      setError('Bitiş tarihi başlangıç tarihinden önce olamaz.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await createProject({
        name: trimmedName,
        description: description.trim() || null,
        teamIds,
        startDate: startDate || null,
        dueDate: dueDate || null,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Faaliyet eklenemedi. Tekrar deneyin.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title="Yeni faaliyet" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-sm font-medium text-slate-800">
          Faaliyet adı
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
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
            rows={3}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base"
          />
        </label>

        {teams.length > 0 && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-slate-800">Ekipler (isteğe bağlı)</legend>
            {teams.map((team) => (
              <label key={team.id} className="flex items-center gap-2 text-sm text-slate-800">
                <input
                  type="checkbox"
                  checked={teamIds.includes(team.id)}
                  onChange={(event) =>
                    setTeamIds((current) =>
                      event.target.checked ? [...current, team.id] : current.filter((id) => id !== team.id),
                    )
                  }
                  className="h-4 w-4 rounded border-slate-300 text-teal-700"
                />
                {team.name}
              </label>
            ))}
          </fieldset>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-medium text-slate-800">
            Başlangıç
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base"
            />
          </label>
          <label className="block text-sm font-medium text-slate-800">
            Bitiş
            <input
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base"
            />
          </label>
        </div>

        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-teal-700 px-4 py-3 font-medium text-white disabled:opacity-50"
        >
          {busy ? 'Ekleniyor…' : 'Faaliyeti ekle'}
        </button>
      </form>
    </Sheet>
  );
}
