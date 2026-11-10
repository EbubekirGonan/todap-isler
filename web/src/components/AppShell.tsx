import { useCallback, useEffect, useState } from 'react';
import { getMyTeams, logout, type CurrentUser, type Team } from '../api';
import { AllTasksScreen } from './AllTasksScreen';
import { AssociationScreen } from './AssociationScreen';
import { FeedScreen } from './FeedScreen';
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

export function AppShell({ user, onSignedOut }: Props) {
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [teamsError, setTeamsError] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState('mine');
  const [reloadKey, setReloadKey] = useState(0);
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Ekip sekmeleri üyeliğe göre oluştuğu için katılma ve ayrılmada yeniden okunur.
  const loadTeams = useCallback(() => {
    getMyTeams()
      .then((list) => {
        setTeams(list);
        setTeamsError(null);
      })
      .catch(() => setTeamsError('Ekipler yüklenemedi.'));
  }, []);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  const teamTabs: TabItem[] = (teams ?? []).map((team) => ({ key: `team:${team.id}`, label: team.name }));
  const tabs = [...FIXED_TABS, ...teamTabs];
  const activeTeam = teams?.find((team) => `team:${team.id}` === activeKey) ?? null;
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
          className="fixed right-4 bottom-[max(1.25rem,env(safe-area-inset-bottom))] rounded-full bg-teal-700 px-5 py-3 font-semibold text-white shadow-lg"
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
