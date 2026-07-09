import { useState, useCallback, useMemo, useEffect } from 'react';
import { 
  ReactFlow, 
  Background, 
  Controls, 
  BackgroundVariant,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  addEdge
} from '@xyflow/react';
import type {
  Connection,
  Edge,
  Node
} from '@xyflow/react';

import { Database, Plus, Code, Share2, Trash2, Info } from 'lucide-react';
import type { DatabaseSchema, Table, Column, Relation, LLMConfig } from './types/schema';
import { TableNode } from './components/TableNode';
import { SchemaGeneratorPanel } from './components/SchemaGeneratorPanel';
import { ExportModal } from './components/ExportModal';
import { generateDrizzleSchema } from './utils/drizzleGenerator';

const initialSampleSchema: DatabaseSchema = {
  tables: [
    {
      id: 'users',
      name: 'users',
      x: 80,
      y: 120,
      columns: [
        { id: 'u_id', name: 'id', type: 'serial', primaryKey: true, notNull: true, unique: false, isIndex: false },
        { id: 'u_username', name: 'username', type: 'varchar', primaryKey: false, notNull: true, unique: true, isIndex: true },
        { id: 'u_email', name: 'email', type: 'varchar', primaryKey: false, notNull: true, unique: true, isIndex: false },
        { id: 'u_created', name: 'created_at', type: 'timestamp', primaryKey: false, notNull: true, unique: false, isIndex: false }
      ]
    },
    {
      id: 'posts',
      name: 'posts',
      x: 480,
      y: 80,
      columns: [
        { id: 'p_id', name: 'id', type: 'serial', primaryKey: true, notNull: true, unique: false, isIndex: false },
        { id: 'p_author', name: 'author_id', type: 'integer', primaryKey: false, notNull: true, unique: false, isIndex: true },
        { id: 'p_title', name: 'title', type: 'varchar', primaryKey: false, notNull: true, unique: false, isIndex: false },
        { id: 'p_content', name: 'content', type: 'text', primaryKey: false, notNull: false, unique: false, isIndex: false }
      ]
    },
    {
      id: 'comments',
      name: 'comments',
      x: 880,
      y: 200,
      columns: [
        { id: 'c_id', name: 'id', type: 'serial', primaryKey: true, notNull: true, unique: false, isIndex: false },
        { id: 'c_post', name: 'post_id', type: 'integer', primaryKey: false, notNull: true, unique: false, isIndex: true },
        { id: 'c_author', name: 'author_id', type: 'integer', primaryKey: false, notNull: true, unique: false, isIndex: false },
        { id: 'c_text', name: 'comment_text', type: 'text', primaryKey: false, notNull: true, unique: false, isIndex: false }
      ]
    }
  ],
  relations: [
    {
      id: 'rel_posts_author_users_id',
      fromTable: 'posts',
      fromColumn: 'author_id',
      toTable: 'users',
      toColumn: 'id',
      type: 'many-to-one'
    },
    {
      id: 'rel_comments_post_posts_id',
      fromTable: 'comments',
      fromColumn: 'post_id',
      toTable: 'posts',
      toColumn: 'id',
      type: 'many-to-one'
    },
    {
      id: 'rel_comments_author_users_id',
      fromTable: 'comments',
      fromColumn: 'author_id',
      toTable: 'users',
      toColumn: 'id',
      type: 'many-to-one'
    }
  ]
};

const nodeTypes = {
  table: TableNode,
};

