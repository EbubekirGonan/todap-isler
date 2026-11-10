import { useState, type FormEvent } from 'react';
import {
  createTeam,
  getTeam,
  joinTeam,
  leaveTeam,
  listTeams,
  removeTeamMember,
  updateTeam,
  type TeamDetail,
  type TeamMember,
  type TeamSummary,
} from '../api';
import { formatDateOnly } from '../format';
import { useLoad } from '../useLoad';
import { Sheet } from './Sheet';
import { Spinner } from './Spinner';

type Props = {
  reloadKey: number;
  isAdmin: boolean;
  onChanged: () => void;
};

const MAX_REQUIRED_PEOPLE = 1000;

export function TeamsScreen({ reloadKey, isAdmin, onChanged }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
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
        isAdmin={isAdmin}
        onBack={() => setSelectedId(null)}
        onChanged={handleChanged}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">Ekipler</h2>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="rounded-md bg-teal-700 px-3 py-2 text-sm font-medium text-white"
        >
          Ekip ekle
        </button>
      </div>

      {creating && (
        <TeamForm
          onSaved={() => {
            setCreating(false);
            handleChanged();
          }}
          onClose={() => setCreating(false)}
        />
      )}

      {loading && <Spinner />}
      {!loading && error && <p role="alert" className="text-red-700">{error}</p>}
      {!loading && !error && data && data.length === 0 && <p className="text-slate-600">Henüz ekip yok.</p>}
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
  isAdmin,
  onBack,
  onChanged,
}: {
  teamId: string;
  version: string;
  isAdmin: boolean;
  onBack: () => void;
  onChanged: () => void;
}) {
  const { data: team, error, loading } = useLoad(() => getTeam(teamId), `team:${teamId}:${version}`);

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="text-sm font-medium text-teal-800">
        ← Ekipler
      </button>

      {loading && <Spinner />}
      {!loading && error && <p role="alert" className="text-red-700">{error}</p>}
      {!loading && !error && team && (
        <TeamDetailContent team={team} isAdmin={isAdmin} onChanged={onChanged} />
      )}
    </div>
  );
}

