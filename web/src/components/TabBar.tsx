import { useEffect, useRef } from 'react';

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
  const animationRef = useRef<number | null>(null);
  const drag = useRef({ active: false, startX: 0, startLeft: 0, lastX: 0, lastTime: 0, velocity: 0, moved: false });

  function stopMomentum() {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
  }

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    function onWheel(event: WheelEvent) {
      stopMomentum();
      if (!scroller || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      const factor = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? scroller.clientWidth : 1;
      const delta = event.deltaY * factor;
      const max = scroller.scrollWidth - scroller.clientWidth;
      if ((delta < 0 && scroller.scrollLeft <= 0) || (delta > 0 && scroller.scrollLeft >= max)) return;
      event.preventDefault();
      scroller.scrollLeft += delta;
    }

    scroller.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      scroller.removeEventListener('wheel', onWheel);
      stopMomentum();
    };
  }, []);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    stopMomentum();
    if (event.pointerType !== 'mouse' || event.button !== 0 || !scrollerRef.current) {
      drag.current.active = false;
      drag.current.moved = false;
      return;
    }
    drag.current = {
      active: true,
      startX: event.clientX,
      startLeft: scrollerRef.current.scrollLeft,
      lastX: event.clientX,
      lastTime: performance.now(),
      velocity: 0,
      moved: false,
    };
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const state = drag.current;
    if (!state.active || !scrollerRef.current) return;
    const dx = event.clientX - state.startX;
    if (Math.abs(dx) <= 4 && !state.moved) return;
    if (!state.moved) {
      state.moved = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const now = performance.now();
    const elapsed = now - state.lastTime;
    if (elapsed > 0) state.velocity = Math.max(-2.5, Math.min(2.5, (state.lastX - event.clientX) / elapsed));
    state.lastX = event.clientX;
    state.lastTime = now;
    scrollerRef.current.scrollLeft = state.startLeft - dx;
  }

  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    const state = drag.current;
    if (!state.active) return;
    state.active = false;
    if (event.type !== 'pointerup' || !state.moved || performance.now() - state.lastTime > 80
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let velocity = state.velocity;
    let lastTime = performance.now();
    function animate(now: number) {
      const scroller = scrollerRef.current;
      if (!scroller) return;
      const elapsed = Math.min(now - lastTime, 32);
      lastTime = now;
      const before = scroller.scrollLeft;
      scroller.scrollLeft += velocity * elapsed;
      velocity *= Math.pow(0.94, elapsed / 16.67);
      if (Math.abs(velocity) < 0.02 || scroller.scrollLeft === before) {
        animationRef.current = null;
        return;
      }
      animationRef.current = requestAnimationFrame(animate);
    }
    animationRef.current = requestAnimationFrame(animate);
  }

  function onClickTab(event: React.MouseEvent<HTMLButtonElement>, key: string) {
    if (event.detail > 0 && drag.current.moved) {
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
        className="no-scrollbar flex gap-1 overflow-x-auto px-2 select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) endDrag(event);
        }}
      >
        {tabs.map((tab) => {
          const selected = tab.key === activeKey;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={(event) => onClickTab(event, tab.key)}
              className={`shrink-0 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium ${
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
