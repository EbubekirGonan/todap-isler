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
  const [teamId, setTeamId] = useState('');
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
        teamId: teamId || null,
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
          <label className="block text-sm font-medium text-slate-800">
            Ekip (isteğe bağlı)
            <select
              value={teamId}
              onChange={(event) => setTeamId(event.target.value)}
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