function TeamDetailContent({
  team,
  isAdmin,
  onChanged,
}: {
  team: TeamDetail;
  isAdmin: boolean;
  onChanged: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const termText =
    team.type === 'term' && team.termStart && team.termEnd
      ? `Dönem: ${formatDateOnly(team.termStart)} – ${formatDateOnly(team.termEnd)}`
      : team.type === 'term'
        ? 'Dönemlik ekip'
        : 'Sürekli ekip';

  // Yönetici, ekipten kişi çıkarmak için önce üye listesini açar ve seçer.
  async function handleRemoveMember(member: TeamMember) {
    if (!window.confirm(`${member.name} ekipten çıkarılsın mı?`)) return;
    setRemovingId(member.userId);
    setRemoveError(null);
    try {
      await removeTeamMember(team.id, member.userId);
      onChanged();
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : 'Kişi çıkarılamadı. Tekrar deneyin.');
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-xl font-semibold text-slate-900">{team.name}</h2>
          <div className="relative">
            <button
              type="button"
              aria-label="Ekip işlemleri"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
              className="rounded-md px-2 py-1 text-lg leading-none text-slate-600 hover:bg-slate-100"
            >
              ⋮
            </button>
            {menuOpen && (
              <div role="menu" className="absolute right-0 z-10 mt-1 w-40 rounded-md bg-white py-1 shadow-lg ring-1 ring-slate-200">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setEditing(true);
                  }}
                  className="block w-full px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-100"
                >
                  Düzenle
                </button>
                {isAdmin && team.members.length > 0 && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      setRemoveOpen((open) => !open);
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-100"
                  >
                    Kişi çıkar
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        {team.description && <p className="mt-2 text-sm text-slate-700">{team.description}</p>}
        <p className="mt-2 text-xs text-slate-500">{termText}</p>
        <TeamCapacity team={team} />
        <div className="mt-3">
          <MembershipButton team={team} onChanged={onChanged} />
        </div>
      </section>

      {editing && (
        <TeamForm
          team={team}
          onSaved={() => {
            setEditing(false);
            onChanged();
          }}
          onClose={() => setEditing(false)}
        />
      )}

      {removeOpen && isAdmin && (
        <section aria-label="Ekipten kişi çıkar" className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-900">Ekipten kim çıkarılsın?</h3>
          {removeError && <p role="alert" className="mb-2 text-xs text-red-700">{removeError}</p>}
          <ul className="space-y-2">
            {team.members.map((member) => (
              <li key={member.userId} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-slate-800">{member.name}</span>
                <button
                  type="button"
                  disabled={removingId !== null}
                  onClick={() => handleRemoveMember(member)}
                  className="rounded-md bg-white px-3 py-1.5 text-sm ring-1 ring-slate-200 disabled:opacity-50"
                >
                  Çıkar
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

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

// Ekip ekleme ve düzenleme formu. Düzenlemede tür ve dönem değiştirilmez.
function TeamForm({ team, onSaved, onClose }: { team?: TeamDetail; onSaved: () => void; onClose: () => void }) {
  const isEdit = Boolean(team);
  const [name, setName] = useState(team?.name ?? '');
  const [description, setDescription] = useState(team?.description ?? '');
  const [type, setType] = useState<'term' | 'ongoing'>('ongoing');
  const [termStart, setTermStart] = useState('');
  const [termEnd, setTermEnd] = useState('');
  const [requiredPeople, setRequiredPeople] = useState(String(team?.requiredPeople ?? 0));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Ekip adı zorunludur.');
      return;
    }
    const count = Number(requiredPeople);
    if (!Number.isInteger(count) || count < 0 || count > MAX_REQUIRED_PEOPLE) {
      setError(`Gerekli kişi sayısı 0 ile ${MAX_REQUIRED_PEOPLE} arasında olmalıdır.`);
      return;
    }
    if (!isEdit && type === 'term') {
      if (!termStart || !termEnd) {
        setError('Dönemli ekipte başlangıç ve bitiş tarihi zorunludur.');
        return;
      }
      if (termEnd < termStart) {
        setError('Bitiş tarihi başlangıç tarihinden önce olamaz.');
        return;
      }
    }

    setBusy(true);
    setError(null);
    try {
      const trimmedDescription = description.trim() || null;
      if (team) {
        await updateTeam(team.id, { name: trimmedName, description: trimmedDescription, requiredPeople: count });
      } else {
        const isTerm = type === 'term';
        await createTeam({
          name: trimmedName,
          description: trimmedDescription,
          type,
          termStart: isTerm ? termStart : null,
          termEnd: isTerm ? termEnd : null,
          requiredPeople: count,
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaydedilemedi. Tekrar deneyin.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={isEdit ? 'Ekibi düzenle' : 'Yeni ekip'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-sm font-medium text-slate-800">
          Ekip adı
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={100}
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
            maxLength={2000}
            rows={3}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base"
          />
        </label>

        {!isEdit && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-slate-800">Ekip türü</legend>
            <label className="flex items-center gap-2 text-sm text-slate-800">
              <input
                type="radio"
                name="team-type"
                checked={type === 'ongoing'}
                onChange={() => setType('ongoing')}
                className="h-4 w-4 border-slate-300 text-teal-700"
              />
              Sürekli ekip
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-800">
              <input
                type="radio"
                name="team-type"
                checked={type === 'term'}
                onChange={() => setType('term')}
                className="h-4 w-4 border-slate-300 text-teal-700"
              />
              Dönemli ekip
            </label>
          </fieldset>
        )}

        {!isEdit && type === 'term' && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium text-slate-800">
              Dönem başlangıcı
              <input
                type="date"
                value={termStart}
                onChange={(event) => setTermStart(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base"
              />
            </label>
            <label className="block text-sm font-medium text-slate-800">
              Dönem bitişi
              <input
                type="date"
                value={termEnd}
                onChange={(event) => setTermEnd(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base"
              />
            </label>
          </div>
        )}

        <label className="block text-sm font-medium text-slate-800">
          Gerekli kişi sayısı
          <input
            type="number"
            min={0}
            max={MAX_REQUIRED_PEOPLE}
            value={requiredPeople}
            onChange={(event) => setRequiredPeople(event.target.value)}
            className="mt-1 block w-28 rounded-md border border-slate-300 px-3 py-2 text-base"
          />
        </label>

        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-teal-700 px-4 py-3 font-medium text-white disabled:opacity-50"
        >
          {busy ? 'Kaydediliyor…' : isEdit ? 'Kaydet' : 'Ekibi ekle'}
        </button>
      </form>
    </Sheet>
  );
}

