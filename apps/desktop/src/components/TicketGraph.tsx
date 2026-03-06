import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  Handle,
  Position,
  MarkerType,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from '@dagrejs/dagre';
import { FiX } from 'react-icons/fi';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MARKDOWN_COMPONENTS } from '@trace/shared-ui';

interface Ticket {
  id: string;
  title?: string;
  body: string;
  dependencies: string[];
}

interface TicketGraphProps {
  tickets: Ticket[];
}

const NODE_WIDTH = 240;
const NODE_HEIGHT = 80;

function getLayoutedElements(tickets: Ticket[]) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 60 });

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  for (const ticket of tickets) {
    g.setNode(ticket.id, { width: NODE_WIDTH, height: NODE_HEIGHT });

    const bodyPreview = ticket.body
      .split('\n')
      .filter((l) => l.trim())
      .slice(0, 2)
      .join('\n');

    nodes.push({
      id: ticket.id,
      position: { x: 0, y: 0 },
      data: { label: ticket.title || ticket.id, id: ticket.id, body: bodyPreview, fullBody: ticket.body },
      type: 'ticketNode',
    });

    for (const dep of ticket.dependencies) {
      edges.push({
        id: `${dep}->${ticket.id}`,
        source: dep,
        target: ticket.id,
        markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--color-accent)' },
        style: { stroke: 'var(--color-accent)', strokeWidth: 1.5 },
        animated: true,
      });
      g.setEdge(dep, ticket.id);
    }
  }

  dagre.layout(g);

  for (const node of nodes) {
    const pos = g.node(node.id);
    if (pos) {
      node.position = {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      };
    }
  }

  return { nodes, edges };
}

function TicketNode({ data }: { data: { label: string; body: string } }) {
  return (
    <div className="rounded-lg border border-edge bg-surface-elevated px-3 py-2 shadow-sm" style={{ width: NODE_WIDTH }}>
      <Handle type="target" position={Position.Top} className="!bg-transparent !w-0 !h-0 !border-0 !min-w-0 !min-h-0" />
      <div className="text-xs font-bold text-accent-light truncate">{data.label}</div>
      <div className="mt-1 text-[11px] text-muted leading-tight line-clamp-2">{data.body}</div>
      <Handle type="source" position={Position.Bottom} className="!bg-transparent !w-0 !h-0 !border-0 !min-w-0 !min-h-0" />
    </div>
  );
}

const nodeTypes = { ticketNode: TicketNode };

export function TicketGraph({ tickets }: TicketGraphProps) {
  const initialLayout = useMemo(() => getLayoutedElements(tickets), [tickets]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialLayout.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialLayout.edges);
  const [selectedTicket, setSelectedTicket] = useState<{ id: string; title: string; body: string } | null>(null);

  // Re-layout when tickets data changes
  useEffect(() => {
    const layout = getLayoutedElements(tickets);
    setNodes(layout.nodes);
    setEdges(layout.edges);
  }, [tickets, setNodes, setEdges]);

  const onInit = useCallback((instance: { fitView: () => void }) => {
    instance.fitView();
  }, []);

  const onNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    setSelectedTicket({ id: node.data.id as string, title: node.data.label as string, body: node.data.fullBody as string });
  }, []);

  // Close modal on Escape
  useEffect(() => {
    if (!selectedTicket) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedTicket(null);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [selectedTicket]);

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        onInit={onInit}
        onNodeClick={onNodeClick}
        fitView
        nodesConnectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        deleteKeyCode={null}
        proOptions={{ hideAttribution: true }}
        minZoom={0.2}
        maxZoom={2}
      >
        <Controls
          className="!bg-surface-elevated !border-edge !shadow-sm [&_button]:!bg-surface-elevated [&_button]:!border-edge [&_button]:!text-muted [&_button:hover]:!bg-surface-deep"
        />
        <MiniMap
          nodeColor="var(--color-accent)"
          maskColor="rgba(0,0,0,0.3)"
          className="!bg-surface-deep !border-edge"
        />
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="var(--color-edge)" />
      </ReactFlow>

      {selectedTicket && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/60"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSelectedTicket(null);
          }}
        >
          <div className="flex w-[520px] max-h-[70vh] flex-col rounded-lg border border-edge bg-surface shadow-xl">
            <div className="flex items-center justify-between border-b border-edge px-5 py-3">
              <h2 className="truncate text-sm font-semibold text-primary">
                {selectedTicket.title}
              </h2>
              <button
                type="button"
                onClick={() => setSelectedTicket(null)}
                className="rounded p-1 text-muted hover:bg-surface-elevated hover:text-primary"
              >
                <FiX className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="markdown-body text-sm text-primary leading-relaxed break-words">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
                  {selectedTicket.body}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
