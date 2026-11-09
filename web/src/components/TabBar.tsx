export type TabItem = {
  key: string;
  label: string;
};

type Props = {
  tabs: TabItem[];
  activeKey: string;
  onSelect: (key: string) => void;
};

// Yatay kaydırılabilir sekme çubuğu; ekip sekmeleri kişinin üyeliğine göre listeye eklenir.
export function TabBar({ tabs, activeKey, onSelect }: Props) {
  return (
    <nav aria-label="Sekmeler" className="border-b border-slate-200 bg-white">
      <div role="tablist" className="no-scrollbar flex snap-x gap-1 overflow-x-auto px-2">
        {tabs.map((tab) => {
          const selected = tab.key === activeKey;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onSelect(tab.key)}
              className={`shrink-0 snap-start whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium ${
                selected ? 'border-teal-700 text-teal-800' : 'border-transparent text-slate-600'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
