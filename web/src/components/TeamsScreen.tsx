import { useState, type FormEvent } from 'react';
import {
  getTeam,
  joinTeam,
  leaveTeam,
  listTeams,
  updateTeamRequiredPeople,
  type TeamDetail,
  type TeamSummary,
} from '../api';
import { formatDateOnly } from '../format';
import { useLoad } from '../useLoad';
import { Spinner } from './Spinner';

type Props = {
  reloadKey: number;
  onChanged: () => void;
};

const MAX_REQUIRED_PEOPLE = 1000;

export function TeamsScreen({ reloadKey, onChanged }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Katılım veya kontenjan değişince liste ve detay yeniden yüklenir.
  const [version, setVersion] = useState(0);
  const { data, error, loading } = useLoad(listTeams, `teams:${reloadKey}:${version}`);

  function handleChanged() {
    setVersion((value) => value + 1);
    onChanged();
  }

  if (selectedId) {
    return (
      <TeamDetailView
        teamId={selectedId}
        version={`${reloadKey}:${version}`}
        onBack={() => setSelectedId(null)}
        onChanged={handleChanged}
      />
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-900">Takımlar</h2>

      {loading && <Spinner />}
      {!loading && error && <p role="alert" className="text-red-700">{error}</p>}
      {!loading && !error && data && data.length === 0 && <p className="text-slate-600">Henüz takım yok.</p>}
      {!loading && !error && data && data.length > 0 && (
        <ul className="space-y-3">
          {data.map((team) => (
            <li key={team.id}>
              <TeamCard team={team} onOpen={() => setSelectedId(team.id)} onChanged={handleChanged} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TeamCard({ team, onOpen, onChanged }: { team: TeamSummary; onOpen: () => void; onChanged: () => void }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <h3 className="font-semibold text-slate-900">{team.name}</h3>
        <TeamCapacity team={team} />
      </button>
      <div className="mt-3">
        <MembershipButton team={team} onChanged={onChanged} />
      </div>
    </div>
  );
}

function TeamCapacity({ team }: { team: TeamSummary }) {
  return (
    <p className="mt-1 text-xs text-slate-600">
      {team.activeCount}/{team.requiredPeople} kişi
      {' · '}
      {team.openSlots > 0 ? `${team.openSlots} açık yer` : 'Kadro dolu'}
    </p>
  );
}

// Katıl ve Ayrıl düğmesi; işlem sırasında düğmeyi kilitler, hatayı gösterir.
function MembershipButton({ team, onChanged }: { team: TeamSummary; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!team.isMember && !team.canJoin) {
    return <p className="text-xs text-slate-500">Katılım şu an kapalı.</p>;
  }

  async function handleClick() {
    setBusy(true);
    setError(null);
    try {
      if (team.isMember) {
        await leaveTeam(team.id);
      } else {
        await joinTeam(team.id);
      }
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'İşlem tamamlanamadı. Tekrar deneyin.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className={
          team.isMember
            ? 'rounded-md bg-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-60'
            : 'rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60'
        }
      >
        {team.isMember ? 'Ekipten ayrıl' : 'Katıl'}
      </button>
      {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}

function TeamDetailView({
  teamId,
  version,
  onBack,
  onChanged,
}: {
  teamId: string;
  version: string;
  onBack: () => void;
  onChanged: () => void;
}) {
  const { data: team, error, loading } = useLoad(() => getTeam(teamId), `team:${teamId}:${version}`);

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="text-sm font-medium text-teal-800">
        ← Takımlar
      </button>

      {loading && <Spinner />}
      {!loading && error && <p role="alert" className="text-red-700">{error}</p>}
      {!loading && !error && team && (
        <TeamDetailContent team={team} onChanged={onChanged} />
      )}
    </div>
  );
}

function TeamDetailContent({ team, onChanged }: { team: TeamDetail; onChanged: () => void }) {
  const termText =
    team.type === 'term' && team.termStart && team.termEnd
      ? `Dönem: ${formatDateOnly(team.termStart)} – ${formatDateOnly(team.termEnd)}`
      : team.type === 'term'
        ? 'Dönemlik ekip'
        : 'Sürekli ekip';

  return (
    <div className="space-y-5">
      <section className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-xl font-semibold text-slate-900">{team.name}</h2>
        {team.description && <p className="mt-2 text-sm text-slate-700">{team.description}</p>}
        <p className="mt-2 text-xs text-slate-500">{termText}</p>
        <TeamCapacity team={team} />
        <div className="mt-3">
          <MembershipButton team={team} onChanged={onChanged} />
        </div>
      </section>

      <RequiredPeopleForm key={team.requiredPeople} team={team} onSaved={onChanged} />

      <section>
        <h3 className="mb-2 font-semibold text-slate-900">Üyeler</h3>
        {team.members.length === 0 ? (
          <p className="text-sm text-slate-600">Henüz üye yok.</p>
        ) : (
          <ul className="space-y-2">
            {team.members.map((member) => (
              <li key={member.userId} className="rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-slate-200">
                <span className="font-medium text-slate-900">{member.name}</span>
                {member.roleTitle && <span className="text-slate-600"> · {member.roleTitle}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-2 font-semibold text-slate-900">Üstlenilen faaliyetler</h3>
        {team.projects.length === 0 ? (
          <p className="text-sm text-slate-600">Bu ekibe bağlı faaliyet yok.</p>
        ) : (
          <ul className="space-y-2">
            {team.projects.map((project) => (
              <li key={project.id} className="rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-slate-200">
                <span className="font-medium text-slate-900">{project.name}</span>
                {project.dueDate && (
                  <span className="text-slate-600"> · Bitiş: {formatDateOnly(project.dueDate)}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// Gerekli kişi sayısı herkes tarafından düzenlenebilir; kaydedilince kontenjan yeniden hesaplanır.
function RequiredPeopleForm({ team, onSaved }: { team: TeamDetail; onSaved: () => void }) {
  const [value, setValue] = useState(String(team.requiredPeople));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const count = Number(value);
    if (!Number.isInteger(count) || count < 0 || count > MAX_REQUIRED_PEOPLE) {
      setError(`Gerekli kişi sayısı 0 ile ${MAX_REQUIRED_PEOPLE} arasında olmalıdır.`);
      return;
    }

    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await updateTeamRequiredPeople(team.id, count);
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaydedilemedi. Tekrar deneyin.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <label className="block text-sm font-medium text-slate-800">
        Gerekli kişi sayısı
        <input
          type="number"
          min={0}
          max={MAX_REQUIRED_PEOPLE}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="mt-1 block w-28 rounded-md border border-slate-300 px-3 py-2 text-base"
        />
      </label>
      <button
        type="submit"
        disabled={busy || value === String(team.requiredPeople)}
        className="rounded-md bg-teal-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        Kaydet
      </button>
      {saved && !error && <p className="text-xs text-teal-800">Kaydedildi.</p>}
      {error && <p role="alert" className="w-full text-xs text-red-700">{error}</p>}
    </form>
  );
}
