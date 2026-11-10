import { useRef } from 'react';

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
// Masaüstünde fareyle sürükleyerek ve tekerlekle yatay kaydırılır; sürükleme sonrası tıklama sekme değiştirmez.
export function TabBar({ tabs, activeKey, onSelect }: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ active: false, startX: 0, startLeft: 0, moved: false });

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'mouse' || !scrollerRef.current) return;
    drag.current = {
      active: true,
      startX: event.clientX,
      startLeft: scrollerRef.current.scrollLeft,
      moved: false,
    };
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const state = drag.current;
    if (!state.active || !scrollerRef.current) return;
    const dx = event.clientX - state.startX;
    if (Math.abs(dx) > 4) state.moved = true;
    scrollerRef.current.scrollLeft = state.startLeft - dx;
  }

  function endDrag() {
    drag.current.active = false;
  }

  function onWheel(event: React.WheelEvent<HTMLDivElement>) {
    if (!scrollerRef.current || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    scrollerRef.current.scrollLeft += event.deltaY;
  }

  function onClickTab(key: string) {
    if (drag.current.moved) {
      drag.current.moved = false;
      return;
    }
    onSelect(key);
  }

  return (
    <nav aria-label="Sekmeler" className="border-b border-slate-200 bg-white">
      <div
        ref={scrollerRef}
        role="tablist"
        className="no-scrollbar flex snap-x gap-1 overflow-x-auto px-2 select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onWheel={onWheel}
      >
        {tabs.map((tab) => {
          const selected = tab.key === activeKey;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onClickTab(tab.key)}
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
