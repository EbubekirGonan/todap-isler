import { useEffect, useState } from 'react';
import { getMyTeams, logout, type CurrentUser, type Team } from '../api';
import { TabBar, type TabItem } from './TabBar';

type Props = {
  user: CurrentUser;
  onSignedOut: () => void;
};

const FIXED_TABS: TabItem[] = [
  { key: 'mine', label: 'İşlerim' },
  { key: 'pool', label: 'Havuz' },
  { key: 'projects', label: 'Projeler' },
  { key: 'tasks', label: 'Görevler' },
  { key: 'association', label: 'Dernek' },
];

const FIXED_TAB_TITLES: Record<string, string> = Object.fromEntries(FIXED_TABS.map((tab) => [tab.key, tab.label]));

export function AppShell({ user, onSignedOut }: Props) {
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [teamsError, setTeamsError] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState('mine');

  useEffect(() => {
    let cancelled = false;
    getMyTeams()
      .then((list) => {
        if (!cancelled) setTeams(list);
      })
      .catch(() => {
        if (!cancelled) setTeamsError('Ekipler yüklenemedi.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const teamTabs: TabItem[] = (teams ?? []).map((team) => ({ key: `team:${team.id}`, label: team.name }));
  const tabs = [...FIXED_TABS, ...teamTabs];
  const activeTeam = teams?.find((team) => `team:${team.id}` === activeKey) ?? null;

  async function handleLogout() {
    try {
      await logout();
    } finally {
      onSignedOut();
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col bg-slate-50">
      <header className="flex items-center justify-between bg-teal-700 px-4 py-3 text-white">
        <span className="text-lg font-bold">Todap</span>
        <div className="flex items-center gap-3 text-sm">
          <span className="max-w-[10rem] truncate">{user.name}</span>
          <button type="button" onClick={handleLogout} className="rounded-md bg-white/15 px-3 py-1.5 font-medium">
            Çıkış yap
          </button>
        </div>
      </header>

      <TabBar tabs={tabs} activeKey={activeKey} onSelect={setActiveKey} />
      {teamsError && (
        <p role="alert" className="bg-red-50 px-4 py-2 text-sm text-red-800">
          {teamsError}
        </p>
      )}

      <main className="flex-1 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5">
        {activeTeam ? (
          <TabPlaceholder
            title={activeTeam.name}
            text={activeTeam.role_title ? `Rolünüz: ${activeTeam.role_title}` : 'Ekip içeriği sonraki aşamalarda eklenecek.'}
          />
        ) : (
          <TabPlaceholder
            title={FIXED_TAB_TITLES[activeKey] ?? 'Todap'}
            text="Bu ekranın içeriği sonraki aşamalarda eklenecek."
          />
        )}
      </main>
    </div>
  );
}

function TabPlaceholder({ title, text }: { title: string; text: string }) {
  return (
    <section className="rounded-xl border border-dashed border-slate-300 bg-white p-6">
      <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
      <p className="mt-2 text-slate-600">{text}</p>
    </section>
  );
}
