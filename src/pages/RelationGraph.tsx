import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as RMouseEvent,
  type PointerEvent as RPointerEvent,
  type WheelEvent as RWheelEvent,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';
import { type Datum as FCDatum } from 'family-chart';
import {
  ArrowLeftOutlined,
  CalendarOutlined,
  DownloadOutlined,
  EditOutlined,
  EnvironmentOutlined,
  GiftOutlined,
  MoreOutlined,
  PartitionOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import {
  Button,
  Dropdown,
  Modal,
  Segmented,
  Skeleton,
  Tag,
} from 'antd';

import { listPersons } from '@/api/persons';
import { listRelations } from '@/api/relations';
import { listAddresses } from '@/api/addresses';
import { listEvents } from '@/api/events';
import { listTaxonomies } from '@/api/taxonomies';
import { getSettings } from '@/api/settings';
import FamilyChartView, { type FamilyChartHandle } from '@/components/FamilyChartView';
import { exportFamilyChartPng } from '@/lib/exportImage';
import { toast } from '@/lib/message';
import { getUpcomingBirthdays } from '@/lib/birthday';
import { getUpcomingAnniversaries } from '@/lib/anniversary';
import { aggregateByProvince } from '@/lib/address-region';
import {
  GENDER_SILHOUETTE_FILL,
  PersonAvatar,
} from '@/components/PersonAvatar';
import {
  KINSHIPS,
  birthOrderLabel,
  isParentRelation,
  isSpouseRelation,
  kinshipColor,
  kinshipLabel,
  relationColor,
  relationTier,
} from '@/lib/relations';
import type { Kinship } from '@/lib/relations';
import { useRelationLabel } from '@/lib/taxonomies';
import type { Address, EventItem, Person, Relation, Taxonomy } from '@/types';

const SILHOUETTE_PATH =
  'M256 288c79.5 0 144-64.5 144-144S335.5 0 256 0 112 64.5 112 144s64.5 144 144 144zm128 32h-55.1c-22.2 10.2-46.9 16-72.9 16s-50.6-5.8-72.9-16H128C57.3 320 0 377.3 0 448v16c0 26.5 21.5 48 48 48h416c26.5 0 48-21.5 48-48v-16c0-70.7-57.3-128-128-128z';

const GENDER_FG: Record<string, string> = {
  male: '#2563eb',
  female: '#db2777',
  unknown: '#64748b',
};
const GENDER_GLYPH: Record<string, string> = {
  male: '♂',
  female: '♀',
  unknown: '·',
};

const KIN_STYLE: Record<Kinship, { color: string; bg: string }> = {
  blood: { color: 'var(--color-kin-blood)', bg: 'var(--color-kin-blood-soft)' },
  quasi: { color: 'var(--color-kin-quasi)', bg: 'var(--color-kin-quasi-soft)' },
  in_law: { color: 'var(--color-kin-in-law)', bg: 'var(--color-kin-in-law-soft)' },
  social: { color: 'var(--color-kin-social)', bg: 'var(--color-kin-social-soft)' },
};

function personDisplayName(p: Person): string {
  return (
    p.real_name || p.standard_title || p.dialect_title || p.nickname || `#${p.id}`
  );
}

function personSubtitle(p: Person): string | null {
  if (p.real_name) {
    return p.standard_title || p.dialect_title || p.nickname || null;
  }
  return null;
}

function birthYear(p: Person): string | null {
  if (!p.birth_date) return null;
  const m = /^(\d{4})/.exec(p.birth_date);
  return m ? m[1] : null;
}

function buildFamilyChartData(
  persons: Person[],
  relations: Relation[]
): FCDatum[] {
  const visiblePersons = persons.filter((p) => p.kinship !== 'social');
  const visibleIds = new Set(visiblePersons.map((p) => p.id));

  const parentsOf = new Map<number, Set<number>>();
  const childrenOf = new Map<number, Set<number>>();
  const spousesOf = new Map<number, Set<number>>();
  const orderOfEdge = new Map<string, number>();
  const edgeKey = (parentId: number, childId: number) =>
    `${parentId}->${childId}`;

  const addParent = (
    parentId: number,
    childId: number,
    birthOrder: number | null = null
  ) => {
    if (!visibleIds.has(parentId) || !visibleIds.has(childId)) return;
    if (parentId === childId) return;
    if (!parentsOf.has(childId)) parentsOf.set(childId, new Set());
    parentsOf.get(childId)!.add(parentId);
    if (!childrenOf.has(parentId)) childrenOf.set(parentId, new Set());
    childrenOf.get(parentId)!.add(childId);
    if (birthOrder !== null && birthOrder > 0) {
      const k = edgeKey(parentId, childId);
      const existing = orderOfEdge.get(k);
      if (existing === undefined || birthOrder < existing) {
        orderOfEdge.set(k, birthOrder);
      }
    }
  };

  const addSpouse = (a: number, b: number) => {
    if (!visibleIds.has(a) || !visibleIds.has(b) || a === b) return;
    if (!spousesOf.has(a)) spousesOf.set(a, new Set());
    if (!spousesOf.has(b)) spousesOf.set(b, new Set());
    spousesOf.get(a)!.add(b);
    spousesOf.get(b)!.add(a);
  };

  for (const r of relations) {
    if (isParentRelation(r.relation_type)) {
      addParent(r.from_person_id, r.to_person_id, r.birth_order);
    } else if (isSpouseRelation(r.relation_type)) {
      addSpouse(r.from_person_id, r.to_person_id);
    }
  }

  for (const ps of parentsOf.values()) {
    const arr = Array.from(ps);
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        addSpouse(arr[i], arr[j]);
      }
    }
  }

  for (const [a, spouseSet] of spousesOf) {
    const aChildren = childrenOf.get(a);
    if (!aChildren || aChildren.size === 0) continue;
    for (const b of spouseSet) {
      for (const c of aChildren) {
        const inheritedOrder = orderOfEdge.get(edgeKey(a, c)) ?? null;
        addParent(b, c, inheritedOrder);
      }
    }
  }

  const sortedChildren = (parentId: number): string[] => {
    const set = childrenOf.get(parentId);
    if (!set) return [];
    return Array.from(set)
      .sort((a, b) => {
        const ao =
          orderOfEdge.get(edgeKey(parentId, a)) ?? Number.MAX_SAFE_INTEGER;
        const bo =
          orderOfEdge.get(edgeKey(parentId, b)) ?? Number.MAX_SAFE_INTEGER;
        if (ao !== bo) return ao - bo;
        return a - b;
      })
      .map(String);
  };

  return visiblePersons.map((p) => ({
    id: String(p.id),
    rels: {
      parents: Array.from(parentsOf.get(p.id) ?? []).map(String),
      spouses: Array.from(spousesOf.get(p.id) ?? []).map(String),
      children: sortedChildren(p.id),
    },
    data: {
      gender: p.gender === 'female' ? 'F' : 'M',
      'first name': personDisplayName(p),
      'last name': personSubtitle(p) ?? '',
      birthday: p.birth_date ?? '',
      avatar: p.avatar_url ?? '',
    },
  }));
}

function restrictToFamilyTree(rootId: string, fullData: FCDatum[]): FCDatum[] {
  const byId = new Map(fullData.map((d) => [d.id, d]));
  if (!byId.has(rootId)) return [];

  const visited = new Set<string>([rootId]);
  const queue: string[] = [rootId];
  while (queue.length) {
    const cur = queue.shift()!;
    const node = byId.get(cur);
    if (!node) continue;
    for (const c of node.rels.children ?? []) {
      if (byId.has(c) && !visited.has(c)) {
        visited.add(c);
        queue.push(c);
      }
    }
    for (const s of node.rels.spouses ?? []) {
      if (byId.has(s) && !visited.has(s)) {
        visited.add(s);
        queue.push(s);
      }
    }
  }

  return fullData
    .filter((d) => visited.has(d.id))
    .map((d) => ({
      ...d,
      rels: {
        ...d.rels,
        parents: (d.rels.parents ?? []).filter((p) => visited.has(p)),
        spouses: (d.rels.spouses ?? []).filter((s) => visited.has(s)),
        children: (d.rels.children ?? []).filter((c) => visited.has(c)),
      },
    }));
}

