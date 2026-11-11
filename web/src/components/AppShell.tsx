import { useCallback, useEffect, useState } from 'react';
import { getMyTeams, listTeams, logout, type CurrentUser, type Team, type TeamSummary } from '../api';
import { AllTasksScreen } from './AllTasksScreen';
import { AdminScreen } from './AdminScreen';
import { AssociationScreen } from './AssociationScreen';
import { FeedScreen } from './FeedScreen';
import { FeedbackScreen } from './FeedbackScreen';
import { MyTasksScreen } from './MyTasksScreen';
import { PoolScreen } from './PoolScreen';
import { ProjectsScreen } from './ProjectsScreen';
import { TabBar, type TabItem } from './TabBar';
import { TaskDetail } from './TaskDetail';
import { TaskForm } from './TaskForm';
import { TeamWorkspace } from './TeamWorkspace';
import { TeamsScreen } from './TeamsScreen';


type Props = {
  user: CurrentUser;
  onSignedOut: () => void;
};

const FIXED_TABS: TabItem[] = [
  { key: 'mine', label: 'İşlerim' },
  { key: 'pool', label: 'Havuz' },
  { key: 'projects', label: 'Faaliyetler' },
  { key: 'tasks', label: 'Tüm İşler' },
  { key: 'teams', label: 'Ekipler' },
  { key: 'feed', label: 'Akış' },
  { key: 'association', label: 'Dernek' },
];

// Yönetici tüm ekiplerin sayfasını salt okuma açabilir; sekme için bu liste Team biçimine çevrilir.
function summaryToTeam(team: TeamSummary): Team {
  return {
    id: team.id,
    name: team.name,
    description: team.description,
    type: team.type,
    term_start: team.termStart,
    term_end: team.termEnd,
    role_title: null,
  };
}

export function AppShell({ user, onSignedOut }: Props) {
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [allTeams, setAllTeams] = useState<Team[] | null>(null);
  const [teamsError, setTeamsError] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState('mine');
  const [reloadKey, setReloadKey] = useState(0);
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Ekip sekmeleri üyeliğe göre oluşur; yönetici için tüm ekipler listelenir. Katılma ve ayrılmada yeniden okunur.
  const loadTeams = useCallback(() => {
    getMyTeams()
      .then((list) => {
        setTeams(list);
        setTeamsError(null);
      })
      .catch(() => setTeamsError('Ekipler yüklenemedi.'));
    if (user.isAdmin) {
      listTeams()
        .then((list) => setAllTeams(list.map(summaryToTeam)))
        .catch(() => setTeamsError('Ekipler yüklenemedi.'));
    }
  }, [user.isAdmin]);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  const tabTeams = user.isAdmin ? allTeams : teams;
  const teamTabs: TabItem[] = (tabTeams ?? []).map((team) => ({ key: `team:${team.id}`, label: team.name }));
  const tabs = [...FIXED_TABS, ...(user.isAdmin ? [{ key: 'admin', label: 'Yönetim' }] : []), ...teamTabs, { key: 'feedback', label: 'Geri bildirim' }];
  const activeTeam = tabTeams?.find((team) => `team:${team.id}` === activeKey) ?? null;
  const showsTaskActions = activeKey === 'mine' || activeKey === 'pool';

  function refreshLists() {
    setReloadKey((value) => value + 1);
    loadTeams();
  }

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
          <button type="button" onClick={handleLogout} aria-label="Çıkış yap" title="Çıkış yap" className="rounded-md bg-white/15 p-2 font-medium">
            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v10" />
              <path d="M6.34 6.34a8 8 0 1 0 11.32 0" />
            </svg>
          </button>
        </div>
      </header>

      <TabBar tabs={tabs} activeKey={activeKey} onSelect={setActiveKey} />
      {teamsError && (
        <p role="alert" className="bg-red-50 px-4 py-2 text-sm text-red-800">
          {teamsError}
        </p>
      )}

      <main className="flex-1 px-4 pb-[max(5rem,env(safe-area-inset-bottom))] pt-5">
        {activeKey === 'mine' && (
          <MyTasksScreen reloadKey={reloadKey} onOpenTask={(id) => setOpenTask(id)} />
        )}
        {activeKey === 'pool' && (
          <PoolScreen
            reloadKey={reloadKey}
            onOpenTask={(id) => setOpenTask(id)}
            onChanged={refreshLists}
          />
        )}
        {activeKey === 'projects' && (
          <ProjectsScreen
            reloadKey={reloadKey}
            teams={teams ?? []}
            onOpenTask={(id) => setOpenTask(id)}
            onChanged={refreshLists}
          />
        )}
        {activeKey === 'tasks' && (
          <AllTasksScreen reloadKey={reloadKey} onOpenTask={(id) => setOpenTask(id)} />
        )}
        {activeKey === 'teams' && (
          <TeamsScreen reloadKey={reloadKey} isAdmin={user.isAdmin} onChanged={refreshLists} />
        )}
        {activeKey === 'feed' && (
          <FeedScreen key={reloadKey} reloadKey={reloadKey} onOpenTask={(id) => setOpenTask(id)} />
        )}
        {activeKey === 'association' && <AssociationScreen isAdmin={user.isAdmin} />}
        {activeKey === 'admin' && user.isAdmin && <AdminScreen />}
        {activeKey === 'feedback' && <FeedbackScreen />}
        {activeTeam && (
          <TeamWorkspace
            key={activeTeam.id}
            team={activeTeam}
            reloadKey={reloadKey}
            onOpenTask={(id) => setOpenTask(id)}
          />
        )}
      </main>

      {showsTaskActions && (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="fixed right-[max(1rem,calc((100vw-48rem)/2+1rem))] bottom-[max(1.25rem,env(safe-area-inset-bottom))] rounded-full bg-teal-700 px-5 py-3 font-semibold text-white shadow-lg"
        >
          + İş ekle
        </button>
      )}

      {openTask && (
        <TaskDetail
          key={openTask}
          taskId={openTask}
          currentUserId={user.id}
          isAdmin={user.isAdmin}
          onClose={() => setOpenTask(null)}
          onChanged={refreshLists}
        />
      )}

      {creating && (
        <TaskForm
          teams={teams ?? []}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            refreshLists();
          }}
        />
      )}
    </div>
  );
}
