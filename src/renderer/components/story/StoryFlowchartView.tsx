import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  ArrowDownUp,
  ArrowLeftRight,
  Activity,
  GitMerge,
  Flag,
  GitFork,
  RotateCcw,
} from 'lucide-react';
import type { ProjectData } from '@shared/types';
import { buildNarrativeFlowGraph, type FlowSegmentNode } from '@shared/defaults';
import { useAppStore } from '../../store/useAppStore';

interface StoryFlowchartViewProps {
  project: ProjectData;
  onJumpToSegment: (sceneId: string, blockId: string) => void;
  onEditChoiceEdge: (sceneId: string, blockId: string, optionId: string) => void;
}

const NODE_W = 240;
const NODE_H = 104;

export const StoryFlowchartView: React.FC<StoryFlowchartViewProps> = ({
  project,
  onJumpToSegment,
  onEditChoiceEdge,
}) => {
  const { mutateProject } = useAppStore();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const direction = project.flowLayout.direction;
  const showCausal = project.flowLayout.showCausalLinks;
  const savedPositions = project.flowLayout.nodePositions;

  const [zoom, setZoom] = useState(0.72);
  const [pan, setPan] = useState({ x: 24, y: 24 });
  const [panning, setPanning] = useState<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [draggingNode, setDraggingNode] = useState<{
    nodeId: string;
    startClientX: number;
    startClientY: number;
    origPos: { x: number; y: number };
    curPos: { x: number; y: number };
  } | null>(null);

  const graph = useMemo(() => buildNarrativeFlowGraph(project), [project]);

  // Compute deterministic layered auto-layout (TB or LR), overlaid with user-dragged persisted positions
  const autoPositions = useMemo(() => {
    const pos: Record<string, { x: number; y: number }> = {};
    const depthMap = new Map<string, number>();
    const adj = new Map<string, string[]>();
    for (const n of graph.nodes) adj.set(n.id, []);
    for (const e of graph.edges) {
      adj.get(e.fromNodeId)?.push(e.toNodeId);
    }

    const startNode = graph.nodes.find((n) => n.isStart) ?? graph.nodes[0];
    const queue: string[] = [];
    if (startNode) {
      depthMap.set(startNode.id, 0);
      queue.push(startNode.id);
    }
    while (queue.length > 0) {
      const u = queue.shift()!;
      const d = depthMap.get(u) ?? 0;
      for (const v of adj.get(u) ?? []) {
        if (!depthMap.has(v)) {
          depthMap.set(v, d + 1);
          queue.push(v);
        }
      }
    }
    // Place unreachable/orphan nodes at the end cleanly
    let maxD = Math.max(0, ...depthMap.values());
    for (const n of graph.nodes) {
      if (!depthMap.has(n.id)) {
        maxD += 1;
        depthMap.set(n.id, maxD);
      }
    }

    const buckets = new Map<number, FlowSegmentNode[]>();
    for (const n of graph.nodes) {
      const d = depthMap.get(n.id) ?? 0;
      if (!buckets.has(d)) buckets.set(d, []);
      buckets.get(d)!.push(n);
    }

    const gapMain = direction === 'TB' ? 175 : 310;
    const gapCross = direction === 'TB' ? 270 : 145;

    for (const [layer, items] of buckets.entries()) {
      items.forEach((item, idx) => {
        const crossOffset = (idx - (items.length - 1) / 2) * gapCross + 290;
        if (direction === 'TB') {
          pos[item.id] = { x: Math.max(24, crossOffset), y: 24 + layer * gapMain };
        } else {
          pos[item.id] = { x: 24 + layer * gapMain, y: Math.max(24, crossOffset) };
        }
      });
    }
    // Shift all auto positions left/up so minimum x/y starts cleanly near (24, 24)
    const vals = Object.values(pos);
    if (vals.length > 0) {
      const minX = Math.min(...vals.map((p) => p.x));
      const minY = Math.min(...vals.map((p) => p.y));
      for (const k of Object.keys(pos)) {
        pos[k] = { x: pos[k].x - minX + 28, y: pos[k].y - minY + 28 };
      }
    }
    return pos;
  }, [graph, direction]);

  const fitToViewport = () => {
    const el = containerRef.current;
    if (!el || graph.nodes.length === 0) return;
    const cw = el.clientWidth || 620;
    const ch = el.clientHeight || 560;
    let maxX = NODE_W + 40;
    let maxY = NODE_H + 40;
    for (const n of graph.nodes) {
      const p = savedPositions[n.id] ?? autoPositions[n.id] ?? { x: 28, y: 28 };
      maxX = Math.max(maxX, p.x + NODE_W + 40);
      maxY = Math.max(maxY, p.y + NODE_H + 40);
    }
    const nextZoom = Math.max(0.45, Math.min(0.95, Math.min((cw - 32) / maxX, (ch - 32) / maxY)));
    const offsetX = Math.max(12, Math.round((cw - maxX * nextZoom) / 2));
    setZoom(Number(nextZoom.toFixed(2)));
    setPan({ x: offsetX, y: 18 });
  };

  useEffect(() => {
    const t = requestAnimationFrame(fitToViewport);
    return () => cancelAnimationFrame(t);
  }, [direction, graph.nodes.length]);

  const getPos = (nodeId: string) => {
    if (draggingNode?.nodeId === nodeId) return draggingNode.curPos;
    return savedPositions[nodeId] ?? autoPositions[nodeId] ?? { x: 60, y: 60 };
  };

  const bounds = useMemo(() => {
    let maxX = 900;
    let maxY = 620;
    for (const n of graph.nodes) {
      const p = savedPositions[n.id] ?? autoPositions[n.id] ?? { x: 60, y: 60 };
      maxX = Math.max(maxX, p.x + NODE_W + 160);
      maxY = Math.max(maxY, p.y + NODE_H + 160);
    }
    return { w: maxX, h: maxY };
  }, [graph.nodes, savedPositions, autoPositions]);

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-flow-interactive="true"]')) return;
    setPanning({ startX: e.clientX, startY: e.clientY, origX: pan.x, origY: pan.y });
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (draggingNode) {
      const dx = (e.clientX - draggingNode.startClientX) / zoom;
      const dy = (e.clientY - draggingNode.startClientY) / zoom;
      setDraggingNode({
        ...draggingNode,
        curPos: {
          x: Math.max(10, Math.round(draggingNode.origPos.x + dx)),
          y: Math.max(10, Math.round(draggingNode.origPos.y + dy)),
        },
      });
      return;
    }
    if (panning) {
      setPan({
        x: panning.origX + (e.clientX - panning.startX),
        y: panning.origY + (e.clientY - panning.startY),
      });
    }
  };

  const handleCanvasMouseUp = () => {
    if (draggingNode) {
      const moved =
        Math.abs(draggingNode.curPos.x - draggingNode.origPos.x) > 3 ||
        Math.abs(draggingNode.curPos.y - draggingNode.origPos.y) > 3;
      if (moved) {
        const { nodeId, curPos } = draggingNode;
        mutateProject((draft) => {
          draft.flowLayout.nodePositions[nodeId] = curPos;
        });
      }
      setDraggingNode(null);
    }
    setPanning(null);
  };

  const toggleDirection = () => {
    mutateProject((draft) => {
      draft.flowLayout.direction = draft.flowLayout.direction === 'TB' ? 'LR' : 'TB';
      draft.flowLayout.nodePositions = {};
    });
  };

  const toggleCausalLinks = () => {
    mutateProject((draft) => {
      draft.flowLayout.showCausalLinks = !draft.flowLayout.showCausalLinks;
    });
  };

  const resetLayout = () => {
    mutateProject((draft) => {
      draft.flowLayout.nodePositions = {};
    });
    requestAnimationFrame(fitToViewport);
  };

  return (
    <div data-testid="story-flowchart-view" className="h-full w-full flex flex-col overflow-hidden relative bg-[#F3F0E8]">
      {/* Flowchart Control Bar */}
      <div className="px-3.5 py-2 border-b border-[#D7D1C6] bg-[#FBFAF5] flex items-center justify-between gap-2 flex-wrap z-10">
        <div className="flex items-center gap-1.5">
          <button
            onClick={toggleDirection}
            className="paper-btn-secondary px-2.5 py-1 text-[12px] inline-flex items-center gap-1.5"
          >
            {direction === 'TB' ? <ArrowDownUp size={13} /> : <ArrowLeftRight size={13} />}
            {direction === 'TB' ? '纵向布局' : '横向布局'}
          </button>
          <button
            data-testid="toggle-causal-links-btn"
            onClick={toggleCausalLinks}
            className={`px-2.5 py-1 rounded-md text-[12px] border inline-flex items-center gap-1.5 cursor-pointer ${
              showCausal
                ? 'bg-[#FDF5E6] border-[#E8C58E] text-[#9A5B00] font-medium'
                : 'bg-white border-[#D7D1C6] text-[#706A60]'
            }`}
          >
            <Activity size={13} />
            叙事因果连线 ({graph.causalEdges.length})
          </button>
          <button
            onClick={resetLayout}
            className="paper-btn-secondary px-2.5 py-1 text-[12px] inline-flex items-center gap-1"
            title="重新自动排列所有剧情段"
          >
            <RotateCcw size={12} />
            自动排列
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setZoom((z) => Math.max(0.4, Number((z - 0.1).toFixed(2))))}
            className="paper-btn-secondary p-1"
            title="缩小"
          >
            <ZoomOut size={14} />
          </button>
          <span className="text-[11.5px] text-[#706A60] w-11 text-center tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom((z) => Math.min(1.6, Number((z + 0.1).toFixed(2))))}
            className="paper-btn-secondary p-1"
            title="放大"
          >
            <ZoomIn size={14} />
          </button>
          <button
            onClick={fitToViewport}
            className="paper-btn-secondary p-1"
            title="自适应居中视图"
          >
            <Maximize2 size={13} />
          </button>
        </div>
      </div>

      {/* Interactive Pannable / Zoomable Canvas */}
      <div
        ref={containerRef}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        onMouseLeave={handleCanvasMouseUp}
        onWheel={(e) => {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            setZoom((z) => Math.max(0.4, Math.min(1.6, Number((z - e.deltaY * 0.001).toFixed(2)))));
          } else {
            setPan((p) => ({ x: p.x - e.deltaX * 0.5, y: p.y - e.deltaY * 0.5 }));
          }
        }}
        className={`flex-1 relative overflow-hidden ${panning ? 'cursor-grabbing' : 'cursor-grab'}`}
        style={{
          backgroundImage: 'radial-gradient(#D7D1C6 1px, transparent 1px)',
          backgroundSize: '22px 22px',
        }}
      >
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
            width: bounds.w,
            height: bounds.h,
            position: 'relative',
          }}
        >
          {/* SVG Layer for Route Edges & Causal State Read/Write Edges */}
          <svg
            width={bounds.w}
            height={bounds.h}
            className="absolute inset-0 overflow-visible pointer-events-none"
          >
            <defs>
              <marker id="arrow-route" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#706A60" />
              </marker>
              <marker id="arrow-choice" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#FF5A3D" />
              </marker>
              <marker id="arrow-causal" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#B86E00" />
              </marker>
            </defs>

            {/* Narrative Causal Edges (Variable Write -> Condition Read) */}
            {showCausal &&
              graph.causalEdges.map((ce) => {
                const a = getPos(ce.fromNodeId);
                const b = getPos(ce.toNodeId);
                const x1 = a.x + NODE_W;
                const y1 = a.y + NODE_H * 0.35;
                const x2 = b.x + NODE_W;
                const y2 = b.y + NODE_H * 0.65;
                const cx = Math.max(x1, x2) + 65;
                return (
                  <g key={ce.id}>
                    <path
                      d={`M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`}
                      fill="none"
                      stroke="#C98A1A"
                      strokeWidth={1.6}
                      strokeDasharray="5 4"
                      markerEnd="url(#arrow-causal)"
                      opacity={0.78}
                    />
                    <text
                      x={cx - 12}
                      y={(y1 + y2) / 2}
                      fontSize="11"
                      fill="#9A5B00"
                      className="select-none"
                    >
                      影响：{ce.variableName}
                    </text>
                  </g>
                );
              })}

            {/* Route Edges */}
            {graph.edges.map((edge) => {
              const a = getPos(edge.fromNodeId);
              const b = getPos(edge.toNodeId);
              const x1 = direction === 'TB' ? a.x + NODE_W / 2 : a.x + NODE_W;
              const y1 = direction === 'TB' ? a.y + NODE_H : a.y + NODE_H / 2;
              const x2 = direction === 'TB' ? b.x + NODE_W / 2 : b.x;
              const y2 = direction === 'TB' ? b.y : b.y + NODE_H / 2;
              const d =
                direction === 'TB'
                  ? `M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`
                  : `M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`;
              const isChoice = edge.edgeKind === 'choice';
              return (
                <path
                  key={edge.id}
                  d={d}
                  fill="none"
                  stroke={isChoice ? '#FF5A3D' : '#8A8377'}
                  strokeWidth={isChoice ? 2 : 1.6}
                  markerEnd={isChoice ? 'url(#arrow-choice)' : 'url(#arrow-route)'}
                />
              );
            })}
          </svg>

          {/* Clickable Edge Label Pills (Req 2.4: Clicking a choice edge opens that option's editor directly!) */}
          {graph.edges.map((edge) => {
            const a = getPos(edge.fromNodeId);
            const b = getPos(edge.toNodeId);
            const x1 = direction === 'TB' ? a.x + NODE_W / 2 : a.x + NODE_W;
            const y1 = direction === 'TB' ? a.y + NODE_H : a.y + NODE_H / 2;
            const x2 = direction === 'TB' ? b.x + NODE_W / 2 : b.x;
            const y2 = direction === 'TB' ? b.y : b.y + NODE_H / 2;
            const mx = (x1 + x2) / 2;
            const my = (y1 + y2) / 2;
            const isEditableChoice = edge.edgeKind === 'choice' && edge.sceneId && edge.blockId && edge.optionId;
            return (
              <button
                key={`lbl_${edge.id}`}
                data-flow-interactive="true"
                data-testid={isEditableChoice ? `flow-edge-choice-${edge.optionId}` : undefined}
                onClick={() => {
                  if (isEditableChoice) {
                    onEditChoiceEdge(edge.sceneId!, edge.blockId!, edge.optionId!);
                  }
                }}
                style={{ left: mx, top: my }}
                title={isEditableChoice ? '点击直接修改此选项与显示条件' : edge.label}
                className={`absolute -translate-x-1/2 -translate-y-1/2 px-2 py-0.5 rounded-full text-[11px] max-w-[210px] truncate border shadow-xs ${
                  isEditableChoice
                    ? 'bg-[#FFF1ED] border-[#FBCBC1] text-[#D94B30] hover:bg-[#FF5A3D] hover:text-white cursor-pointer font-medium'
                    : 'bg-[#FBFAF5] border-[#D7D1C6] text-[#706A60] cursor-default'
                }`}
              >
                {edge.label}
                {edge.conditionText ? `｜${edge.conditionText}` : ''}
              </button>
            );
          })}

          {/* Continuous Story Segment Nodes */}
          {graph.nodes.map((node) => {
            const p = getPos(node.id);
            const isMerge = graph.mergeNodeIds.has(node.id);
            return (
              <div
                key={node.id}
                data-flow-interactive="true"
                data-testid={`flow-node-${node.id}`}
                style={{ left: p.x, top: p.y, width: NODE_W, minHeight: NODE_H }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setDraggingNode({
                    nodeId: node.id,
                    startClientX: e.clientX,
                    startClientY: e.clientY,
                    origPos: p,
                    curPos: p,
                  });
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!draggingNode || (draggingNode.curPos.x === draggingNode.origPos.x && draggingNode.curPos.y === draggingNode.origPos.y)) {
                    onJumpToSegment(node.sceneId, node.firstBlockId);
                  }
                }}
                className={`absolute rounded-lg border p-3 select-none cursor-pointer transition-shadow hover:shadow-md ${
                  node.isDisabled
                    ? 'bg-[#EFECE3] border-[#D7D1C6] opacity-65'
                    : node.kind === 'ending'
                    ? 'bg-[#FCEEEC] border-[#E7B5AF]'
                    : node.kind === 'choice'
                    ? 'bg-white border-[#FF5A3D]'
                    : 'bg-white border-[#D7D1C6]'
                }`}
              >
                <div className="flex items-center justify-between gap-1.5 mb-1">
                  <span className="text-[10.5px] text-[#948D82] truncate">{node.chapterName}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    {node.isStart && (
                      <span className="px-1.5 py-0.2 rounded bg-[#FF5A3D] text-white text-[10px]">
                        开场
                      </span>
                    )}
                    {isMerge && (
                      <span className="px-1.5 py-0.2 rounded bg-[#EDF7F1] text-[#2A7B50] border border-[#C6E6D3] text-[10px] inline-flex items-center gap-0.5">
                        <GitMerge size={10} /> 汇合
                      </span>
                    )}
                    {node.kind === 'choice' && <GitFork size={12} className="text-[#FF5A3D]" />}
                    {node.kind === 'ending' && <Flag size={12} className="text-[#C93B2B]" />}
                  </div>
                </div>
                <div className="font-semibold text-[13px] text-[#171513] truncate">{node.title}</div>
                <div className="text-[11.5px] text-[#706A60] mt-1 line-clamp-2 leading-snug">
                  {node.previewText}
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[10.5px] text-[#948D82]">
                  <span>连续 {node.blockCount} 项剧情</span>
                  {node.writtenVariableIds.length > 0 && (
                    <span className="text-[#B86E00]">修改状态 ×{node.writtenVariableIds.length}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Minimap Navigator (Req 2.4) */}
        <div className="absolute right-3 bottom-3 w-[164px] h-[106px] rounded-md bg-[#FBFAF5]/95 border border-[#D7D1C6] shadow-sm p-1.5 pointer-events-none">
          <div className="text-[9.5px] text-[#948D82] mb-0.5">小地图概览</div>
          <svg viewBox={`0 0 ${bounds.w} ${bounds.h}`} className="w-full h-[82px]">
            {graph.edges.map((e) => {
              const a = getPos(e.fromNodeId);
              const b = getPos(e.toNodeId);
              return (
                <line
                  key={`mm_${e.id}`}
                  x1={a.x + NODE_W / 2}
                  y1={a.y + NODE_H / 2}
                  x2={b.x + NODE_W / 2}
                  y2={b.y + NODE_H / 2}
                  stroke={e.edgeKind === 'choice' ? '#FF5A3D' : '#B8B0A0'}
                  strokeWidth={8}
                />
              );
            })}
            {graph.nodes.map((n) => {
              const p = getPos(n.id);
              return (
                <rect
                  key={`mmn_${n.id}`}
                  x={p.x}
                  y={p.y}
                  width={NODE_W}
                  height={NODE_H}
                  rx={16}
                  fill={n.isStart ? '#FF5A3D' : n.kind === 'ending' ? '#C93B2B' : '#171513'}
                  opacity={0.75}
                />
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
};