export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [llmConfig, setLlmConfig] = useState<LLMConfig>({
    provider: 'ollama',
    apiKey: '',
    model: 'gemma4:e4b',
  });
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');

  // Reconstruct schema object live from current nodes and edges
  const schema = useMemo<DatabaseSchema>(() => {
    const tables = nodes.map(n => (n.data as any).table as Table);
    const relations = edges.map(e => {
      const fromTable = tables.find(t => t.id === e.source)?.name || e.source;
      const toTable = tables.find(t => t.id === e.target)?.name || e.target;
      
      const fromColId = e.sourceHandle?.replace(`${e.source}-`, '').replace('-source', '') || '';
      const toColId = e.targetHandle?.replace(`${e.target}-`, '').replace('-target', '') || '';
      
      const fromColObj = tables.find(t => t.id === e.source)?.columns.find(c => c.id === fromColId);
      const toColObj = tables.find(t => t.id === e.target)?.columns.find(c => c.id === toColId);
      
      const fromCol = fromColObj ? fromColObj.name : fromColId;
      const toCol = toColObj ? toColObj.name : toColId;
      
      let type: Relation['type'] = 'many-to-one';
      if (e.label === '1:1') type = 'one-to-one';
      else if (e.label === '1:N') type = 'one-to-many';
      else if (e.label === 'N:M') type = 'many-to-many';
      
      return {
        id: e.id,
        fromTable,
        fromColumn: fromCol,
        toTable,
        toColumn: toCol,
        type
      };
    });
    
    return { tables, relations };
  }, [nodes, edges]);

  // Generate Drizzle Schema code in real-time
  const drizzleCode = useMemo(() => generateDrizzleSchema(schema), [schema]);

  // Stable callbacks that interact directly with React Flow's state updates
  const handleRenameTable = useCallback((tableId: string, newName: string) => {
    setNodes((nds) => nds.map(node => {
      if (node.id === tableId) {
        return {
          ...(node as any),
          id: newName,
          data: {
            ...(node.data as any),
            table: {
              ...((node.data as any).table),
              id: newName,
              name: newName
            }
          }
        };
      }
      return node;
    }));
    // Rename references inside edges
    setEdges((eds) => eds.map(edge => {
      let source = edge.source;
      let target = edge.target;
      let sourceHandle = edge.sourceHandle;
      let targetHandle = edge.targetHandle;
      if (edge.source === tableId) {
        source = newName;
        sourceHandle = edge.sourceHandle?.replace(`${tableId}-`, `${newName}-`);
      }
      if (edge.target === tableId) {
        target = newName;
        targetHandle = edge.targetHandle?.replace(`${tableId}-`, `${newName}-`);
      }
      return { ...edge, source, target, sourceHandle, targetHandle };
    }));
  }, [setNodes, setEdges]);

  const handleDeleteTable = useCallback((tableId: string) => {
    setNodes((nds) => nds.filter(node => node.id !== tableId));
    setEdges((eds) => eds.filter(edge => edge.source !== tableId && edge.target !== tableId));
  }, [setNodes, setEdges]);

  const handleAddColumn = useCallback((tableId: string) => {
    setNodes((nds) => nds.map(node => {
      if (node.id === tableId) {
        const columns = (node.data as any).table.columns;
        const newCol = {
          id: `col_${Date.now()}`,
          name: `column_${columns.length + 1}`,
          type: 'varchar' as const,
          primaryKey: false,
          notNull: false,
          unique: false,
          isIndex: false,
        };
        return {
          ...(node as any),
          data: {
            ...(node.data as any),
            table: {
              ...((node.data as any).table),
              columns: [...columns, newCol]
            }
          }
        };
      }
      return node;
    }));
  }, [setNodes]);

  const handleUpdateColumn = useCallback((tableId: string, columnId: string, updates: Partial<Column>) => {
    setNodes((nds) => nds.map(node => {
      if (node.id === tableId) {
        const table = (node.data as any).table;
        const updatedColumns = table.columns.map((c: any) => c.id === columnId ? { ...c, ...updates } : c);
        return {
          ...(node as any),
          data: {
            ...(node.data as any),
            table: {
              ...table,
              columns: updatedColumns
            }
          }
        };
      }
      return node;
    }));
  }, [setNodes]);

  const handleDeleteColumn = useCallback((tableId: string, columnId: string) => {
    setNodes((nds) => nds.map(node => {
      if (node.id === tableId) {
        const table = (node.data as any).table;
        return {
          ...(node as any),
          data: {
            ...(node.data as any),
            table: {
              ...table,
              columns: table.columns.filter((c: any) => c.id !== columnId)
            }
          }
        };
      }
      return node;
    }));
    // Delete any connected edges
    setEdges((eds) => eds.filter(edge => 
      !(edge.source === tableId && edge.sourceHandle === `${tableId}-${columnId}-source`) &&
      !(edge.target === tableId && edge.targetHandle === `${tableId}-${columnId}-target`)
    ));
  }, [setNodes, setEdges]);

  const handleAddTable = () => {
    const tableId = `table_${Date.now()}`;
    const newTableNode: Node = {
      id: tableId,
      type: 'table',
      position: { x: 200 + Math.random() * 100, y: 200 + Math.random() * 100 },
      data: {
        table: {
          id: tableId,
          name: `new_table_${nodes.length + 1}`,
          columns: [
            { id: `id_${Date.now()}`, name: 'id', type: 'serial', primaryKey: true, notNull: true, unique: false, isIndex: false }
          ]
        },
        onRenameTable: handleRenameTable,
        onDeleteTable: handleDeleteTable,
        onAddColumn: handleAddColumn,
        onUpdateColumn: handleUpdateColumn,
        onDeleteColumn: handleDeleteColumn,
      }
    };
    setNodes((nds) => [...nds, newTableNode]);
  };

  const onSchemaGenerated = useCallback((newSchema: DatabaseSchema) => {
    if (!newSchema || !newSchema.tables) return;

    // Map tables to ReactFlow nodes
    const flowNodes = newSchema.tables.map((t, idx) => {
      const tableId = t.id || t.name || `table_${idx}`;
      const tableName = t.name || tableId;

      const sanitizedColumns = (t.columns || []).map((col, colIdx) => ({
        id: col.id || col.name || `col_${colIdx}`,
        name: col.name || `column_${colIdx + 1}`,
        type: col.type || 'varchar',
        primaryKey: !!col.primaryKey,
        notNull: !!col.notNull,
        unique: !!col.unique,
        isIndex: !!col.isIndex,
      }));

      return {
        id: tableId,
        type: 'table',
        position: {
          x: t.x !== undefined ? t.x : 80 + (idx % 3) * 380,
          y: t.y !== undefined ? t.y : 100 + Math.floor(idx / 3) * 320
        },
        data: {
          table: {
            id: tableId,
            name: tableName,
            columns: sanitizedColumns,
          },
          onRenameTable: handleRenameTable,
          onDeleteTable: handleDeleteTable,
          onAddColumn: handleAddColumn,
          onUpdateColumn: handleUpdateColumn,
          onDeleteColumn: handleDeleteColumn,
        }
      };
    });

    // Map relations to ReactFlow edges
    const flowEdges = (newSchema.relations || []).map(rel => {
      const normalize = (s: string) => s.toLowerCase().replace(/_/g, '').replace(/-/g, '');
      
      const fromTableObj = newSchema.tables.find(t => 
        normalize(t.name) === normalize(rel.fromTable) || normalize(t.id || '') === normalize(rel.fromTable)
      );
      const toTableObj = newSchema.tables.find(t => 
        normalize(t.name) === normalize(rel.toTable) || normalize(t.id || '') === normalize(rel.toTable)
      );
      
      const fromTableId = fromTableObj ? (fromTableObj.id || fromTableObj.name) : rel.fromTable;
      const toTableId = toTableObj ? (toTableObj.id || toTableObj.name) : rel.toTable;
      
      const fromColObj = fromTableObj?.columns.find(c => 
        normalize(c.name) === normalize(rel.fromColumn) || normalize(c.id || '') === normalize(rel.fromColumn)
      );
      const toColObj = toTableObj?.columns.find(c => 
        normalize(c.name) === normalize(rel.toColumn) || normalize(c.id || '') === normalize(rel.toColumn)
      );
      
      const fromColId = fromColObj ? (fromColObj.id || fromColObj.name) : rel.fromColumn;
      const toColId = toColObj ? (toColObj.id || toColObj.name) : rel.toColumn;

      let label = 'N:1';
      if (rel.type === 'one-to-one') label = '1:1';
      else if (rel.type === 'one-to-many') label = '1:N';
      else if (rel.type === 'many-to-many') label = 'N:M';

      const isSelected = selectedEdgeId === rel.id;

      return {
        id: rel.id || `rel_${fromTableId}_${fromColId}_${toTableId}_${toColId}`,
        source: fromTableId,
        target: toTableId,
        sourceHandle: `${fromTableId}-${fromColId}-source`,
        targetHandle: `${toTableId}-${toColId}-target`,
        type: 'smoothstep',
        animated: true,
        label,
        selected: isSelected,
        labelStyle: { fill: '#ffffff', fontSize: 9, fontWeight: 700 },
        labelBgPadding: [4, 2] as [number, number],
        labelBgBorderRadius: 4,
        labelBgStyle: { fill: isSelected ? 'hsl(var(--primary))' : 'hsl(var(--muted))', color: '#fff' },
        style: {
          stroke: isSelected ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
          strokeWidth: isSelected ? 3 : 2,
        }
      };
    });

    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [handleRenameTable, handleDeleteTable, handleAddColumn, handleUpdateColumn, handleDeleteColumn, selectedEdgeId]);

  // Load sample schema initially
  useEffect(() => {
    onSchemaGenerated(initialSampleSchema);
  }, []);

  const onConnect = useCallback((connection: Connection) => {
    setEdges((eds) => addEdge({
      ...connection,
      type: 'smoothstep',
      animated: true,
      label: 'N:1',
      labelStyle: { fill: '#ffffff', fontSize: 9, fontWeight: 700 },
      labelBgPadding: [4, 2] as [number, number],
      labelBgBorderRadius: 4,
      labelBgStyle: { fill: 'hsl(var(--muted))', color: '#fff' },
      style: {
        stroke: 'hsl(var(--muted-foreground))',
        strokeWidth: 2,
      }
    }, eds));
  }, [setEdges]);

  const onEdgeClick = useCallback((_event: React.MouseEvent, edge: Edge) => {
    setSelectedEdgeId(edge.id === selectedEdgeId ? null : edge.id);
  }, [selectedEdgeId]);

  // Synchronize selection styling inside edge objects
  useEffect(() => {
    setEdges((eds) => eds.map(e => {
      const isSelected = e.id === selectedEdgeId;
      return {
        ...e,
        selected: isSelected,
        labelBgStyle: { fill: isSelected ? 'hsl(var(--primary))' : 'hsl(var(--muted))', color: '#fff' },
        style: {
          stroke: isSelected ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
          strokeWidth: isSelected ? 3 : 2,
        }
      };
    }));
  }, [selectedEdgeId, setEdges]);

  const handleToggleRelationType = () => {
    if (!selectedEdgeId) return;
    setEdges((eds) => eds.map(e => {
      if (e.id !== selectedEdgeId) return e;
      const types = ['N:1', '1:1', '1:N', 'N:M'];
      const nextIdx = (types.indexOf(e.label as string || 'N:1') + 1) % types.length;
      return { ...e, label: types[nextIdx] };
    }));
  };

  const handleDeleteSelectedRelation = () => {
    if (!selectedEdgeId) return;
    setEdges((eds) => eds.filter(e => e.id !== selectedEdgeId));
    setSelectedEdgeId(null);
  };

  const handleClearAll = () => {
    setNodes([]);
    setEdges([]);
    setSelectedEdgeId(null);
  };

  const handleLoadSample = () => {
    onSchemaGenerated(initialSampleSchema);
    setSelectedEdgeId(null);
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground flex-col">
      {/* Top Navbar */}
      <header className="flex items-center justify-between px-6 py-3.5 bg-card/50 border-b border-border backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/20 rounded-xl text-primary animate-pulse">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-black tracking-wider uppercase text-foreground">Relational Dataflow</h1>
            <p className="text-[10px] text-muted-foreground">Interactive Database Schema Modeler</p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3">
          {selectedEdgeId && (
            <div className="flex items-center gap-2 px-3 py-1 bg-secondary/80 border border-border rounded-xl">
              <span className="text-[10px] uppercase font-bold text-muted-foreground">Relation Selected:</span>
              <button
                onClick={handleToggleRelationType}
                className="text-xs px-2 py-0.5 bg-primary/20 border border-primary/30 rounded text-primary font-bold hover:bg-primary/30 transition-all cursor-pointer"
                title="Toggle Relationship Type (1:1, 1:N, N:1, N:M)"
              >
                Toggle Type
              </button>
              <button
                onClick={handleDeleteSelectedRelation}
                className="text-xs px-2 py-0.5 bg-destructive/20 border border-destructive/30 rounded text-destructive hover:bg-destructive/30 transition-all cursor-pointer flex items-center gap-1"
                title="Delete Relation"
              >
                <Trash2 className="w-3 h-3" /> Remove
              </button>
            </div>
          )}

          <button
            onClick={handleAddTable}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary hover:bg-secondary/85 text-foreground text-xs font-semibold rounded-xl border border-border hover:border-muted-foreground transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4 text-primary" />
            Add Table
          </button>
          <button
            onClick={handleClearAll}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary hover:bg-secondary/85 text-foreground text-xs font-semibold rounded-xl border border-border hover:border-muted-foreground transition-all cursor-pointer"
          >
            <Trash2 className="w-4 h-4 text-destructive" />
            Clear Canvas
          </button>
          <button
            onClick={handleLoadSample}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary hover:bg-secondary/85 text-foreground text-xs font-semibold rounded-xl border border-border hover:border-muted-foreground transition-all cursor-pointer"
          >
            <Info className="w-4 h-4 text-sky-400" />
            Load Sample
          </button>
          
          <div className="w-px h-6 bg-border mx-1" />

          <button
            onClick={() => setIsExportOpen(true)}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-primary text-primary-foreground text-xs font-bold rounded-xl hover:bg-primary/95 transition-all shadow-md shadow-primary/10 cursor-pointer"
          >
            <Share2 className="w-4 h-4" />
            Export Schema
          </button>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="flex-1 flex overflow-hidden h-[calc(100vh-65px)] min-h-0">
        {/* Sidebar Generator */}
        <SchemaGeneratorPanel 
          onSchemaGenerated={onSchemaGenerated} 
          config={llmConfig} 
          setConfig={setLlmConfig} 
          isStreaming={isStreaming}
          setIsStreaming={setIsStreaming}
          streamingText={streamingText}
          setStreamingText={setStreamingText}
        />

        {/* Dataflow Canvas */}
        <div className="flex-1 h-full w-full relative" style={{ height: '100%', width: '100%', minHeight: '300px' }}>
          <ReactFlowProvider>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onEdgeClick={onEdgeClick}
              className="bg-background"
            >
              <Background 
                variant={BackgroundVariant.Dots} 
                gap={16} 
                size={1} 
                color="rgba(120, 119, 198, 0.15)" 
              />
              <Controls className="!bg-card !border-border !rounded-xl !shadow-lg text-foreground fill-foreground" />
            </ReactFlow>
          </ReactFlowProvider>

          {/* Futuristic Floating Stream Overlay */}
          {isStreaming && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6 select-none">
              <div className="bg-card border border-primary/25 rounded-2xl p-6 w-full max-w-2xl shadow-[0_0_50px_rgba(120,119,198,0.15)] flex flex-col gap-4 animate-in fade-in zoom-in duration-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-5 h-5 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">AI Schema Generation in Progress</h3>
                      <p className="text-[10px] text-muted-foreground">Streaming real-time structured JSON schema from model</p>
                    </div>
                  </div>
                  <div className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-primary/10 border border-primary/20 text-primary animate-pulse">
                    Live Stream
                  </div>
                </div>
                
                <div className="relative">
                  <div className="absolute top-2 right-2 flex items-center gap-1.5 px-2 py-1 rounded bg-black/40 border border-border text-[9px] font-mono text-muted-foreground">
                    <span>{streamingText.length} bytes</span>
                  </div>
                  <pre className="font-mono text-xs text-indigo-300 bg-black/90 p-4 rounded-xl border border-border/80 overflow-y-auto max-h-[300px] text-left leading-relaxed select-text shadow-inner scrollbar-thin">
                    <code>{streamingText || 'Connecting to model...'}</code>
                  </pre>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Real-time Code Preview Panel */}
        <div className="w-96 min-w-[340px] max-w-[400px] border-l border-border bg-card/25 backdrop-blur-md flex flex-col h-full overflow-hidden">
          <div className="p-4 border-b border-border/80 flex items-center justify-between bg-card/40">
            <div className="flex items-center gap-2">
              <Code className="w-4 h-4 text-primary" />
              <h2 className="text-xs font-bold tracking-wide text-foreground">Live Drizzle Schema Preview</h2>
            </div>
            <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded font-bold uppercase tracking-wide">
              Syncing
            </span>
          </div>

          <div className="flex-1 p-4 font-mono text-[10px] leading-relaxed text-foreground overflow-y-auto bg-background/30 select-text">
            {drizzleCode ? (
              <pre>{drizzleCode}</pre>
            ) : (
              <div className="text-muted-foreground/60 italic text-center mt-20 text-xs">
                No tables in schema. Click 'Load Sample' or 'Add Table' to preview code.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Export Schema Dialog */}
      <ExportModal 
        isOpen={isExportOpen} 
        onClose={() => setIsExportOpen(false)} 
        drizzleCode={drizzleCode}
        config={llmConfig}
      />
    </div>
  );
}
