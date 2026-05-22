import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { createChart, type Datum, type TreeDatum } from 'family-chart';
import 'family-chart/styles/family-chart.css';

type Chart = ReturnType<typeof createChart>;

export interface FamilyChartHandle {
  getContainer: () => HTMLDivElement | null;
}

interface FamilyChartViewProps {
  data: Datum[];
  mainId?: string;
  onCardClick?: (personId: string) => void;
  hiddenIds?: Set<string>;
  onToggleHide?: (id: number) => void;
}

const FamilyChartView = forwardRef<FamilyChartHandle, FamilyChartViewProps>(function FamilyChartView({
  data,
  mainId,
  onCardClick,
  hiddenIds,
  onToggleHide,
}, ref) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<Chart | null>(null);
  const onCardClickRef = useRef(onCardClick);
  onCardClickRef.current = onCardClick;
  const hiddenIdsRef = useRef<Set<string>>(hiddenIds ?? new Set());
  hiddenIdsRef.current = hiddenIds ?? new Set();
  const onToggleHideRef = useRef(onToggleHide);
  onToggleHideRef.current = onToggleHide;

  useImperativeHandle(ref, () => ({
    getContainer: () => containerRef.current,
  }));

  useEffect(() => {
    const cont = containerRef.current;
    if (!cont) return;
    cont.innerHTML = '';

    const isMobile = window.innerWidth < 640;
    const chart = createChart(cont, data)
      .setTransitionTime(450)
      .setCardXSpacing(isMobile ? 160 : 150)
      .setCardYSpacing(isMobile ? 120 : 110)
      .setSingleParentEmptyCard(false)
      .setShowSiblingsOfMain(true);

    chart
      .setCardHtml()
      .setCardDisplay([
        ['first name', 'last name'],
        ['birthday'],
      ])
      .setCardImageField('avatar')
      .setStyle('imageRect')
      .setOnHoverPathToMain()
      .setOnCardClick((_e: MouseEvent, d: TreeDatum) => {
        onCardClickRef.current?.(d.data.id);
      });

    chartRef.current = chart;
    if (mainId) {
      try {
        chart.updateMainId(mainId);
      } catch {
        /* mainId 不在数据里时忽略 */
      }
    }
    chart.updateTree({ initial: true });

    return () => {
      chartRef.current = null;
      cont.innerHTML = '';
    };
    // 创建一次：data / mainId 变更走下面的 useEffect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.updateData(data);
    if (mainId) {
      try {
        chart.updateMainId(mainId);
      } catch {
        /* ignore */
      }
    }
    chart.updateTree({});
  }, [data, mainId]);

  // —— 给每个卡片注入悬浮折叠按钮 ——
  // family-chart 内部用 d3 频繁重建 .card DOM，所以用 MutationObserver 持续接管
  useEffect(() => {
    const cont = containerRef.current;
    if (!cont) return;

    const inject = (cardEl: HTMLElement) => {
      if (cardEl.querySelector(':scope > .f3-fold-btn')) return;
      const id = cardEl.getAttribute('data-id');
      if (!id) return;
      const isHidden = hiddenIdsRef.current.has(id);
      cardEl.classList.toggle('card-folded', isHidden);
      const btn = document.createElement('div');
      btn.className = 'f3-fold-btn';
      btn.setAttribute('role', 'button');
      btn.setAttribute('aria-label', isHidden ? '展开此分支' : '折叠此分支');
      btn.title = isHidden ? '展开此分支子孙' : '折叠此分支子孙';
      btn.textContent = isHidden ? '+' : '−';
      btn.addEventListener('pointerdown', (e) => e.stopPropagation());
      btn.addEventListener('mousedown', (e) => e.stopPropagation());
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        onToggleHideRef.current?.(Number(id));
      });
      cardEl.appendChild(btn);
    };

    cont.querySelectorAll<HTMLElement>('.card[data-id]').forEach(inject);

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const n of m.addedNodes) {
          if (!(n instanceof HTMLElement)) continue;
          if (n.matches?.('.card[data-id]')) inject(n);
          n.querySelectorAll?.('.card[data-id]').forEach((el) =>
            inject(el as HTMLElement)
          );
        }
      }
    });
    observer.observe(cont, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  // hiddenIds 变化时刷新已存在按钮的图标 / class
  useEffect(() => {
    const cont = containerRef.current;
    if (!cont) return;
    cont.querySelectorAll<HTMLElement>('.card[data-id]').forEach((cardEl) => {
      const id = cardEl.getAttribute('data-id');
      if (!id) return;
      const isHidden = hiddenIds?.has(id) ?? false;
      cardEl.classList.toggle('card-folded', isHidden);
      const btn = cardEl.querySelector<HTMLElement>(':scope > .f3-fold-btn');
      if (!btn) return;
      btn.textContent = isHidden ? '+' : '−';
      btn.title = isHidden ? '展开此分支子孙' : '折叠此分支子孙';
      btn.setAttribute('aria-label', isHidden ? '展开此分支' : '折叠此分支');
    });
  }, [hiddenIds]);

  return (
    <div
      ref={containerRef}
      className="f3 f3-light bg-muted/40"
      style={{
        width: '100%',
        height: '100%',
        // @ts-expect-error CSS 变量
        '--background-color': 'var(--card)',
        '--text-color': 'var(--foreground)',
      }}
    />
  );
});

export default FamilyChartView;
