'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { 
  Brain, 
  ArrowLeft, 
  Loader2, 
  GitBranch, 
  ZoomIn, 
  ZoomOut, 
  RefreshCw, 
  Search, 
  Filter, 
  Layers, 
  Folder, 
  Tag, 
  CheckSquare, 
  Sparkles,
  Database,
  ExternalLink,
  MessageSquare,
  HelpCircle
} from 'lucide-react';
import ProGate from '@/components/pro-gate';
import { isProUser } from '@/lib/clip-limits';

interface GraphNode {
  id: string;
  name: string;
  type: 'clip' | 'folder' | 'tag' | 'task' | 'entity';
  properties: {
    content_preview?: string;
    clip_type?: string;
    entity_type?: string;
    created_at?: string;
  };
  // Physics properties
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

interface GraphEdge {
  id: string;
  source: string; // source node ID
  target: string; // target node ID
  type: string;   // 'related_to' | 'mentions' | 'belongs_to' | 'generated_from' | 'similar_to'
  strength: number;
}

const NODE_COLORS = {
  clip: { stroke: '#6366f1', fill: 'rgba(99, 102, 241, 0.15)', glow: 'rgba(99, 102, 241, 0.4)' }, // Indigo
  folder: { stroke: '#fbbf24', fill: 'rgba(251, 191, 36, 0.15)', glow: 'rgba(251, 191, 36, 0.4)' }, // Gold
  tag: { stroke: '#ec4899', fill: 'rgba(236, 72, 153, 0.15)', glow: 'rgba(236, 72, 153, 0.4)' }, // Pink
  task: { stroke: '#10b981', fill: 'rgba(16, 185, 129, 0.15)', glow: 'rgba(16, 185, 129, 0.4)' }, // Emerald
  entity: { stroke: '#06b6d4', fill: 'rgba(6, 182, 212, 0.15)', glow: 'rgba(6, 182, 212, 0.4)' }  // Cyan
};

export default function KnowledgeGraphPage() {
  const router = useRouter();
  const [userPlan, setUserPlan] = useState<'free' | 'pro'>('free');
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // UI states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [visibleTypes, setVisibleTypes] = useState({
    clip: true,
    folder: true,
    tag: true,
    task: true,
    entity: true
  });

  // Canvas Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simulationRef = useRef<{ nodes: GraphNode[]; edges: GraphEdge[] }>({ nodes: [], edges: [] });
  
  // View states (zoom & pan)
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const transformRef = useRef({ x: 0, y: 0, k: 1 });

  // Mouse drag states
  const dragNodeRef = useRef<GraphNode | null>(null);
  const isPanningRef = useRef(false);
  const startPanRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user: currentUser } }) => {
      if (!currentUser) {
        router.push('/login');
        return;
      }

      supabase
        .from('users')
        .select('plan, trial_ends_at')
        .eq('id', currentUser.id)
        .single()
        .then(({ data: profile }) => {
          if (profile) {
            setUserPlan(profile.plan || 'free');
            setTrialEndsAt(profile.trial_ends_at);
          }
          
          const isPro = isProUser(profile?.plan || 'free', profile?.trial_ends_at || null);
          if (isPro) {
            loadGraphData();
          } else {
            setLoading(false);
          }
        });
    });
  }, [router]);

  const isPro = isProUser(userPlan, trialEndsAt);

  const loadGraphData = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);

      const response = await fetch('/api/graph/data');
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to fetch graph data');
      }

      const data = await response.json();
      
      // Initialize physics coordinates for loaded nodes
      const loadedNodes: GraphNode[] = (data.nodes || []).map((node: any, index: number) => {
        const angle = (index / data.nodes.length) * Math.PI * 2;
        const radius = 180 + Math.random() * 50;
        return {
          ...node,
          x: 400 + Math.cos(angle) * radius,
          y: 300 + Math.sin(angle) * radius,
          vx: 0,
          vy: 0,
          radius: node.type === 'clip' ? 14 : node.type === 'folder' ? 12 : 10
        };
      });

      setNodes(loadedNodes);
      setEdges(data.edges || []);
      
      // sync simulation ref
      simulationRef.current = { nodes: loadedNodes, edges: data.edges || [] };
      
      // Center view
      centerGraph(loadedNodes);
      setLoading(false);
    } catch (err: any) {
      console.error('Error loading graph:', err);
      setErrorMsg(err.message || 'Error occurred');
      setLoading(false);
    }
  };

  // Center the graph in viewport
  const centerGraph = (currentNodes = nodes) => {
    if (currentNodes.length === 0) return;
    
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    
    currentNodes.forEach(n => {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    });

    const graphCenterX = (minX + maxX) / 2;
    const graphCenterY = (minY + maxY) / 2;

    const canvas = canvasRef.current;
    const viewWidth = canvas ? canvas.clientWidth : 800;
    const viewHeight = canvas ? canvas.clientHeight : 600;

    const dx = viewWidth / 2 - graphCenterX;
    const dy = viewHeight / 2 - graphCenterY;

    const newTransform = { x: dx, y: dy, k: 0.95 };
    setTransform(newTransform);
    transformRef.current = newTransform;
  };

  // Setup the physics simulation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || nodes.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const resize = () => {
      if (canvas.parentElement) {
        canvas.width = canvas.parentElement.clientWidth;
        canvas.height = canvas.parentElement.clientHeight;
      }
    };
    resize();
    window.addEventListener('resize', resize);

    const runSimulationStep = () => {
      const { nodes: simNodes, edges: simEdges } = simulationRef.current;
      const nodesMap = new Map<string, GraphNode>();
      simNodes.forEach(n => nodesMap.set(n.id, n));

      const width = canvas.width;
      const height = canvas.height;
      const centerX = width / 2;
      const centerY = height / 2;

      // 1. Charge force: Repel nodes from each other
      for (let i = 0; i < simNodes.length; i++) {
        const nodeA = simNodes[i];
        for (let j = i + 1; j < simNodes.length; j++) {
          const nodeB = simNodes[j];
          const dx = nodeB.x - nodeA.x;
          const dy = nodeB.y - nodeA.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          
          // Repel range
          const repRange = 160;
          if (dist < repRange) {
            const force = (repRange - dist) * 0.12;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            
            nodeA.vx -= fx;
            nodeA.vy -= fy;
            nodeB.vx += fx;
            nodeB.vy += fy;
          }
        }
      }

      // 2. Link force: Attract connected nodes
      simEdges.forEach(edge => {
        const sourceNode = nodesMap.get(edge.source);
        const targetNode = nodesMap.get(edge.target);
        
        if (sourceNode && targetNode) {
          const dx = targetNode.x - sourceNode.x;
          const dy = targetNode.y - sourceNode.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          
          const restingDist = 80;
          const attractionForce = (dist - restingDist) * 0.05 * (edge.strength || 0.5);
          const fx = (dx / dist) * attractionForce;
          const fy = (dy / dist) * attractionForce;
          
          sourceNode.vx += fx;
          sourceNode.vy += fy;
          targetNode.vx -= fx;
          targetNode.vy -= fy;
        }
      });

      // 3. Central Gravity & Update Positions
      simNodes.forEach(node => {
        if (node === dragNodeRef.current) return; // Skip updating currently dragged node

        // Pull to center
        const dx = centerX - node.x;
        const dy = centerY - node.y;
        node.vx += dx * 0.004;
        node.vy += dy * 0.004;

        // Apply friction
        node.vx *= 0.82;
        node.vy *= 0.82;

        // Update positions
        node.x += node.vx;
        node.y += node.vy;
      });
    };

    const drawGraph = () => {
      const { nodes: simNodes, edges: simEdges } = simulationRef.current;
      const nodesMap = new Map<string, GraphNode>();
      simNodes.forEach(n => nodesMap.set(n.id, n));

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      
      // Apply panning and zooming transform
      const { x, y, k } = transformRef.current;
      ctx.translate(x, y);
      ctx.scale(k, k);

      // Establish visible nodes set for rendering
      const visibleNodesSet = new Set(simNodes.filter(n => {
        if (!visibleTypes[n.type]) return false;
        if (searchQuery.trim()) {
          return n.name.toLowerCase().includes(searchQuery.toLowerCase());
        }
        return true;
      }).map(n => n.id));

      // Draw Edges
      simEdges.forEach(edge => {
        const sourceNode = nodesMap.get(edge.source);
        const targetNode = nodesMap.get(edge.target);
        
        if (!sourceNode || !targetNode) return;
        if (!visibleNodesSet.has(sourceNode.id) || !visibleNodesSet.has(targetNode.id)) return;

        // Highlight state check
        let isHighlighted = false;
        let isDimmed = false;

        if (hoveredNode) {
          if (hoveredNode.id === sourceNode.id || hoveredNode.id === targetNode.id) {
            isHighlighted = true;
          } else {
            isDimmed = true;
          }
        } else if (selectedNode) {
          if (selectedNode.id === sourceNode.id || selectedNode.id === targetNode.id) {
            isHighlighted = true;
          } else {
            isDimmed = true;
          }
        }

        ctx.beginPath();
        ctx.moveTo(sourceNode.x, sourceNode.y);
        ctx.lineTo(targetNode.x, targetNode.y);

        // Customize line style based on highlights
        if (isHighlighted) {
          ctx.strokeStyle = 'rgba(99, 102, 241, 0.75)';
          ctx.lineWidth = 2.2;
        } else if (isDimmed) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
          ctx.lineWidth = 0.6;
        } else {
          ctx.strokeStyle = `rgba(255, 255, 255, ${0.08 + (edge.strength * 0.1)})`;
          ctx.lineWidth = 1.0;
        }
        
        ctx.stroke();
      });

      // Draw Nodes
      simNodes.forEach(node => {
        if (!visibleNodesSet.has(node.id)) return;

        const isHovered = hoveredNode?.id === node.id;
        const isSelected = selectedNode?.id === node.id;
        
        let isDimmed = false;
        let isDirectlyConnected = false;

        if (hoveredNode && !isHovered) {
          // Check if connected to hovered node
          const connected = simEdges.some(e => 
            (e.source === node.id && e.target === hoveredNode.id) || 
            (e.target === node.id && e.source === hoveredNode.id)
          );
          if (connected) {
            isDirectlyConnected = true;
          } else {
            isDimmed = true;
          }
        } else if (selectedNode && !isSelected) {
          const connected = simEdges.some(e => 
            (e.source === node.id && e.target === selectedNode.id) || 
            (e.target === node.id && e.source === selectedNode.id)
          );
          if (connected) {
            isDirectlyConnected = true;
          } else {
            isDimmed = true;
          }
        }

        const colors = NODE_COLORS[node.type] || NODE_COLORS.clip;
        const radius = (node.radius || 10) * (isSelected || isHovered ? 1.35 : 1);

        // 1. Draw Outer Glow
        if (isSelected || isHovered || isDirectlyConnected) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, radius + 8, 0, Math.PI * 2);
          ctx.fillStyle = colors.glow;
          ctx.fill();
        }

        // 2. Draw Node Circle
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        
        if (isDimmed) {
          ctx.fillStyle = 'rgba(30, 30, 40, 0.3)';
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        } else {
          ctx.fillStyle = colors.fill;
          ctx.strokeStyle = colors.stroke;
        }
        
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.fill();
        ctx.stroke();

        // 3. Draw Inner Center Dot
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = isDimmed ? 'rgba(255, 255, 255, 0.1)' : colors.stroke;
        ctx.fill();

        // 4. Draw Label
        ctx.font = isSelected || isHovered ? 'semibold 11px sans-serif' : '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        
        if (isDimmed) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        } else if (isSelected) {
          ctx.fillStyle = '#ffffff';
        } else {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        }

        const labelText = node.name.length > 18 ? `${node.name.slice(0, 16).trim()}...` : node.name;
        
        // Offset text below node circle
        ctx.fillText(labelText, node.x, node.y + radius + 5);
      });

      ctx.restore();
    };

    const tick = () => {
      runSimulationStep();
      drawGraph();
      animationFrameId = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resize);
    };
  }, [nodes, visibleTypes, searchQuery, selectedNode, hoveredNode]);

  // Handle zooming using buttons
  const handleZoom = (factor: number) => {
    const nextScale = Math.max(0.2, Math.min(3, transform.k * factor));
    
    // Zoom centered on canvas center
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    const nextTransform = {
      x: cx - (cx - transform.x) * (nextScale / transform.k),
      y: cy - (cy - transform.y) * (nextScale / transform.k),
      k: nextScale
    };
    
    setTransform(nextTransform);
    transformRef.current = nextTransform;
  };

  // Convert mouse screen coordinates to canvas world coordinates
  const screenToWorld = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const { x: tx, y: ty, k } = transformRef.current;
    return {
      x: (x - tx) / k,
      y: (y - ty) / k
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const worldPos = screenToWorld(e.clientX, e.clientY);
    const { nodes: simNodes } = simulationRef.current;

    // Check if clicked a node
    let clickedNode: GraphNode | null = null;
    for (let i = simNodes.length - 1; i >= 0; i--) {
      const node = simNodes[i];
      if (!visibleTypes[node.type]) continue;
      
      const dx = worldPos.x - node.x;
      const dy = worldPos.y - node.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < (node.radius || 10) * 1.5) {
        clickedNode = node;
        break;
      }
    }

    if (clickedNode) {
      dragNodeRef.current = clickedNode;
      setSelectedNode(clickedNode);
    } else {
      // Pan background instead
      isPanningRef.current = true;
      startPanRef.current = { x: e.clientX - transform.x, y: e.clientY - transform.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragNodeRef.current) {
      // Update dragged node position
      const worldPos = screenToWorld(e.clientX, e.clientY);
      dragNodeRef.current.x = worldPos.x;
      dragNodeRef.current.y = worldPos.y;
      dragNodeRef.current.vx = 0;
      dragNodeRef.current.vy = 0;
    } else if (isPanningRef.current) {
      // Update viewport offset
      const nextTransform = {
        ...transformRef.current,
        x: e.clientX - startPanRef.current.x,
        y: e.clientY - startPanRef.current.y
      };
      setTransform(nextTransform);
      transformRef.current = nextTransform;
    } else {
      // Check for hover highlight triggers
      const worldPos = screenToWorld(e.clientX, e.clientY);
      const { nodes: simNodes } = simulationRef.current;
      
      let hoverMatch: GraphNode | null = null;
      for (let i = simNodes.length - 1; i >= 0; i--) {
        const node = simNodes[i];
        if (!visibleTypes[node.type]) continue;
        
        const dx = worldPos.x - node.x;
        const dy = worldPos.y - node.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < (node.radius || 10) * 1.5) {
          hoverMatch = node;
          break;
        }
      }
      setHoveredNode(hoverMatch);
    }
  };

  const handleMouseUp = () => {
    dragNodeRef.current = null;
    isPanningRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.05 : 0.95;
    handleZoom(zoomFactor);
  };

  // Dynamic filter lists counting counts by node types
  const nodeTypeCounts = useMemo(() => {
    const counts = { clip: 0, folder: 0, tag: 0, task: 0, entity: 0 };
    nodes.forEach(n => {
      if (n.type in counts) {
        counts[n.type]++;
      }
    });
    return counts;
  }, [nodes]);

  // Navigate to ClipMind with preset query context
  const handleAskClipMind = (node: GraphNode) => {
    const isClip = node.type === 'clip' || node.type === 'task';
    const cleanName = node.name.replace(/"/g, "'");
    const queryStr = isClip 
      ? `Give me a rich summary and explore concepts around this saved clip: "${cleanName}"`
      : `Find all clips related to the ${node.type} "${cleanName}" and summarize them.`;
    
    router.push(`/clipmind?prompt=${encodeURIComponent(queryStr)}`);
  };

  return (
    <div className="safe-page min-h-screen bg-[#080d19] text-neutral-100 flex flex-col overflow-hidden relative">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.06),_transparent_40%),radial-gradient(circle_at_bottom,_rgba(6,182,212,0.04),_transparent_35%)] pointer-events-none" />

      {/* 1. Header Toolbar */}
      <header className="border-b border-white/5 bg-neutral-950/40 backdrop-blur-md relative z-10 shrink-0">
        <div className="safe-container mx-auto flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/dashboard')}
              className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-200 transition bg-white/5 px-2.5 py-1.5 rounded-xl border border-white/5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Dashboard
            </button>
            <div className="h-4 w-px bg-white/10" />
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 text-white shadow-lg shadow-indigo-500/20">
                <Brain className="w-4.5 h-4.5" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-white flex items-center gap-1.5">
                  Knowledge Graph
                  <span className="text-[9px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-1.5 py-0.5 rounded-full uppercase tracking-wider font-extrabold">RAG Node Link</span>
                </h1>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Search Input bar */}
            <div className="relative hidden sm:block">
              <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search concepts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-48 bg-neutral-900/60 border border-white/5 rounded-xl pl-9 pr-3 py-1.5 text-xs focus:outline-none focus:border-indigo-500/50 focus:w-60 transition-all font-mono"
              />
            </div>
            
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`rounded-xl p-2 transition border border-white/5 text-neutral-400 hover:text-white ${showFilters ? 'bg-indigo-500/25 border-indigo-500/40 text-white' : 'bg-white/5 hover:bg-white/10'}`}
              title="Filter Node Types"
            >
              <Filter className="w-4 h-4" />
            </button>
            
            <button
              onClick={loadGraphData}
              className="rounded-xl p-2 transition bg-white/5 border border-white/5 hover:bg-white/10 text-neutral-400 hover:text-white"
              title="Refresh Graph"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* 2. Main Graph Interface Workspace */}
      <div className="flex-1 flex overflow-hidden relative">
        <ProGate isPro={isPro} feature="Knowledge Graph" message="Unlock Knowledge Graph" className="flex-1 flex relative">
          
          {/* A. Canvas Workspace */}
          <div className="flex-1 h-full bg-[#03060c] relative select-none">
            {loading ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#03060c]/90 z-20 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
                <p className="text-xs text-neutral-400 font-mono tracking-wider uppercase">Constructing semantic coordinates...</p>
              </div>
            ) : errorMsg ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#03060c] z-20 p-6 text-center">
                <Brain className="w-12 h-12 text-neutral-600 mb-4 animate-pulse" />
                <h3 className="text-base font-bold text-neutral-300 mb-1">Could not render graph</h3>
                <p className="text-xs text-red-400 max-w-sm font-mono mb-4">{errorMsg}</p>
                <button
                  onClick={loadGraphData}
                  className="bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-xl text-xs font-semibold transition"
                >
                  Try Again
                </button>
              </div>
            ) : nodes.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#03060c] z-20 p-6 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 border border-white/5 text-neutral-600 mb-4">
                  <Brain className="w-8 h-8" />
                </div>
                <h3 className="text-base font-bold text-neutral-300 mb-1">Graph is currently empty</h3>
                <p className="text-xs text-neutral-500 max-w-md mb-6 leading-5">
                  Knowledge Graph automatically maps folders, tags, tasks, and extracts entities (people, apps, APIs, URLs, projects, tools) as soon as you save clips.
                </p>
                <button
                  onClick={() => router.push('/dashboard')}
                  className="bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-xl text-xs font-semibold transition"
                >
                  Save Clip on Dashboard
                </button>
              </div>
            ) : null}

            <canvas
              ref={canvasRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onWheel={handleWheel}
              className="w-full h-full block cursor-grab active:cursor-grabbing"
            />

            {/* B. Floating Zoom/Pan Controls */}
            {nodes.length > 0 && !loading && (
              <div className="absolute bottom-6 left-6 flex items-center gap-1.5 bg-neutral-950/70 border border-white/5 backdrop-blur-md rounded-xl p-1.5 shadow-xl shadow-black/40">
                <button
                  onClick={() => handleZoom(1.15)}
                  className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 transition"
                  title="Zoom In"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleZoom(0.85)}
                  className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 transition"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button
                  onClick={() => centerGraph()}
                  className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 transition"
                  title="Recenter view"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
                
                <div className="h-4 w-px bg-white/10 mx-1" />
                
                <p className="text-[10px] text-neutral-400 font-mono pr-2.5 pl-1 select-none">
                  {nodes.length} nodes • {edges.length} links
                </p>
              </div>
            )}

            {/* C. Dynamic Floating Node Type Filters Popover */}
            {showFilters && (
              <div className="absolute top-6 left-6 bg-neutral-950/90 border border-white/8 backdrop-blur-md rounded-2xl p-4 shadow-2xl w-60 z-10 animate-in fade-in slide-in-from-top-4 duration-200">
                <h3 className="text-xs font-bold text-neutral-300 flex items-center gap-1.5 border-b border-white/5 pb-2 mb-3">
                  <Layers className="w-3.5 h-3.5 text-indigo-400" />
                  Toggle Node Layers
                </h3>
                <div className="space-y-2.5">
                  {(Object.keys(visibleTypes) as Array<keyof typeof visibleTypes>).map(type => {
                    const colors = NODE_COLORS[type];
                    const label = type === 'clip' ? 'Clips' : type === 'folder' ? 'Folders' : type === 'tag' ? 'Tags' : type === 'task' ? 'Tasks' : 'Entities';
                    return (
                      <label key={type} className="flex items-center justify-between cursor-pointer hover:bg-white/5 px-2 py-1 rounded-lg transition">
                        <span className="flex items-center gap-2.5 text-xs text-neutral-300">
                          <span className="w-2.5 h-2.5 rounded-full border" style={{ borderColor: colors.stroke, backgroundColor: colors.fill }} />
                          {label}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-neutral-500 font-mono font-bold">({nodeTypeCounts[type]})</span>
                          <input
                            type="checkbox"
                            checked={visibleTypes[type]}
                            onChange={() => setVisibleTypes(prev => ({ ...prev, [type]: !prev[type] }))}
                            className="w-3.5 h-3.5 rounded border-white/5 text-indigo-600 bg-neutral-900 focus:ring-0 focus:ring-offset-0"
                          />
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* D. Glassmorphic Node Details Drawer Sidebar */}
          {selectedNode && (
            <aside className="w-80 md:w-96 border-l border-white/5 bg-neutral-950/65 backdrop-blur-xl relative z-10 flex flex-col h-full animate-in slide-in-from-right duration-250 shadow-2xl shadow-black/80">
              
              {/* Header */}
              <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span 
                    className="w-3 h-3 rounded-full border block" 
                    style={{ borderColor: NODE_COLORS[selectedNode.type].stroke, backgroundColor: NODE_COLORS[selectedNode.type].fill }} 
                  />
                  <span className="text-[10px] font-mono tracking-widest font-extrabold uppercase text-neutral-400">
                    {selectedNode.type} Node Details
                  </span>
                </div>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="text-xs text-neutral-400 hover:text-white bg-white/5 px-2 py-1 rounded-lg border border-white/5 transition"
                >
                  Close
                </button>
              </div>

              {/* Sidebar Content Scroll */}
              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                
                {/* Concept Title */}
                <div>
                  <h2 className="text-base font-bold text-white leading-6 select-text break-words">
                    {selectedNode.name}
                  </h2>
                  {selectedNode.properties.created_at && (
                    <p className="text-[10px] text-neutral-500 font-mono mt-1">
                      Mapped on: {new Date(selectedNode.properties.created_at).toLocaleString()}
                    </p>
                  )}
                </div>

                {/* Ask ClipMind block */}
                <button
                  onClick={() => handleAskClipMind(selectedNode)}
                  className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-semibold py-2.5 px-4 rounded-xl shadow-lg shadow-indigo-600/15 border border-indigo-400/20 hover:scale-[1.01] active:scale-[0.99] transition-all"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Ask ClipMind about this
                </button>

                <div className="h-px bg-white/5" />

                {/* Node Preview Content */}
                {selectedNode.properties.content_preview ? (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-neutral-400 flex items-center gap-1.5">
                      <Database className="w-3.5 h-3.5 text-indigo-400" />
                      Content Preview
                    </h3>
                    <div className="bg-[#03060c]/60 border border-white/5 rounded-xl p-3.5 text-xs text-neutral-300 font-sans leading-5 select-text overflow-hidden text-ellipsis whitespace-pre-wrap max-h-64 overflow-y-auto">
                      {selectedNode.properties.content_preview}
                    </div>
                  </div>
                ) : (
                  <div className="bg-white/2 border border-white/5 rounded-xl p-4 text-center">
                    <HelpCircle className="w-6 h-6 text-neutral-600 mx-auto mb-2" />
                    <p className="text-xs text-neutral-400 italic">
                      This node is a conceptual category ({selectedNode.type}) connected to other clipboard notes in your workspace.
                    </p>
                  </div>
                )}

                {/* Additional properties */}
                {Object.keys(selectedNode.properties).filter(k => k !== 'content_preview' && k !== 'created_at').length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-neutral-400">Node Properties</h3>
                    <div className="bg-white/2 border border-white/5 rounded-xl p-3 space-y-2.5 font-mono text-[10px]">
                      {Object.entries(selectedNode.properties).map(([key, val]) => {
                        if (key === 'content_preview' || key === 'created_at') return null;
                        return (
                          <div key={key} className="flex items-start justify-between border-b border-white/2 pb-1.5 last:border-0 last:pb-0">
                            <span className="text-neutral-500 uppercase tracking-wider">{key.replace('_', ' ')}</span>
                            <span className="text-neutral-300 select-text text-right max-w-[60%] truncate">{String(val)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Mapped concept directions */}
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-neutral-400 flex items-center gap-1.5">
                    <GitBranch className="w-3.5 h-3.5 text-indigo-400" />
                    Interactive Actions
                  </h3>
                  <div className="space-y-2">
                    {selectedNode.type === 'clip' && (
                      <button
                        onClick={() => router.push(`/dashboard`)}
                        className="w-full flex items-center justify-between bg-white/5 hover:bg-white/10 border border-white/5 text-neutral-300 hover:text-white text-xs px-3.5 py-2.5 rounded-xl transition"
                      >
                        <span className="flex items-center gap-2">
                          <Folder className="w-3.5 h-3.5 text-neutral-500" />
                          Locate in Clipboard list
                        </span>
                        <ExternalLink className="w-3 h-3 text-neutral-500" />
                      </button>
                    )}
                    {selectedNode.type === 'folder' && (
                      <button
                        onClick={() => router.push(`/dashboard`)}
                        className="w-full flex items-center justify-between bg-white/5 hover:bg-white/10 border border-white/5 text-neutral-300 hover:text-white text-xs px-3.5 py-2.5 rounded-xl transition"
                      >
                        <span className="flex items-center gap-2">
                          <Folder className="w-3.5 h-3.5 text-neutral-500" />
                          Filter workspace by folder
                        </span>
                        <ExternalLink className="w-3 h-3 text-neutral-500" />
                      </button>
                    )}
                  </div>
                </div>

              </div>
            </aside>
          )}

        </ProGate>
      </div>

      {/* 3. Interactive Legend overlay */}
      {isPro && nodes.length > 0 && !loading && (
        <div className="absolute top-20 right-6 hidden lg:flex flex-col gap-2.5 bg-neutral-950/70 border border-white/5 backdrop-blur-md rounded-2xl p-3.5 shadow-xl w-48 pointer-events-none select-none">
          <h4 className="text-[10px] text-neutral-400 uppercase tracking-widest font-extrabold pb-1.5 border-b border-white/5 mb-1 flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-indigo-400" />
            Graph Legend
          </h4>
          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2 text-neutral-300">
              <span className="w-2.5 h-2.5 rounded-full border border-[#6366f1] bg-[rgba(99,102,241,0.15)]" />
              <span>Clips</span>
            </div>
            <div className="flex items-center gap-2 text-neutral-300">
              <span className="w-2.5 h-2.5 rounded-full border border-[#fbbf24] bg-[rgba(251, 191, 36, 0.15)]" />
              <span>Folders</span>
            </div>
            <div className="flex items-center gap-2 text-neutral-300">
              <span className="w-2.5 h-2.5 rounded-full border border-[#ec4899] bg-[rgba(236, 72, 153, 0.15)]" />
              <span>Tags</span>
            </div>
            <div className="flex items-center gap-2 text-neutral-300">
              <span className="w-2.5 h-2.5 rounded-full border border-[#10b981] bg-[rgba(16, 185, 129, 0.15)]" />
              <span>Tasks</span>
            </div>
            <div className="flex items-center gap-2 text-neutral-300">
              <span className="w-2.5 h-2.5 rounded-full border border-[#06b6d4] bg-[rgba(6, 182, 212, 0.15)]" />
              <span>Entities</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
