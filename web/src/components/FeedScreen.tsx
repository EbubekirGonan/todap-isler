import { useMemo, useState } from 'react';
import { listFeed, type FeedEntry } from '../api';
import { formatDateTime, historyLabel } from '../format';
import { useLoad } from '../useLoad';
import { Spinner } from './Spinner';

type Props = {
  reloadKey: number;
  onOpenTask: (taskId: string) => void;
};

const PAGE_SIZE = 50;

const PROJECT_ACTION_LABELS: Record<string, string> = {
  created: 'Faaliyet oluşturdu',
  renamed: 'Faaliyetin adını değiştirdi',
  described: 'Faaliyetin açıklamasını değiştirdi',
  linked_team: 'Faaliyeti ekibe bağladı',
  unlinked_team: 'Faaliyetin ekip bağlantısını kaldırdı',
};

const TEAM_ACTION_LABELS: Record<string, string> = {
  joined: 'Ekibe katıldı',
  left: 'Ekipten ayrıldı',
  removed: 'Ekipten çıkarıldı',
};

// Akış, işlemlerin kayıt günlüğüdür. Sunucu kayıtları en yeniden eskiye verir.
export function FeedScreen({ reloadKey, onOpenTask }: Props) {
  const { data, error, loading } = useLoad(() => listFeed(), `feed:${reloadKey}`);
  const [olderEntries, setOlderEntries] = useState<FeedEntry[]>([]);
  const [pageHasMore, setPageHasMore] = useState<boolean | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);

  const entries = useMemo(() => dedupe([...(data ?? []), ...olderEntries]), [data, olderEntries]);
  const hasMore = pageHasMore ?? (data?.length ?? 0) === PAGE_SIZE;

  async function handleLoadMore() {
    const last = entries[entries.length - 1];
    if (!last) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await listFeed(last.createdAt);
      setOlderEntries((current) => [...current, ...page]);
      setPageHasMore(page.length === PAGE_SIZE);
    } catch (err) {
      setMoreError(err instanceof Error ? err.message : 'Yüklenemedi. Tekrar deneyin.');
    } finally {
      setLoadingMore(false);
    }
  }

  if (loading) return <Spinner />;
  if (error) return <p role="alert" className="text-red-700">{error}</p>;
  if (entries.length === 0) return <p className="text-slate-600">Henüz hareket yok.</p>;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-900">Akış</h2>

      <ol className="space-y-3">
        {groupEntries(entries).map((group) => (
          <li key={group.key} className="rounded-xl bg-white p-3 shadow-sm">
            <p className="text-sm text-slate-900">
              <span className="font-semibold">{group.userName}</span>{' '}
              {group.kind === 'task' ? (
                <button
                  type="button"
                  onClick={() => onOpenTask(group.entityId)}
                  className="text-left font-medium text-teal-800 underline underline-offset-2"
                >
                  {group.entityName}
                </button>
              ) : (
                <span className="font-medium">
                  {group.kind === 'project' ? 'Faaliyet: ' : 'Ekip: '}
                  {group.entityName}
                </span>
              )}{' '}
              üzerinde şunları yaptı:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
              {group.items.map((entry) => (
                <li key={entryKey(entry)}>{describe(entry)}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-slate-500">{formatDateTime(group.createdAt)}</p>
          </li>
        ))}
      </ol>

      {moreError && (
        <p role="alert" className="text-sm text-red-700">
          {moreError}
        </p>
      )}
      {hasMore && (
        <button
          type="button"
          onClick={handleLoadMore}
          disabled={loadingMore}
          className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 font-medium text-slate-800 disabled:opacity-60"
        >
          {loadingMore ? 'Yükleniyor…' : 'Daha fazla'}
        </button>
      )}
    </div>
  );
}

// Sayfa sınırında aynı zamanlı kayıtlar iki kez gelebilir; anahtarla tekilleştirilir.
function dedupe(list: FeedEntry[]): FeedEntry[] {
  const seen = new Set<string>();
  return list.filter((entry) => {
    const key = entryKey(entry);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

type FeedGroup = {
  key: string;
  kind: FeedEntry['kind'];
  entityId: string;
  entityName: string;
  userName: string;
  createdAt: string;
  items: FeedEntry[];
};

// Aynı kişinin aynı nesne üzerindeki ardışık kayıtları tek grupta toplar.
// Sunucu sırası en yeniden eskiye olduğu için, grubun zamanı ilk (en yeni) kaydın zamanıdır.
const GROUP_WINDOW_MS = 30 * 60 * 1000;

function groupEntries(list: FeedEntry[]): FeedGroup[] {
  const groups: FeedGroup[] = [];
  for (const entry of list) {
    const current = groups[groups.length - 1];
    const sameTarget =
      current !== undefined &&
      current.kind === entry.kind &&
      current.entityId === entry.entityId &&
      current.userName === entry.userName;
    const withinWindow =
      current !== undefined &&
      Math.abs(new Date(current.items[current.items.length - 1].createdAt).getTime() - new Date(entry.createdAt).getTime()) <=
        GROUP_WINDOW_MS;
    if (sameTarget && withinWindow) {
      current.items.push(entry);
    } else {
      groups.push({
        key: entryKey(entry),
        kind: entry.kind,
        entityId: entry.entityId,
        entityName: entry.entityName,
        userName: entry.userName,
        createdAt: entry.createdAt,
        items: [entry],
      });
    }
  }
  return groups;
}

function entryKey(entry: FeedEntry): string {
  return [entry.kind, entry.entityId, entry.createdAt, entry.userId, entry.action ?? '', entry.field ?? '', entry.oldValue ?? '', entry.newValue ?? ''].join('|');
}

function describe(entry: FeedEntry): string {
  if (entry.kind === 'task') return historyLabel(entry.field ?? '');
  if (entry.kind === 'project') return PROJECT_ACTION_LABELS[entry.action ?? ''] ?? 'Faaliyette değişiklik yaptı';
  if (entry.action === 'updated' && entry.field === 'required_people') {
    return `Kadro sayısını ${entry.oldValue ?? '?'} → ${entry.newValue ?? '?'} olarak değiştirdi`;
  }
  if (entry.action === 'updated' && entry.field === 'name') {
    return `Ekip adını ${entry.oldValue ?? '?'} → ${entry.newValue ?? '?'} olarak değiştirdi`;
  }
  if (entry.action === 'updated' && entry.field === 'description') {
    return 'Ekip açıklamasını değiştirdi';
  }
  return TEAM_ACTION_LABELS[entry.action ?? ''] ?? 'Ekipte değişiklik yaptı';
}
