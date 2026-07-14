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

import { Code, Trash2, ChevronUp, ChevronDown, Workflow, Eraser, Compass, FileCode2, PlusCircle } from 'lucide-react';
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

  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const [isHeaderOpen, setIsHeaderOpen] = useState(true);

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

    // Create a deep copy of tables so we can mutate columns if referenced columns are missing
    const tempTables: Table[] = JSON.parse(JSON.stringify(newSchema.tables));

    // Ensure all referenced relation columns exist in tables
    (newSchema.relations || []).forEach(rel => {
      const normalize = (s: string) => s.toLowerCase().replace(/_/g, '').replace(/-/g, '');
      const normFromTable = normalize(rel.fromTable);
      const normToTable = normalize(rel.toTable);

      // Find fromTable
      const fromTableObj = tempTables.find(t => normalize(t.name) === normFromTable || normalize(t.id || '') === normFromTable);
      if (fromTableObj) {
        const colExists = fromTableObj.columns.some(c => normalize(c.name) === normalize(rel.fromColumn) || normalize(c.id || '') === normalize(rel.fromColumn));
        if (!colExists) {
          fromTableObj.columns.push({
            id: `col_${Date.now()}_fk_${rel.fromColumn}`,
            name: rel.fromColumn,
            type: 'integer',
            primaryKey: false,
            notNull: true,
            unique: false,
            isIndex: true
          });
        }
      }

      // Find toTable
      const toTableObj = tempTables.find(t => normalize(t.name) === normToTable || normalize(t.id || '') === normToTable);
      if (toTableObj) {
        const colExists = toTableObj.columns.some(c => normalize(c.name) === normalize(rel.toColumn) || normalize(c.id || '') === normalize(rel.toColumn));
        if (!colExists) {
          toTableObj.columns.push({
            id: `col_${Date.now()}_pk_${rel.toColumn}`,
            name: rel.toColumn,
            type: rel.toColumn === 'id' ? 'serial' : 'integer',
            primaryKey: rel.toColumn === 'id',
            notNull: true,
            unique: rel.toColumn === 'id',
            isIndex: false
          });
        }
      }
    });

    // Map tables to ReactFlow nodes
    const flowNodes = tempTables.map((t, idx) => {
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
      
      const fromTableObj = tempTables.find(t => 
        normalize(t.name) === normalize(rel.fromTable) || normalize(t.id || '') === normalize(rel.fromTable)
      );
      const toTableObj = tempTables.find(t => 
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

  const leftTopClass = isHeaderOpen ? 'top-[96px]' : 'top-6';
  const rightTopClass = isHeaderOpen ? 'top-[96px]' : 'top-6';

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#040505] text-foreground select-none">
      {/* Animated Textured Background */}
      <div className="gradient-bg">
        <div className="gradient-blob gradient-blob-1" />
        <div className="gradient-blob gradient-blob-2" />
        <div className="gradient-blob gradient-blob-3" />
        <div className="bg-grain" />
      </div>

      {/* Fullscreen Dataflow Canvas */}
      <div className="absolute inset-0 w-full h-full z-0">
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onEdgeClick={onEdgeClick}
            className="bg-transparent"
            fitView
            minZoom={0.2}
            maxZoom={2}
          >
            <Background 
              variant={BackgroundVariant.Dots} 
              gap={16} 
              size={1} 
              color="rgba(243, 148, 68, 0.08)" 
            />
            <Controls />
          </ReactFlow>
        </ReactFlowProvider>
      </div>

      {/* Collapsible Header Expand Trigger */}
      {!isHeaderOpen && (
        <button
          onClick={() => setIsHeaderOpen(true)}
          className="fixed top-0 left-1/2 -translate-x-1/2 px-4 py-1.5 z-30 bg-[#040505]/60 border-b border-x border-white/10 backdrop-blur-md rounded-b-2xl cursor-pointer hover:bg-white/5 text-muted-foreground hover:text-foreground transition-all flex items-center gap-1 shadow-lg text-[9px] uppercase font-bold tracking-wider animate-in slide-in-from-top-full duration-300"
          title="Expand Header"
        >
          <ChevronDown className="w-3.5 h-3.5" /> Expand Menu
        </button>
      )}

      {/* Top Navbar */}
      <header className={`fixed top-6 left-6 right-6 z-30 transition-all duration-500 ease-out flex items-center justify-between px-6 py-3.5 rounded-2xl glass-panel shadow-2xl ${
        isHeaderOpen ? 'translate-y-0 opacity-100' : 'translate-y-[-140%] opacity-0 pointer-events-none'
      }`}>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/20 rounded-xl text-primary animate-pulse">
            <Workflow className="w-5 h-5 drop-shadow-[0_0_8px_rgba(243,148,68,0.5)]" />
          </div>
          <div>
            <h1 className="text-sm font-black tracking-wider uppercase text-foreground leading-tight">Relational Dataflow</h1>
            <p className="text-[10px] text-muted-foreground leading-none mt-0.5">Interactive Database Schema Modeler</p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3">
          {selectedEdgeId && (
            <div className="flex items-center gap-2 px-3 py-1 bg-secondary/80 border border-border rounded-xl">
              <span className="text-[10px] uppercase font-bold text-muted-foreground">Relation Selected:</span>
              <button
                onClick={handleToggleRelationType}
                className="text-[10px] px-2 py-0.5 bg-primary/20 border border-primary/30 rounded text-primary font-bold hover:bg-primary/30 transition-all cursor-pointer"
                title="Toggle Relationship Type (1:1, 1:N, N:1, N:M)"
              >
                Toggle Type
              </button>
              <button
                onClick={handleDeleteSelectedRelation}
                className="text-[10px] px-2 py-0.5 bg-destructive/20 border border-destructive/30 rounded text-destructive hover:bg-destructive/30 transition-all cursor-pointer flex items-center gap-1"
                title="Delete Relation"
              >
                <Trash2 className="w-3 h-3 text-red-500 drop-shadow-[0_0_6px_rgba(239,68,68,0.4)]" /> Remove
              </button>
            </div>
          )}

          <button
            onClick={handleAddTable}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary hover:bg-secondary/80 text-foreground text-xs font-semibold rounded-xl border border-border transition-all cursor-pointer"
          >
            <PlusCircle className="w-4 h-4 text-primary" />
            Add Table
          </button>
          <button
            onClick={handleClearAll}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary hover:bg-secondary/80 text-foreground text-xs font-semibold rounded-xl border border-border transition-all cursor-pointer"
          >
            <Eraser className="w-4 h-4 text-destructive" />
            Clear Canvas
          </button>
          <button
            onClick={handleLoadSample}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary hover:bg-secondary/80 text-foreground text-xs font-semibold rounded-xl border border-border transition-all cursor-pointer"
          >
            <Compass className="w-4 h-4 text-sky-400" />
            Load Sample
          </button>
          
          <div className="w-px h-6 bg-border mx-1" />

          <button
            onClick={() => setIsExportOpen(true)}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-primary text-primary-foreground text-xs font-bold rounded-xl hover:bg-primary/95 transition-all shadow-md shadow-primary/10 cursor-pointer"
          >
            <FileCode2 className="w-4 h-4" />
            Export Schema
          </button>

          <div className="w-px h-6 bg-border mx-1" />

          <button 
            onClick={() => setIsHeaderOpen(false)}
            className="p-1 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title="Collapse Header"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Left Sidebar Generator */}
      <div className={`fixed ${leftTopClass} left-6 z-20 glass-panel rounded-2xl flex flex-col transition-all duration-500 ease-out ${
        isLeftPanelOpen ? 'w-[360px] h-fit max-h-[calc(100vh-140px)]' : 'w-[240px] h-[56px] overflow-hidden'
      }`}>
        <SchemaGeneratorPanel 
          currentSchema={schema}
          onSchemaGenerated={onSchemaGenerated} 
          config={llmConfig} 
          setConfig={setLlmConfig} 
          isStreaming={isStreaming}
          setIsStreaming={setIsStreaming}
          streamingText={streamingText}
          setStreamingText={setStreamingText}
          isCollapsed={!isLeftPanelOpen}
          onToggleCollapse={() => setIsLeftPanelOpen(!isLeftPanelOpen)}
        />
      </div>

      {/* Right Sidebar Drizzle Preview */}
      <div 
        className={`fixed ${rightTopClass} right-6 z-20 glass-panel rounded-2xl flex flex-col transition-all duration-500 ease-out overflow-hidden ${
          isRightPanelOpen ? 'w-[450px] h-fit max-h-[calc(100vh-140px)]' : 'w-[240px] h-[56px] cursor-pointer hover:bg-card/10'
        }`}
        onClick={!isRightPanelOpen ? () => setIsRightPanelOpen(true) : undefined}
      >
        {/* Header */}
        <div className="p-4 border-b border-border/80 flex items-center justify-between select-none bg-card/10 hover:bg-card/20 transition-colors">
          {isRightPanelOpen ? (
            <>
              <div className="flex items-center gap-2">
                <Code className="w-4 h-4 text-primary" />
                <h2 className="text-xs font-bold tracking-wide text-foreground">Live Drizzle Schema Preview</h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded font-bold uppercase tracking-wide">
                  Syncing
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); setIsRightPanelOpen(false); }}
                  className="p-1.5 rounded-lg hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  title="Collapse Preview"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Code className="w-4 h-4 text-primary animate-pulse" />
                <span className="text-xs font-bold tracking-wide text-foreground">Drizzle Schema</span>
              </div>
              <ChevronDown className="w-4 h-4 text-muted-foreground hover:text-foreground transition-colors" />
            </>
          )}
        </div>

        {/* Content */}
        {isRightPanelOpen && (
          <div className="flex-1 p-4 font-mono text-[10px] leading-relaxed text-foreground overflow-y-auto bg-[#040505]/10 select-text custom-scrollbar max-h-[calc(100vh-200px)]">
            {drizzleCode ? (
              <pre className="whitespace-pre-wrap">{drizzleCode}</pre>
            ) : (
              <div className="text-muted-foreground/60 italic text-center mt-20 text-xs">
                No tables in schema. Click 'Load Sample' or 'Add Table' to preview code.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Futuristic Floating Stream Overlay */}
      {isStreaming && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6 select-none animate-in fade-in duration-300">
          <div className="bg-card/80 border border-primary/20 rounded-2xl p-6 w-full max-w-2xl shadow-[0_0_50px_rgba(243,148,68,0.1)] flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200 backdrop-blur-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-5 h-5 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                <div>
                  <h3 className="text-sm font-semibold text-foreground">AI Schema Generation in Progress</h3>
                  <p className="text-[10px] text-muted-foreground">Streaming real-time structured JSON schema from model</p>
                </div>
              </div>
              <div className="text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-primary/10 border border-primary/20 text-primary animate-pulse">
                Live Stream
              </div>
            </div>
            
            <div className="relative">
              <div className="absolute top-2 right-2 flex items-center gap-1.5 px-2 py-1 rounded bg-black/40 border border-border text-[9px] font-mono text-muted-foreground">
                <span>{streamingText.length} bytes</span>
              </div>
              <pre className="font-mono text-xs text-orange-200 bg-black/90 p-4 rounded-xl border border-border/80 overflow-y-auto max-h-[300px] text-left leading-relaxed select-text shadow-inner scrollbar-thin">
                <code>{streamingText || 'Connecting to model...'}</code>
              </pre>
            </div>
          </div>
        </div>
      )}

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