// ────────────────────────────────────────────────────────
// 力导图弹窗
// ────────────────────────────────────────────────────────

const MAX_DEPTH_LIMIT = 5;
const FG_NODE_R = 22;
const FG_CENTER_R = 28;
const FG_WIDTH = 860;
const FG_HEIGHT = 540;
const FG_CLIP_NORMAL = 'fg-clip-normal';
const FG_CLIP_CENTER = 'fg-clip-center';

interface SimPersonNode extends SimulationNodeDatum {
  id: number;
  depth: number;
}
interface SimPersonLink extends SimulationLinkDatum<SimPersonNode> {
  source: number | SimPersonNode;
  target: number | SimPersonNode;
  relation: Relation;
}

interface GraphStats {
  visibleCount: number;
  directCount: number;
  extendedCount: number;
  layerCount: number;
}

interface ForceGraphCanvasProps {
  centerId: number;
  relations: Relation[];
  personById: Map<number, Person>;
  maxDepth: number;
  hoveredId: number | null;
  onHoverChange: (id: number | null) => void;
  onSwitchPerson: (id: number) => void;
  onStatsChange: (s: GraphStats) => void;
}

function ForceGraphCanvas({
  centerId,
  relations,
  personById,
  maxDepth,
  hoveredId,
  onHoverChange,
  onSwitchPerson,
  onStatsChange,
}: ForceGraphCanvasProps) {
  const relationLabelOf = useRelationLabel();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const simRef = useRef<ReturnType<typeof forceSimulation<SimPersonNode>> | null>(
    null
  );
  const simNodesRef = useRef<SimPersonNode[]>([]);
  const simLinksRef = useRef<SimPersonLink[]>([]);
  const distRef = useRef<Map<number, number>>(new Map());
  const childrenInTreeRef = useRef<Map<number, number[]>>(new Map());

  const [, setTick] = useState(0);
  const [transform, setTransform] = useState({ tx: 0, ty: 0, k: 1 });

  const dragRef = useRef<{
    mode: 'node' | 'pan';
    nodeId?: number;
    startClientX: number;
    startClientY: number;
    startTx?: number;
    startTy?: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    dragRef.current = null;

    const parentsOf = new Map<number, Set<number>>();
    const childrenOf = new Map<number, Set<number>>();
    const spouseOf = new Map<number, Set<number>>();
    const pkey = (p: number, c: number) => `${p}->${c}`;
    const parentEdgeMeta = new Map<string, Relation>();

    for (const r of relations) {
      if (r.relation_type === 'parent') {
        if (!parentsOf.has(r.to_person_id))
          parentsOf.set(r.to_person_id, new Set());
        parentsOf.get(r.to_person_id)!.add(r.from_person_id);
        if (!childrenOf.has(r.from_person_id))
          childrenOf.set(r.from_person_id, new Set());
        childrenOf.get(r.from_person_id)!.add(r.to_person_id);
        parentEdgeMeta.set(pkey(r.from_person_id, r.to_person_id), r);
      } else if (r.relation_type === 'spouse') {
        if (!spouseOf.has(r.from_person_id))
          spouseOf.set(r.from_person_id, new Set());
        if (!spouseOf.has(r.to_person_id))
          spouseOf.set(r.to_person_id, new Set());
        spouseOf.get(r.from_person_id)!.add(r.to_person_id);
        spouseOf.get(r.to_person_id)!.add(r.from_person_id);
      }
    }
    for (const ps of parentsOf.values()) {
      const arr = Array.from(ps);
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          if (!spouseOf.has(arr[i])) spouseOf.set(arr[i], new Set());
          if (!spouseOf.has(arr[j])) spouseOf.set(arr[j], new Set());
          spouseOf.get(arr[i])!.add(arr[j]);
          spouseOf.get(arr[j])!.add(arr[i]);
        }
      }
    }

    let nextSynthId = -1;
    const synthetic: Relation[] = [];
    for (const [a, ss] of spouseOf) {
      const aKids = childrenOf.get(a);
      if (!aKids || aKids.size === 0) continue;
      for (const b of ss) {
        for (const c of aKids) {
          if (parentEdgeMeta.has(pkey(b, c))) continue;
          const inherited =
            parentEdgeMeta.get(pkey(a, c))?.birth_order ?? null;
          const synth: Relation = {
            id: nextSynthId--,
            from_person_id: b,
            to_person_id: c,
            relation_type: 'parent',
            birth_order: inherited,
            description: '由配偶派生',
            created_at: 0,
          };
          synthetic.push(synth);
          parentEdgeMeta.set(pkey(b, c), synth);
        }
      }
    }
    const effectiveRelations: Relation[] =
      synthetic.length > 0 ? [...relations, ...synthetic] : relations;

    const adj = new Map<number, Set<number>>();
    const ensureAdj = (id: number) => {
      if (!adj.has(id)) adj.set(id, new Set());
      return adj.get(id)!;
    };
    for (const r of effectiveRelations) {
      ensureAdj(r.from_person_id).add(r.to_person_id);
      ensureAdj(r.to_person_id).add(r.from_person_id);
    }

    const dist = new Map<number, number>();
    const childrenInTree = new Map<number, number[]>();
    dist.set(centerId, 0);
    const queue: number[] = [centerId];
    while (queue.length) {
      const cur = queue.shift()!;
      const curD = dist.get(cur)!;
      if (curD >= maxDepth) continue;
      const nbs = Array.from(adj.get(cur) ?? []).sort((a, b) => a - b);
      for (const nb of nbs) {
        if (dist.has(nb)) continue;
        if (!personById.has(nb)) continue;
        dist.set(nb, curD + 1);
        if (!childrenInTree.has(cur)) childrenInTree.set(cur, []);
        childrenInTree.get(cur)!.push(nb);
        queue.push(nb);
      }
    }

    const simNodes: SimPersonNode[] = Array.from(dist.entries()).map(
      ([id, depth]) => {
        const isCenter = id === centerId;
        const startR = isCenter ? 0 : 110 + (depth - 1) * 90;
        const angle = isCenter ? 0 : (id * 137.5 * Math.PI) / 180;
        return {
          id,
          depth,
          x: startR * Math.cos(angle),
          y: startR * Math.sin(angle),
          fx: isCenter ? 0 : null,
          fy: isCenter ? 0 : null,
        };
      }
    );

    const visibleIds = new Set(dist.keys());
    const simLinks: SimPersonLink[] = [];
    for (const r of effectiveRelations) {
      if (visibleIds.has(r.from_person_id) && visibleIds.has(r.to_person_id)) {
        simLinks.push({
          source: r.from_person_id,
          target: r.to_person_id,
          relation: r,
        });
      }
    }

    simNodesRef.current = simNodes;
    simLinksRef.current = simLinks;
    distRef.current = dist;
    childrenInTreeRef.current = childrenInTree;

    const sim = forceSimulation<SimPersonNode>(simNodes)
      .force('center', forceCenter(0, 0).strength(0.04))
      .force(
        'charge',
        forceManyBody<SimPersonNode>().strength((d) =>
          d.id === centerId ? -1200 : -380
        )
      )
      .force(
        'link',
        forceLink<SimPersonNode, SimPersonLink>(simLinks)
          .id((d) => d.id)
          .distance(120)
          .strength(0.5)
      )
      .force(
        'collide',
        forceCollide<SimPersonNode>(FG_NODE_R + 18).strength(0.9)
      )
      .alpha(1)
      .alphaDecay(0.025);
    simRef.current = sim;

    let raf = 0;
    sim.on('tick', () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setTick((t) => t + 1);
      });
    });

    let directCount = 0;
    let extendedCount = 0;
    for (const r of effectiveRelations) {
      const ad = dist.get(r.from_person_id);
      const bd = dist.get(r.to_person_id);
      if (ad === undefined || bd === undefined) continue;
      if (ad === 0 || bd === 0) directCount++;
      else extendedCount++;
    }
    const layerCount =
      dist.size > 0 ? Math.max(...Array.from(dist.values())) : 0;
    onStatsChange({
      visibleCount: simNodes.length,
      directCount,
      extendedCount,
      layerCount,
    });

    return () => {
      if (raf) cancelAnimationFrame(raf);
      sim.stop();
      simRef.current = null;
    };
  }, [centerId, maxDepth, relations, personById, onStatsChange]);

  useEffect(() => {
    setTransform({ tx: 0, ty: 0, k: 1 });
  }, [centerId]);

  const clientToGraph = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      const sx = clientX - rect.left - rect.width / 2;
      const sy = clientY - rect.top - rect.height / 2;
      const scale =
        Math.min(rect.width / FG_WIDTH, rect.height / FG_HEIGHT) || 1;
      const vx = sx / scale;
      const vy = sy / scale;
      return {
        x: (vx - transform.tx) / transform.k,
        y: (vy - transform.ty) / transform.k,
      };
    },
    [transform]
  );

  const handleNodePointerDown = useCallback(
    (e: RPointerEvent<SVGGElement>, nodeId: number) => {
      e.stopPropagation();
      const svg = svgRef.current;
      try {
        svg?.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      const sim = simRef.current;
      if (sim) sim.alphaTarget(0.3).restart();
      dragRef.current = {
        mode: 'node',
        nodeId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        moved: false,
      };
    },
    []
  );

  const handleSvgPointerDown = useCallback(
    (e: RPointerEvent<SVGSVGElement>) => {
      if (dragRef.current) return;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      dragRef.current = {
        mode: 'pan',
        startClientX: e.clientX,
        startClientY: e.clientY,
        startTx: transform.tx,
        startTy: transform.ty,
        moved: false,
      };
    },
    [transform.tx, transform.ty]
  );

  const handlePointerMove = useCallback(
    (e: RPointerEvent<SVGSVGElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      if (drag.mode === 'node' && drag.nodeId !== undefined) {
        const sn = simNodesRef.current.find((n) => n.id === drag.nodeId);
        if (!sn) return;
        const { x, y } = clientToGraph(e.clientX, e.clientY);
        sn.fx = x;
        sn.fy = y;
        drag.moved = true;
      } else if (
        drag.mode === 'pan' &&
        drag.startTx !== undefined &&
        drag.startTy !== undefined
      ) {
        const dx = e.clientX - drag.startClientX;
        const dy = e.clientY - drag.startClientY;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) drag.moved = true;
        const svg = svgRef.current;
        let scale = 1;
        if (svg) {
          const rect = svg.getBoundingClientRect();
          scale =
            Math.min(rect.width / FG_WIDTH, rect.height / FG_HEIGHT) || 1;
        }
        setTransform((t) => ({
          ...t,
          tx: drag.startTx! + dx / scale,
          ty: drag.startTy! + dy / scale,
        }));
      }
    },
    [clientToGraph]
  );

  const handlePointerUp = useCallback(() => {
    const drag = dragRef.current;
    if (drag?.mode === 'node') {
      const sim = simRef.current;
      if (sim) sim.alphaTarget(0);
    }
    dragRef.current = null;
  }, []);

  const handleWheel = useCallback((e: RWheelEvent<SVGSVGElement>) => {
    e.stopPropagation();
    e.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scale =
      Math.min(rect.width / FG_WIDTH, rect.height / FG_HEIGHT) || 1;
    const vx = (e.clientX - rect.left - rect.width / 2) / scale;
    const vy = (e.clientY - rect.top - rect.height / 2) / scale;
    setTransform((t) => {
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const newK = Math.min(2.5, Math.max(0.4, t.k * factor));
      const graphX = (vx - t.tx) / t.k;
      const graphY = (vy - t.ty) / t.k;
      return {
        tx: vx - graphX * newK,
        ty: vy - graphY * newK,
        k: newK,
      };
    });
  }, []);

  const handleNodeDoubleClick = useCallback(
    (e: RMouseEvent<SVGGElement>, nodeId: number) => {
      e.stopPropagation();
      if (nodeId === centerId) return;
      for (const sn of simNodesRef.current) {
        sn.fx = null;
        sn.fy = null;
      }
      onSwitchPerson(nodeId);
    },
    [centerId, onSwitchPerson]
  );

  const focusNeighbors = useMemo(() => {
    if (hoveredId === null || !distRef.current.has(hoveredId)) return null;
    const set = new Set<number>([hoveredId]);
    for (const link of simLinksRef.current) {
      const r = link.relation;
      if (r.from_person_id === hoveredId) set.add(r.to_person_id);
      else if (r.to_person_id === hoveredId) set.add(r.from_person_id);
    }
    return set;
  }, [hoveredId, relations]);

  return (
    <div
      className="relative h-[540px] overflow-hidden"
      style={{
        background:
          'radial-gradient(circle at center, #ffffff 0%, #fafafa 60%, #f1f5f9 100%)',
        border: '1px solid var(--color-border)',
        borderRadius: 10,
      }}
    >
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox={`${-FG_WIDTH / 2} ${-FG_HEIGHT / 2} ${FG_WIDTH} ${FG_HEIGHT}`}
        onPointerDown={handleSvgPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onWheel={handleWheel}
        style={{
          userSelect: 'none',
          touchAction: 'none',
          display: 'block',
        }}
      >
        <defs>
          <clipPath id={FG_CLIP_NORMAL}>
            <circle r={FG_NODE_R} />
          </clipPath>
          <clipPath id={FG_CLIP_CENTER}>
            <circle r={FG_CENTER_R} />
          </clipPath>
          <pattern
            id="fg-grid"
            x="0"
            y="0"
            width="26"
            height="26"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1" cy="1" r="0.8" fill="#e5e7eb" />
          </pattern>
        </defs>
        <rect
          x={-FG_WIDTH / 2 - 2000}
          y={-FG_HEIGHT / 2 - 2000}
          width={FG_WIDTH + 4000}
          height={FG_HEIGHT + 4000}
          fill="url(#fg-grid)"
          pointerEvents="none"
        />

        <g
          transform={`translate(${transform.tx} ${transform.ty}) scale(${transform.k})`}
        >
          {simLinksRef.current.map((link) => {
            const s = link.source as SimPersonNode;
            const t = link.target as SimPersonNode;
            const sx = s.x ?? 0;
            const sy = s.y ?? 0;
            const tx = t.x ?? 0;
            const ty = t.y ?? 0;
            const r = link.relation;
            const ad = distRef.current.get(r.from_person_id);
            const bd = distRef.current.get(r.to_person_id);
            if (ad === undefined || bd === undefined) return null;

            let label: string;
            const tier = relationTier(r.relation_type);
            if (r.relation_type === 'parent') {
              const fromP = personById.get(r.from_person_id);
              const toP = personById.get(r.to_person_id);
              if (ad <= bd) {
                label =
                  birthOrderLabel(r.birth_order, toP?.gender) ??
                  (toP?.gender === 'female'
                    ? '女儿'
                    : toP?.gender === 'male'
                      ? '儿子'
                      : '子女');
              } else {
                label =
                  fromP?.gender === 'female'
                    ? '母亲'
                    : fromP?.gender === 'male'
                      ? '父亲'
                      : '父母';
              }
            } else {
              label = relationLabelOf(r.relation_type);
            }

            const fromChildren =
              childrenInTreeRef.current.get(r.from_person_id) ?? [];
            const toChildren =
              childrenInTreeRef.current.get(r.to_person_id) ?? [];
            const isTreeEdge =
              fromChildren.includes(r.to_person_id) ||
              toChildren.includes(r.from_person_id);
            const involvesFocus =
              hoveredId === null ||
              r.from_person_id === hoveredId ||
              r.to_person_id === hoveredId;
            const dimmed = hoveredId !== null && !involvesFocus;

            const stroke = isTreeEdge
              ? tier === 'social'
                ? '#94a3b8'
                : relationColor(r.relation_type)
              : '#cbd5e1';
            const baseStrokeWidth = isTreeEdge ? 1.6 : 1.1;
            const strokeWidth =
              hoveredId !== null && involvesFocus
                ? baseStrokeWidth + 0.4
                : baseStrokeWidth;
            const opacity = dimmed ? 0.1 : isTreeEdge ? 1 : 0.7;
            const dasharray = !isTreeEdge
              ? '4 4'
              : tier === 'social'
                ? '5 4'
                : undefined;

            const showLabel = hoveredId !== null && involvesFocus;
            const mx = (sx + tx) / 2;
            const my = (sy + ty) / 2;
            const labelW = label.length * 12 + 8;

            return (
              <g key={`e-${r.id}`}>
                <line
                  x1={sx}
                  y1={sy}
                  x2={tx}
                  y2={ty}
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                  strokeDasharray={dasharray}
                  opacity={opacity}
                  pointerEvents="none"
                />
                {showLabel && (
                  <g pointerEvents="none">
                    <rect
                      x={mx - labelW / 2}
                      y={my - 9}
                      width={labelW}
                      height={16}
                      fill="#ffffff"
                      stroke="#e5e7eb"
                      rx={3}
                    />
                    <text
                      x={mx}
                      y={my}
                      dy="0.35em"
                      textAnchor="middle"
                      fontSize={11}
                      fill="#0a0a0a"
                      fontWeight={500}
                      style={{ userSelect: 'none' }}
                    >
                      {label}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {simNodesRef.current.map((sn) => {
            const p = personById.get(sn.id);
            if (!p) return null;
            const isCenter = sn.id === centerId;
            const r = isCenter ? FG_CENTER_R : FG_NODE_R;
            const accent = kinshipColor(p.kinship);
            const gender = p.gender ?? 'unknown';
            const name = personDisplayName(p);
            const dimmed = focusNeighbors !== null && !focusNeighbors.has(sn.id);
            const pinned = !isCenter && sn.fx !== null && sn.fx !== undefined;
            const x = sn.x ?? 0;
            const y = sn.y ?? 0;
            const truncatedName =
              name.length > 8 ? name.slice(0, 7) + '…' : name;
            const silhouetteScale = (1.24 * r) / 512;
            const silhouetteOffset = -0.62 * r;

            return (
              <g
                key={`n-${sn.id}`}
                transform={`translate(${x} ${y})`}
                opacity={dimmed ? 0.32 : 1}
                onPointerDown={(e) => handleNodePointerDown(e, sn.id)}
                onPointerEnter={() => onHoverChange(sn.id)}
                onPointerLeave={() => onHoverChange(null)}
                onDoubleClick={(e) => handleNodeDoubleClick(e, sn.id)}
                style={{ cursor: 'grab' }}
              >
                {isCenter && <circle r={r + 8} fill={accent} opacity={0.18} />}
                <circle r={r} fill="#ffffff" />
                {p.avatar_url ? (
                  <image
                    href={p.avatar_url}
                    x={-r}
                    y={-r}
                    width={r * 2}
                    height={r * 2}
                    clipPath={`url(#${isCenter ? FG_CLIP_CENTER : FG_CLIP_NORMAL})`}
                    preserveAspectRatio="xMidYMid slice"
                  />
                ) : (
                  <g
                    transform={`translate(${silhouetteOffset} ${silhouetteOffset}) scale(${silhouetteScale})`}
                    pointerEvents="none"
                  >
                    <path
                      d={SILHOUETTE_PATH}
                      fill={
                        GENDER_SILHOUETTE_FILL[gender] ??
                        GENDER_SILHOUETTE_FILL.unknown
                      }
                    />
                  </g>
                )}
                <circle
                  r={r}
                  fill="none"
                  stroke={accent}
                  strokeWidth={isCenter ? 2.5 : 1.5}
                />
                <text
                  x={r * 0.65}
                  y={-r * 0.6}
                  fontSize={11}
                  fontWeight={700}
                  fill={GENDER_FG[gender] ?? GENDER_FG.unknown}
                  style={{ userSelect: 'none', pointerEvents: 'none' }}
                >
                  {GENDER_GLYPH[gender] ?? GENDER_GLYPH.unknown}
                </text>
                {pinned && (
                  <circle
                    cx={r * 0.65}
                    cy={r * 0.55}
                    r={3.5}
                    fill="#0ea5e9"
                    stroke="#ffffff"
                    strokeWidth={1.4}
                  />
                )}
                <text
                  textAnchor="middle"
                  y={r + 14}
                  fontSize={isCenter ? 13 : 12}
                  fontWeight={isCenter ? 600 : 500}
                  fill="#0a0a0a"
                  style={{ userSelect: 'none', pointerEvents: 'none' }}
                >
                  {truncatedName}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {simNodesRef.current.length === 1 && (
        <div
          className="pointer-events-none absolute left-1/2 top-[60%] -translate-x-1/2 text-[13px] text-[var(--color-muted-fg)]"
        >
          这个人物还没有任何关系记录
        </div>
      )}
    </div>
  );
}

function DirectKinLine({
  label,
  items,
  onClick,
}: {
  label: string;
  items: Array<{ id: number; text: string }>;
  onClick: (id: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span
        className="min-w-9 text-[12px] font-semibold"
        style={{ color: 'var(--color-accent-strong)' }}
      >
        {label}
      </span>
      {items.map((it) => (
        <button
          key={it.id}
          onClick={() => onClick(it.id)}
          className="rounded px-2 py-0.5 text-[12px] font-medium transition-colors"
          style={{
            background: 'var(--color-accent-soft)',
            color: 'var(--color-accent-strong)',
            border: '1px solid transparent',
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.borderColor =
              'var(--color-accent-strong)')
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.borderColor = 'transparent')
          }
        >
          {it.text}
        </button>
      ))}
    </div>
  );
}

interface PersonNetworkModalProps {
  personId: number | null;
  persons: Person[];
  relations: Relation[];
  onClose: () => void;
  onEdit: (id: number) => void;
  onSwitchPerson: (id: number) => void;
}

function PersonNetworkModal({
  personId,
  persons,
  relations,
  onClose,
  onEdit,
  onSwitchPerson,
}: PersonNetworkModalProps) {
  const person =
    personId !== null ? persons.find((p) => p.id === personId) : null;
  const [maxDepth, setMaxDepth] = useState<number>(1);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [stats, setStats] = useState<GraphStats>({
    visibleCount: 0,
    directCount: 0,
    extendedCount: 0,
    layerCount: 0,
  });

  useEffect(() => {
    setHoveredId(null);
  }, [personId]);

  const personById = useMemo(
    () => new Map(persons.map((p) => [p.id, p])),
    [persons]
  );

  const handleStatsChange = useCallback((s: GraphStats) => setStats(s), []);

  const directParents = useMemo(() => {
    if (!person) return [] as Person[];
    return relations
      .filter(
        (r) => r.relation_type === 'parent' && r.to_person_id === person.id
      )
      .map((r) => personById.get(r.from_person_id))
      .filter((p): p is Person => !!p);
  }, [person, relations, personById]);

  const directChildren = useMemo(() => {
    if (!person)
      return [] as Array<{
        p: Person;
        order: number | null;
        viaSpouseOf: Person | null;
      }>;
    const myId = person.id;

    const spouseIds = new Set<number>();
    for (const r of relations) {
      if (r.relation_type === 'spouse') {
        if (r.from_person_id === myId) spouseIds.add(r.to_person_id);
        else if (r.to_person_id === myId) spouseIds.add(r.from_person_id);
      }
    }
    const myChildIds = new Set<number>();
    for (const r of relations) {
      if (r.relation_type === 'parent' && r.from_person_id === myId) {
        myChildIds.add(r.to_person_id);
      }
    }
    for (const r of relations) {
      if (
        r.relation_type === 'parent' &&
        myChildIds.has(r.to_person_id) &&
        r.from_person_id !== myId
      ) {
        spouseIds.add(r.from_person_id);
      }
    }

    const seen = new Set<number>();
    const items: Array<{
      p: Person;
      order: number | null;
      viaSpouseOf: Person | null;
    }> = [];

    for (const r of relations) {
      if (
        r.relation_type === 'parent' &&
        r.from_person_id === myId &&
        !seen.has(r.to_person_id)
      ) {
        const cp = personById.get(r.to_person_id);
        if (cp) {
          seen.add(r.to_person_id);
          items.push({ p: cp, order: r.birth_order, viaSpouseOf: null });
        }
      }
    }
    for (const sp of spouseIds) {
      const spouseP = personById.get(sp);
      for (const r of relations) {
        if (
          r.relation_type === 'parent' &&
          r.from_person_id === sp &&
          !seen.has(r.to_person_id)
        ) {
          const cp = personById.get(r.to_person_id);
          if (cp) {
            seen.add(r.to_person_id);
            items.push({
              p: cp,
              order: r.birth_order,
              viaSpouseOf: spouseP ?? null,
            });
          }
        }
      }
    }

    return items.sort((a, b) => {
      const ao = a.order ?? Number.MAX_SAFE_INTEGER;
      const bo = b.order ?? Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      return a.p.id - b.p.id;
    });
  }, [person, relations, personById]);

  const kinStyle = person
    ? KIN_STYLE[person.kinship] ?? KIN_STYLE.social
    : null;

  return (
    <Modal
      open={!!person}
      onCancel={onClose}
      footer={null}
      width="min(920px, 100vw - 32px)"
      destroyOnHidden
      styles={{ body: { padding: 0, maxHeight: '80dvh', overflowY: 'auto' } }}
    >
      {person && kinStyle && (
        <>
          <div
            className="flex items-center gap-3 px-5 py-4"
            style={{
              background: 'var(--color-card)',
              borderBottom: '1px solid var(--color-border)',
            }}
          >
            <PersonAvatar
              person={person}
              size={48}
              borderColor={`${kinshipColor(person.kinship)}55`}
            />
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-center gap-2">
                <span className="text-[20px] font-semibold tracking-tight">
                  {personDisplayName(person)}
                </span>
                <span
                  className="text-[15px] font-semibold"
                  style={{ color: GENDER_FG[person.gender ?? 'unknown'] }}
                >
                  {GENDER_GLYPH[person.gender ?? 'unknown']}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-[12px] text-[var(--color-muted-fg)]">
                <Tag
                  style={{
                    color: kinStyle.color,
                    background: kinStyle.bg,
                    border: 'none',
                    margin: 0,
                  }}
                >
                  {kinshipLabel(person.kinship)}
                </Tag>
                {personSubtitle(person) && (
                  <span>{personSubtitle(person)}</span>
                )}
                {birthYear(person) && (
                  <span className="font-mono">{birthYear(person)} 年</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 px-5 py-4">
            {(directParents.length > 0 || directChildren.length > 0) && (
              <div
                className="flex flex-col gap-1.5 px-4 py-3"
                style={{
                  background: 'var(--color-accent-soft)',
                  border: '1px solid var(--color-accent)',
                  borderRadius: 10,
                }}
              >
                {directParents.length > 0 && (
                  <DirectKinLine
                    label="父母"
                    items={directParents.map((p) => ({
                      id: p.id,
                      text:
                        (p.gender === 'female'
                          ? '母亲: '
                          : p.gender === 'male'
                            ? '父亲: '
                            : '') + personDisplayName(p),
                    }))}
                    onClick={onSwitchPerson}
                  />
                )}
                {directChildren.length > 0 && (
                  <DirectKinLine
                    label="子女"
                    items={directChildren.map(({ p, order, viaSpouseOf }) => {
                      const baseLabel =
                        birthOrderLabel(order, p.gender) ??
                        (p.gender === 'female'
                          ? '女儿'
                          : p.gender === 'male'
                            ? '儿子'
                            : '子女');
                      const suffix = viaSpouseOf
                        ? `（经配偶 ${personDisplayName(viaSpouseOf)}）`
                        : '';
                      return {
                        id: p.id,
                        text: `${baseLabel}: ${personDisplayName(p)}${suffix}`,
                      };
                    })}
                    onClick={onSwitchPerson}
                  />
                )}
              </div>
            )}

            <div
              className="flex flex-wrap items-center gap-3 px-3 py-2 text-[12px]"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
              }}
            >
              <span className="font-medium text-[var(--color-foreground)]">
                展开层级
              </span>
              <Segmented<number>
                value={maxDepth}
                onChange={(v) => setMaxDepth(Number(v))}
                options={Array.from(
                  { length: MAX_DEPTH_LIMIT },
                  (_, i) => i + 1
                ).map((n) => ({ label: String(n), value: n }))}
                size="small"
              />
              <span className="text-[var(--color-muted-fg)]">·</span>
              <span className="text-[var(--color-muted-fg)]">
                共 {stats.visibleCount} 人 · 直接 {stats.directCount} · 延伸{' '}
                {stats.extendedCount} · 实际深度 {stats.layerCount}
              </span>
              <span className="ml-auto hidden text-[var(--color-muted-fg)] md:inline">
                拖动节点固定 · 双击切换中心 · 浮起高亮邻居 · 滚轮缩放
              </span>
            </div>

            <ForceGraphCanvas
              centerId={person.id}
              relations={relations}
              personById={personById}
              maxDepth={maxDepth}
              hoveredId={hoveredId}
              onHoverChange={setHoveredId}
              onSwitchPerson={onSwitchPerson}
              onStatsChange={handleStatsChange}
            />

            <div className="flex flex-wrap items-center gap-3 text-[12px] text-[var(--color-muted-fg)]">
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-0.5 w-4 rounded-full"
                  style={{ background: kinshipColor('blood') }}
                />
                直接关系
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-0.5 w-4 rounded-full"
                  style={{
                    backgroundImage:
                      'repeating-linear-gradient(90deg, #94a3b8 0 4px, transparent 4px 7px)',
                  }}
                />
                延伸 / 跨层
              </span>
              <div className="ml-auto flex gap-2">
                <Button
                  icon={<EditOutlined />}
                  onClick={() => onEdit(person.id)}
                >
                  编辑此人
                </Button>
                <Button type="primary" onClick={onClose}>
                  关闭
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}

// ────────────────────────────────────────────────────────
// 主页面
// ────────────────────────────────────────────────────────

interface ForestRootStats {
  size: number;
  generations: number;
  directChildren: number;
  male: number;
  female: number;
  blood: number;
  inLaw: number;
  quasi: number;
}

interface ForestRoot {
  id: string;
  label: string;
  size: number;
  rootPerson: Person;
  stats: ForestRootStats;
}

export default function RelationGraphPage() {
  const navigate = useNavigate();
  const personsQ = useQuery({
    queryKey: ['persons'],
    queryFn: () => listPersons(),
  });
  const relationsQ = useQuery({
    queryKey: ['relations'],
    queryFn: () => listRelations(),
  });
  const settingsQ = useQuery({ queryKey: ['settings'], queryFn: getSettings });
  const addressesQ = useQuery({
    queryKey: ['addresses', 'all'],
    queryFn: () => listAddresses(),
  });
  const recentEventsQ = useQuery({
    queryKey: ['events', 'recent'],
    queryFn: () => listEvents(undefined, { limit: 100 }),
  });
  const taxonomiesQ = useQuery({
    queryKey: ['taxonomies', 'event_type'],
    queryFn: () => listTaxonomies('event_type'),
  });

  const [modalPersonId, setModalPersonId] = useState<number | null>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [selectedRootId, setSelectedRootId] = useState<string | null>(null);
  const [dashboardTreeId, setDashboardTreeId] = useState<string | null>(null);
  const chartRef = useRef<FamilyChartHandle>(null);
  const offscreenChartRef = useRef<FamilyChartHandle>(null);
  const [exportRootId, setExportRootId] = useState<string | null>(null);

  const toggleHide = useCallback((id: number) => {
    const key = String(id);
    setHiddenIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleEdit = useCallback(
    (id: number) => navigate(`/persons/${id}/edit`),
    [navigate]
  );

  const fcDataRaw = useMemo(
    () => buildFamilyChartData(personsQ.data ?? [], relationsQ.data ?? []),
    [personsQ.data, relationsQ.data]
  );

  const userRoots = useMemo<ForestRoot[]>(() => {
    const ids = settingsQ.data?.family_roots ?? [];
    if (ids.length === 0) return [];
    const personByIdLocal = new Map(
      (personsQ.data ?? []).map((p) => [p.id, p])
    );
    const fcById = new Map(fcDataRaw.map((d) => [d.id, d]));

    const computeStats = (rootId: string): ForestRootStats => {
      const root = fcById.get(rootId);
      if (!root) {
        return {
          size: 0,
          generations: 0,
          directChildren: 0,
          male: 0,
          female: 0,
          blood: 0,
          inLaw: 0,
          quasi: 0,
        };
      }

      let maxDepth = 0;
      {
        const seen = new Set<string>([rootId]);
        const q: Array<[string, number]> = [[rootId, 0]];
        while (q.length) {
          const [cur, d] = q.shift()!;
          if (d > maxDepth) maxDepth = d;
          const node = fcById.get(cur);
          for (const c of node?.rels.children ?? []) {
            if (!seen.has(c)) {
              seen.add(c);
              q.push([c, d + 1]);
            }
          }
        }
      }

      const visited = new Set<string>([rootId]);
      const queue: string[] = [rootId];
      while (queue.length) {
        const cur = queue.shift()!;
        const node = fcById.get(cur);
        for (const c of node?.rels.children ?? []) {
          if (!visited.has(c)) {
            visited.add(c);
            queue.push(c);
          }
        }
        for (const s of node?.rels.spouses ?? []) {
          if (!visited.has(s)) {
            visited.add(s);
            queue.push(s);
          }
        }
      }

      let male = 0,
        female = 0,
        blood = 0,
        inLaw = 0,
        quasi = 0;
      for (const idStr of visited) {
        const p = personByIdLocal.get(Number(idStr));
        if (!p) continue;
        if (p.gender === 'male') male++;
        else if (p.gender === 'female') female++;
        if (p.kinship === 'blood') blood++;
        else if (p.kinship === 'in_law') inLaw++;
        else if (p.kinship === 'quasi') quasi++;
      }

      return {
        size: visited.size,
        generations: maxDepth + 1,
        directChildren: (root.rels.children ?? []).length,
        male,
        female,
        blood,
        inLaw,
        quasi,
      };
    };

    return ids
      .map((id) => {
        const p = personByIdLocal.get(id);
        if (!p) return null;
        const stats = computeStats(String(id));
        const label = personDisplayName(p);
        return {
          id: String(id),
          label,
          size: stats.size,
          rootPerson: p,
          stats,
        };
      })
      .filter((x): x is ForestRoot => !!x);
  }, [settingsQ.data, personsQ.data, fcDataRaw]);

  useEffect(() => {
    if (
      selectedRootId !== null &&
      !userRoots.some((r) => r.id === selectedRootId)
    ) {
      setSelectedRootId(null);
    }
  }, [userRoots, selectedRootId]);

  useEffect(() => {
    if (!exportRootId) return;
    const timer = setTimeout(async () => {
      const el = offscreenChartRef.current?.getContainer();
      if (!el) {
        setExportRootId(null);
        return;
      }
      try {
        const tree = userRoots.find((r) => r.id === exportRootId);
        const name = tree?.label ?? '家族树';
        await exportFamilyChartPng(el, `${name}.png`);
      } catch (e: unknown) {
        toast.error((e as Error).message || '导出失败');
      } finally {
        setExportRootId(null);
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [exportRootId, userRoots]);

  const fcMainId = selectedRootId ?? undefined;

  const fcDataLimited = useMemo(() => {
    if (!fcMainId) return [];
    return restrictToFamilyTree(fcMainId, fcDataRaw);
  }, [fcMainId, fcDataRaw]);

  const fcData = useMemo(() => {
    if (hiddenIds.size === 0) return fcDataLimited;
    const byId = new Map(fcDataLimited.map((d) => [d.id, d]));
    const dropped = new Set<string>();
    const queue: string[] = [];
    for (const h of hiddenIds) {
      const node = byId.get(h);
      if (!node) continue;
      for (const c of node.rels.children ?? []) queue.push(c);
    }
    while (queue.length) {
      const cur = queue.shift()!;
      if (dropped.has(cur)) continue;
      dropped.add(cur);
      const node = byId.get(cur);
      for (const c of node?.rels.children ?? []) queue.push(c);
    }
    return fcDataLimited
      .filter((d) => !dropped.has(d.id))
      .map((d) => {
        const isHidden = hiddenIds.has(d.id);
        return {
          ...d,
          rels: {
            ...d.rels,
            parents: (d.rels.parents ?? []).filter((p) => !dropped.has(p)),
            spouses: (d.rels.spouses ?? []).filter((s) => !dropped.has(s)),
            children: isHidden
              ? []
              : (d.rels.children ?? []).filter((c) => !dropped.has(c)),
          },
          data: isHidden
            ? { ...d.data, 'last name': '⊕ 已折叠子孙' }
            : d.data,
        };
      });
  }, [fcDataLimited, hiddenIds]);

  const handleCardClick = useCallback((id: string) => {
    if (id.startsWith('__synth-')) return;
    const n = Number(id);
    if (!Number.isNaN(n)) setModalPersonId(n);
  }, []);

  if (personsQ.isLoading || relationsQ.isLoading || settingsQ.isLoading) {
    return <Skeleton active paragraph={{ rows: 8 }} />;
  }

  if ((personsQ.data?.length ?? 0) === 0) {
    return (
      <div
        className="flex flex-col items-center gap-3 px-6 py-16 text-center"
        style={{
          background: 'var(--color-card)',
          border: '1px dashed var(--color-border-strong)',
          borderRadius: 12,
        }}
      >
        <TeamOutlined
          style={{ fontSize: 32, color: 'var(--color-muted-fg)' }}
        />
        <h3 className="m-0 text-[18px] font-semibold">还没有人物</h3>
        <p className="m-0 text-[13px] text-[var(--color-muted-fg)]">
          先去「人物」录入一些人，再回来看家族树
        </p>
      </div>
    );
  }

  // ───── 大屏仪表盘 ─────
  if (selectedRootId === null) {
    if (userRoots.length === 0) {
      return (
        <div
          className="flex flex-col gap-3 px-6 py-12 text-center"
          style={{
            background: 'var(--color-card)',
            border: '1px dashed var(--color-border-strong)',
            borderRadius: 12,
          }}
        >
          <PartitionOutlined
            style={{ fontSize: 32, color: 'var(--color-accent-strong)', margin: '0 auto' }}
          />
          <h3 className="m-0 text-[18px] font-semibold">还没有家族树</h3>
          <p className="m-0 text-[13px] text-[var(--color-muted-fg)]">
            到「人物」详情里把"家族树根"开关打开，即可生成一棵家族树
          </p>
          <div className="mx-auto">
            <Button type="primary" onClick={() => navigate('/persons')}>
              去人物列表
            </Button>
          </div>
        </div>
      );
    }

    const activeTreeId = dashboardTreeId ?? userRoots[0]?.id ?? null;
    const activeTree = userRoots.find((r) => r.id === activeTreeId);
    const dashboardChartData = activeTreeId
      ? restrictToFamilyTree(activeTreeId, fcDataRaw)
      : [];

    return (
      <DashboardView
        persons={personsQ.data ?? []}
        addresses={addressesQ.data ?? []}
        allEvents={recentEventsQ.data?.data ?? []}
        taxonomies={taxonomiesQ.data ?? []}
        reminderDays={settingsQ.data?.reminder_days ?? 60}
        userRoots={userRoots}
        activeTreeId={activeTreeId}
        activeTree={activeTree}
        chartData={dashboardChartData}
        onSelectTree={setDashboardTreeId}
        onOpenTree={(id) => setSelectedRootId(id)}
        onExportTree={(id) => setExportRootId(id)}
        exportRootId={exportRootId}
        offscreenChartRef={offscreenChartRef}
        fcDataRaw={fcDataRaw}
      />
    );
  }

  // ───── 详情视图 ─────
  const currentTree = userRoots.find((r) => r.id === selectedRootId);
  return (
    <div className="flex flex-col gap-3 md:h-[calc(100dvh-9rem)]">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="text"
          size="small"
          icon={<ArrowLeftOutlined />}
          onClick={() => {
            setSelectedRootId(null);
            setHiddenIds(new Set());
          }}
        >
          <span className="hidden md:inline">返回</span>
        </Button>
        <h1 className="m-0 text-[22px] font-semibold tracking-tight md:text-[26px]">
          {currentTree?.label ?? '家族树'}
        </h1>
        {currentTree && (
          <span className="text-[13px] text-[var(--color-muted-fg)]">
            {currentTree.size} 人
          </span>
        )}
        {hiddenIds.size > 0 && (
          <Button size="small" onClick={() => setHiddenIds(new Set())}>
            展开全部 ({hiddenIds.size} 折叠中)
          </Button>
        )}
        <div
          className="ml-auto hidden md:flex flex-wrap items-center gap-2 px-3 py-1"
          style={{
            background: 'var(--color-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 999,
          }}
        >
          {KINSHIPS.map((k) => (
            <span
              key={k.key}
              title={k.description}
              className="inline-flex items-center gap-1.5 text-[12px] text-[var(--color-muted-fg)]"
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: k.color }}
              />
              {k.label}
            </span>
          ))}
        </div>
      </div>

      {/* 手机端图例：居中在图上方 */}
      <div
        className="flex md:hidden justify-center"
      >
        <div
          className="inline-flex items-center gap-2 px-3 py-1"
          style={{
            background: 'var(--color-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 999,
          }}
        >
          {KINSHIPS.map((k) => (
            <span
              key={k.key}
              className="inline-flex items-center gap-1 text-[11px] text-[var(--color-muted-fg)]"
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: k.color }}
              />
              {k.label}
            </span>
          ))}
        </div>
      </div>

      <div
        className="flex-1 overflow-hidden"
        style={{
          background: 'var(--color-card)',
          border: '1px solid var(--color-border)',
          borderRadius: 12,
        }}
      >
        <FamilyChartView
          ref={chartRef}
          data={fcData}
          mainId={fcMainId}
          onCardClick={handleCardClick}
          hiddenIds={hiddenIds}
          onToggleHide={toggleHide}
        />
      </div>

      <PersonNetworkModal
        personId={modalPersonId}
        persons={personsQ.data ?? []}
        relations={relationsQ.data ?? []}
        onClose={() => setModalPersonId(null)}
        onEdit={handleEdit}
        onSwitchPerson={(id) => setModalPersonId(id)}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────
// DashboardView
// ────────────────────────────────────────────────────────

interface DashboardViewProps {
  persons: Person[];
  addresses: Address[];
  allEvents: EventItem[];
  taxonomies: Taxonomy[];
  reminderDays: number;
  userRoots: ForestRoot[];
  activeTreeId: string | null;
  activeTree?: ForestRoot;
  chartData: FCDatum[];
  onSelectTree: (id: string) => void;
  onOpenTree: (id: string) => void;
  onExportTree: (id: string) => void;
  exportRootId: string | null;
  offscreenChartRef: React.RefObject<FamilyChartHandle | null>;
  fcDataRaw: FCDatum[];
}

function DashboardView({
  persons,
  addresses,
  allEvents,
  taxonomies,
  reminderDays,
  userRoots,
  activeTreeId,
  activeTree,
  chartData,
  onSelectTree,
  onOpenTree,
  onExportTree,
  exportRootId,
  offscreenChartRef,
  fcDataRaw,
}: DashboardViewProps) {
  const navigate = useNavigate();

  const stats = useMemo(() => {
    let male = 0;
    let female = 0;
    const byKinship: Record<Kinship, number> = {
      blood: 0,
      quasi: 0,
      in_law: 0,
      social: 0,
    };
    for (const p of persons) {
      if (p.gender === 'male') male++;
      else if (p.gender === 'female') female++;
      byKinship[p.kinship] = (byKinship[p.kinship] ?? 0) + 1;
    }
    return { male, female, byKinship };
  }, [persons]);

  const upcomingReminders = useMemo(() => {
    const birthdays = getUpcomingBirthdays(persons, reminderDays).map((b) => ({
      key: `b-${b.person.id}-${b.type}-${b.days}`,
      kind: 'birthday' as const,
      days: b.days,
      person: b.person,
      label: b.label,
      lunarType: b.type,
      title: null as string | null,
      subjects: null as Person[] | null,
      anniversaryLabel: null as string | null,
    }));
    const anniversaries = getUpcomingAnniversaries(allEvents, taxonomies, persons, reminderDays).map((a) => ({
      key: `a-${a.event.id}-${a.days}`,
      kind: 'anniversary' as const,
      days: a.days,
      person: null as Person | null,
      label: null as string | null,
      lunarType: null as string | null,
      title: a.event.title,
      subjects: a.subjects,
      anniversaryLabel: a.label,
    }));
    return [...birthdays, ...anniversaries]
      .sort((a, b) => a.days - b.days)
      .slice(0, 10);
  }, [persons, allEvents, taxonomies, reminderDays]);

  const provinceStats = useMemo(
    () => aggregateByProvince(addresses).slice(0, 8),
    [addresses]
  );
  const maxProvinceCount = provinceStats[0]?.count ?? 1;

  const total = persons.length;

  return (
    <div className="flex flex-col gap-4">
      {/* 顶部统计卡片 */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile
          icon={<TeamOutlined />}
          label="总人数"
          value={total}
          accent="var(--color-accent-strong)"
        />
        <StatTile
          icon={<PartitionOutlined />}
          label="家族树"
          value={userRoots.length}
          accent="var(--color-kin-blood)"
        />
        <StatTile
          icon={<CalendarOutlined />}
          label="提醒"
          value={upcomingReminders.length}
          accent="var(--color-kin-quasi)"
        />
        <StatTile
          icon={<EnvironmentOutlined />}
          label="地址"
          value={addresses.length}
          accent="var(--color-kin-in-law)"
        />
      </div>

      {/* 家族树切换条 */}
      {userRoots.length > 1 && (
        <div className="flex flex-wrap gap-2 overflow-x-auto">
          {userRoots.map((r) => {
            const active = r.id === activeTreeId;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => onSelectTree(r.id)}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-left transition-colors"
                style={{
                  background: active ? 'var(--color-accent-soft)' : 'var(--color-card)',
                  border: `1px solid ${active ? 'var(--color-accent-strong)' : 'var(--color-border)'}`,
                  cursor: 'pointer',
                  minWidth: 130,
                }}
              >
                <PersonAvatar person={r.rootPerson} size={28} />
                <div className="flex flex-col min-w-0">
                  <span
                    className="truncate text-[13px] font-medium"
                    style={{
                      color: active ? 'var(--color-accent-strong)' : 'var(--color-foreground)',
                    }}
                  >
                    {r.label}
                  </span>
                  <span className="text-[11px] text-[var(--color-muted-fg)]">
                    {r.stats.size}人 · {r.stats.generations}代
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* 主区域：左大右小 */}
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        {/* 家族树主图 */}
        <div
          className="relative flex flex-col"
          style={{
            background: 'var(--color-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 12,
            minHeight: 480,
            height: 'calc(100dvh - 22rem)',
          }}
        >
          <div className="flex items-center justify-between border-b px-4 py-2" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex items-center gap-2">
              <PartitionOutlined style={{ color: 'var(--color-accent-strong)' }} />
              <span className="text-[14px] font-semibold">
                {activeTree?.label ?? '家族树'}
              </span>
              {activeTree && (
                <span className="text-[11px] text-[var(--color-muted-fg)]">
                  {activeTree.stats.size}人 · {activeTree.stats.generations}代 · 直系{activeTree.stats.directChildren}
                </span>
              )}
            </div>
            {activeTreeId && (
              <Dropdown
                menu={{
                  items: [
                    {
                      key: 'open',
                      icon: <ArrowLeftOutlined style={{ transform: 'rotate(180deg)' }} />,
                      label: '展开详情',
                      onClick: () => onOpenTree(activeTreeId),
                    },
                    {
                      key: 'export',
                      icon: <DownloadOutlined />,
                      label: '导出图片',
                      onClick: () => onExportTree(activeTreeId),
                    },
                  ],
                }}
                trigger={['click']}
                placement="bottomRight"
              >
                <Button type="text" size="small" icon={<MoreOutlined />} />
              </Dropdown>
            )}
          </div>
          <div
            className="flex-1 overflow-hidden"
            onClick={() => activeTreeId && onOpenTree(activeTreeId)}
            style={{ cursor: 'pointer' }}
            title="点击进入详情视图"
          >
            {chartData.length > 0 ? (
              <FamilyChartView data={chartData} mainId={activeTreeId ?? undefined} />
            ) : (
              <div className="flex h-full items-center justify-center text-[var(--color-muted-fg)]">
                暂无数据
              </div>
            )}
          </div>
        </div>

        {/* 右侧面板 */}
        <div className="flex flex-col gap-4">
          {/* 近期提醒 */}
          <DashCard
            icon={<CalendarOutlined style={{ color: 'var(--color-kin-quasi)' }} />}
            title="近期提醒"
            empty={upcomingReminders.length === 0 ? '近期没有提醒（在设置 → 通用中调整天数）' : null}
          >
            <div className="flex flex-col gap-1.5">
              {upcomingReminders.map((item) => {
                if (item.kind === 'birthday' && item.person) {
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => navigate(`/persons/${item.person!.id}/edit`)}
                      className="flex items-center gap-2 rounded px-2 py-1 text-left text-[12px] transition-colors hover:bg-[var(--color-accent-soft)]"
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
                    >
                      <GiftOutlined style={{ color: '#d97706', fontSize: 14 }} />
                      <PersonAvatar person={item.person} size={22} />
                      <span className="flex-1 truncate font-medium text-[var(--color-foreground)]">
                        {item.person.real_name || item.person.dialect_title || item.person.nickname || `#${item.person.id}`}
                      </span>
                      <span className="text-[11px] text-[var(--color-muted-fg)]">
                        {item.label}
                      </span>
                      <span
                        style={{
                          color: item.lunarType === 'lunar' ? '#d97706' : 'var(--color-accent-strong)',
                          fontWeight: 500,
                        }}
                      >
                        {item.days === 0 ? '今天' : `${item.days}天`}
                      </span>
                    </button>
                  );
                }
                const names = (item.subjects ?? [])
                  .map((p) => p.real_name || p.dialect_title || p.nickname || `#${p.id}`)
                  .join('、');
                return (
                  <div
                    key={item.key}
                    className="flex items-center gap-2 px-2 py-1 text-[12px]"
                  >
                    <CalendarOutlined style={{ color: 'var(--color-kin-quasi)', fontSize: 14 }} />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[var(--color-foreground)]">
                        {item.title}
                      </span>
                      {names && (
                        <span className="truncate text-[11px] text-[var(--color-muted-fg)]">
                          {names}
                        </span>
                      )}
                    </div>
                    <span
                      className="rounded px-1 text-[10px]"
                      style={{
                        background: 'var(--color-kin-quasi-soft)',
                        color: 'var(--color-kin-quasi)',
                      }}
                    >
                      {item.anniversaryLabel}
                    </span>
                    <span className="text-[var(--color-kin-quasi)]" style={{ fontWeight: 500 }}>
                      {item.days === 0 ? '今天' : `${item.days}天后`}
                    </span>
                  </div>
                );
              })}
            </div>
          </DashCard>

          {/* 省市区分布 */}
          <DashCard
            icon={<EnvironmentOutlined style={{ color: 'var(--color-kin-in-law)' }} />}
            title="省份分布"
            empty={provinceStats.length === 0 ? '暂无地址数据' : null}
          >
            <div className="flex flex-col gap-1">
              {provinceStats.map((p) => (
                <div key={p.name} className="flex items-center gap-2 text-[12px]">
                  <span className="w-12 truncate text-[var(--color-foreground)]">{p.name}</span>
                  <div
                    className="h-2 flex-1 overflow-hidden rounded-full"
                    style={{ background: 'var(--color-hairline, var(--color-border))' }}
                  >
                    <div
                      className="h-full"
                      style={{
                        width: `${(p.count / maxProvinceCount) * 100}%`,
                        background: 'var(--color-accent-strong)',
                      }}
                    />
                  </div>
                  <span className="w-8 text-right text-[var(--color-muted-fg)]">{p.count}</span>
                </div>
              ))}
            </div>
          </DashCard>
        </div>
      </div>

      {/* 底部：人物统计 */}
      <div className="grid gap-4 md:grid-cols-2">
        <DashCard
          icon={<TeamOutlined style={{ color: 'var(--color-accent-strong)' }} />}
          title="性别分布"
        >
          <GenderBar male={stats.male} female={stats.female} unknown={total - stats.male - stats.female} />
        </DashCard>
        <DashCard
          icon={<TeamOutlined style={{ color: 'var(--color-kin-blood)' }} />}
          title="亲属类型"
        >
          <div className="flex flex-col gap-1.5">
            {KINSHIPS.map((k) => {
              const count = stats.byKinship[k.key] ?? 0;
              const pct = total > 0 ? (count / total) * 100 : 0;
              return (
                <div key={k.key} className="flex items-center gap-2 text-[12px]">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: k.color }}
                  />
                  <span className="w-12 text-[var(--color-foreground)]">{k.label}</span>
                  <div
                    className="h-2 flex-1 overflow-hidden rounded-full"
                    style={{ background: 'var(--color-hairline, var(--color-border))' }}
                  >
                    <div
                      className="h-full"
                      style={{ width: `${pct}%`, background: k.color }}
                    />
                  </div>
                  <span className="w-10 text-right text-[var(--color-muted-fg)]">
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        </DashCard>
      </div>

      {/* 离屏导出 */}
      {exportRootId && (
        <div
          aria-hidden
          style={{
            position: 'fixed',
            left: '-99999px',
            top: 0,
            width: 1600,
            height: 1200,
            pointerEvents: 'none',
          }}
        >
          <FamilyChartView
            ref={offscreenChartRef}
            data={restrictToFamilyTree(exportRootId, fcDataRaw)}
            mainId={exportRootId}
          />
        </div>
      )}
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  accent: string;
}) {
  return (
    <div
      className="flex items-center gap-3 rounded-lg px-4 py-3"
      style={{
        background: 'var(--color-card)',
        border: '1px solid var(--color-border)',
      }}
    >
      <span
        className="grid h-9 w-9 place-items-center rounded-md text-[16px]"
        style={{ background: 'var(--color-accent-soft)', color: accent }}
      >
        {icon}
      </span>
      <div className="flex flex-col">
        <span className="text-[11px] text-[var(--color-muted-fg)]">{label}</span>
        <span className="text-[20px] font-semibold leading-tight" style={{ color: accent }}>
          {value}
        </span>
      </div>
    </div>
  );
}

function DashCard({
  icon,
  title,
  empty,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  empty?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex flex-col rounded-lg"
      style={{
        background: 'var(--color-card)',
        border: '1px solid var(--color-border)',
      }}
    >
      <div
        className="flex items-center gap-2 border-b px-3 py-2 text-[13px] font-semibold"
        style={{ borderColor: 'var(--color-border)' }}
      >
        {icon}
        {title}
      </div>
      <div className="px-2 py-2">
        {empty ? (
          <div className="px-2 py-3 text-center text-[12px] text-[var(--color-muted-fg)]">
            {empty}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

function GenderBar({ male, female, unknown }: { male: number; female: number; unknown: number }) {
  const total = male + female + unknown;
  if (total === 0) {
    return (
      <div className="px-2 py-3 text-center text-[12px] text-[var(--color-muted-fg)]">
        暂无数据
      </div>
    );
  }
  const malePct = (male / total) * 100;
  const femalePct = (female / total) * 100;
  const unknownPct = (unknown / total) * 100;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-2.5 overflow-hidden rounded-full">
        <div style={{ width: `${malePct}%`, background: GENDER_SILHOUETTE_FILL.male }} />
        <div style={{ width: `${femalePct}%`, background: GENDER_SILHOUETTE_FILL.female }} />
        <div style={{ width: `${unknownPct}%`, background: GENDER_SILHOUETTE_FILL.unknown }} />
      </div>
      <div className="flex flex-wrap gap-3 text-[11px]">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full" style={{ background: GENDER_SILHOUETTE_FILL.male }} />
          男 {male}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full" style={{ background: GENDER_SILHOUETTE_FILL.female }} />
          女 {female}
        </span>
        {unknown > 0 && (
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ background: GENDER_SILHOUETTE_FILL.unknown }} />
            未知 {unknown}
          </span>
        )}
      </div>
    </div>
  );
}

