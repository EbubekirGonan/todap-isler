import { useState, type FormEvent } from 'react';
import { createTask, type Team } from '../api';
import { Sheet } from './Sheet';

type Props = {
  teams: Team[];
  onCreated: () => void;
  onClose: () => void;
};

// Tek ekip varsa otomatik seçilir; birden fazlaysa seçici gösterilir ve "Ekip yok" seçeneği bulunur.
export function TaskForm({ teams, onCreated, onClose }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [teamId, setTeamId] = useState(teams.length === 1 ? teams[0].id : '');
  const [teamOnly, setTeamOnly] = useState(false);
  const [needsAssignee, setNeedsAssignee] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('Başlık zorunludur.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await createTask({
        title: trimmedTitle,
        description: description.trim() || null,
        teamId: teamId || null,
        teamOnly: teamOnly && teamId !== '',
        needsAssignee,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'İş eklenemedi. Tekrar deneyin.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title="Yeni iş" onClose={onClose}>
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

        {teams.length > 1 && (
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

        <label className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm">
          <span>
            <span className="block font-medium text-slate-900">Kişi lazım</span>
            <span className="text-slate-500">Bu işe birinin destek olmasına ihtiyaç var</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            aria-checked={needsAssignee}
            checked={needsAssignee}
            onChange={(event) => setNeedsAssignee(event.target.checked)}
            className="h-5 w-9 accent-teal-700"
          />
        </label>

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
