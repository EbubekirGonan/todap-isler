import { listAssociationTeams, type AssociationTeam } from '../api';
import { formatDateOnly } from '../format';
import { useLoad } from '../useLoad';
import { Spinner } from './Spinner';

export function AssociationScreen() {
  const { data, error, loading } = useLoad(listAssociationTeams, 'association');

  if (loading) return <Spinner />;
  if (error) return <p role="alert" className="text-red-700">{error}</p>;
  if (!data || data.length === 0) {
    return <p className="text-slate-600">Henüz ekip kurulmadı.</p>;
  }

  return (
    <ul className="space-y-3">
      {data.map((team) => (
        <li key={team.id}>
          <AssociationTeamCard team={team} />
        </li>
      ))}
    </ul>
  );
}

function AssociationTeamCard({ team }: { team: AssociationTeam }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold text-slate-900">{team.name}</h2>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
          {team.type === 'term' ? 'Dönemli' : 'Süresiz'}
        </span>
      </div>
      {team.type === 'term' && team.termStart && team.termEnd && (
        <p className="mt-1 text-sm text-slate-600">
          {formatDateOnly(team.termStart)} – {formatDateOnly(team.termEnd)}
        </p>
      )}
      {team.description && <p className="mt-2 text-sm text-slate-700">{team.description}</p>}

      <h3 className="mt-3 text-sm font-semibold text-slate-800">Üyeler</h3>
      {team.members.length === 0 ? (
        <p className="mt-1 text-sm text-slate-500">Henüz üye yok.</p>
      ) : (
        <ul className="mt-1 space-y-1 text-sm text-slate-700">
          {team.members.map((member) => (
            <li key={member.userId}>
              {member.name}
              {member.roleTitle && <span className="text-slate-500"> · {member.roleTitle}</span>}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
