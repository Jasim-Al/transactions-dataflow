import { useState, useCallback, useMemo } from 'react';
import { 
  ReactFlow, 
  Background, 
  Controls, 
  BackgroundVariant
} from '@xyflow/react';
import type {
  Connection,
  Edge,
  Node,
  NodeChange,
  EdgeChange
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

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
  const [schema, setSchema] = useState<DatabaseSchema>(initialSampleSchema);
  const [llmConfig, setLlmConfig] = useState<LLMConfig>({
    provider: 'ollama',
    apiKey: '',
    model: 'gemma4:e4b',
  });
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  // Generate Drizzle Schema code in real-time
  const drizzleCode = useMemo(() => generateDrizzleSchema(schema), [schema]);

  const onSchemaGenerated = (newSchema: DatabaseSchema) => {
    // Dynamically lay out nodes in a grid to avoid overlaps
    const tablesWithPosition = newSchema.tables.map((t, idx) => ({
      ...t,
      x: t.x !== undefined ? t.x : 80 + (idx % 3) * 380,
      y: t.y !== undefined ? t.y : 100 + Math.floor(idx / 3) * 320,
    }));
    setSchema({
      tables: tablesWithPosition,
      relations: newSchema.relations || [],
    });
  };

  const handleAddTable = () => {
    const tableId = `table_${Date.now()}`;
    const newTable: Table = {
      id: tableId,
      name: `new_table_${schema.tables.length + 1}`,
      x: 200 + Math.random() * 100,
      y: 200 + Math.random() * 100,
      columns: [
        { id: `id_${Date.now()}`, name: 'id', type: 'serial', primaryKey: true, notNull: true, unique: false, isIndex: false }
      ]
    };
    setSchema(prev => ({
      ...prev,
      tables: [...prev.tables, newTable]
    }));
  };

  const handleRenameTable = useCallback((tableId: string, newName: string) => {
    setSchema(prev => {
      // Find old name to update relations
      const table = prev.tables.find(t => t.id === tableId);
      if (!table) return prev;
      
      const oldName = table.name;
      
      return {
        tables: prev.tables.map(t => t.id === tableId ? { ...t, name: newName, id: newName } : t),
        relations: prev.relations.map(r => {
          let fromTable = r.fromTable;
          let toTable = r.toTable;
          if (r.fromTable === oldName) fromTable = newName;
          if (r.toTable === oldName) toTable = newName;
          return { ...r, fromTable, toTable };
        })
      };
    });
  }, []);

  const handleDeleteTable = useCallback((tableId: string) => {
    setSchema(prev => {
      const table = prev.tables.find(t => t.id === tableId);
      if (!table) return prev;
      const tableName = table.name;
      return {
        tables: prev.tables.filter(t => t.id !== tableId),
        relations: prev.relations.filter(r => r.fromTable !== tableName && r.toTable !== tableName)
      };
    });
  }, []);

  const handleAddColumn = useCallback((tableId: string) => {
    setSchema(prev => ({
      ...prev,
      tables: prev.tables.map(t => {
        if (t.id !== tableId) return t;
        const colNum = t.columns.length + 1;
        const newCol: Column = {
          id: `col_${Date.now()}_${colNum}`,
          name: `column_${colNum}`,
          type: 'varchar',
          primaryKey: false,
          notNull: false,
          unique: false,
          isIndex: false
        };
        return {
          ...t,
          columns: [...t.columns, newCol]
        };
      })
    }));
  }, []);

  const handleUpdateColumn = useCallback((tableId: string, columnId: string, updates: Partial<Column>) => {
    setSchema(prev => {
      const targetTable = prev.tables.find(t => t.id === tableId);
      if (!targetTable) return prev;
      
      const oldColumn = targetTable.columns.find(c => c.id === columnId);
      if (!oldColumn) return prev;

      const newTables = prev.tables.map(t => {
        if (t.id !== tableId) return t;
        return {
          ...t,
          columns: t.columns.map(c => c.id === columnId ? { ...c, ...updates } : c)
        };
      });

      // If column name changed, update relations
      if (updates.name && updates.name !== oldColumn.name) {
        const newRelations = prev.relations.map(r => {
          let fromColumn = r.fromColumn;
          let toColumn = r.toColumn;
          if (r.fromTable === targetTable.name && r.fromColumn === oldColumn.name) fromColumn = updates.name!;
          if (r.toTable === targetTable.name && r.toColumn === oldColumn.name) toColumn = updates.name!;
          return { ...r, fromColumn, toColumn };
        });
        return { tables: newTables, relations: newRelations };
      }

      return { ...prev, tables: newTables };
    });
  }, []);

  const handleDeleteColumn = useCallback((tableId: string, columnId: string) => {
    setSchema(prev => {
      const targetTable = prev.tables.find(t => t.id === tableId);
      if (!targetTable) return prev;
      const targetColumn = targetTable.columns.find(c => c.id === columnId);
      if (!targetColumn) return prev;

      return {
        tables: prev.tables.map(t => {
          if (t.id !== tableId) return t;
          return {
            ...t,
            columns: t.columns.filter(c => c.id !== columnId)
          };
        }),
        relations: prev.relations.filter(r => 
          !(r.fromTable === targetTable.name && r.fromColumn === targetColumn.name) &&
          !(r.toTable === targetTable.name && r.toColumn === targetColumn.name)
        )
      };
    });
  }, []);

  // Node Change callback for drags
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setSchema(prev => {
      const updatedTables = prev.tables.map(table => {
        const matchingChange = changes.find((c: any) => c.id === table.id && c.type === 'position');
        if (matchingChange && 'position' in matchingChange && matchingChange.position) {
          return {
            ...table,
            x: matchingChange.position.x,
            y: matchingChange.position.y
          };
        }
        return table;
      });
      return { ...prev, tables: updatedTables };
    });
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    // Handle edge deletion via keyboard/toolbar
    const deleteChanges = changes.filter(c => c.type === 'remove');
    if (deleteChanges.length > 0) {
      const idsToRemove = deleteChanges.map(c => c.id);
      setSchema(prev => ({
        ...prev,
        relations: prev.relations.filter(r => !idsToRemove.includes(r.id))
      }));
    }
  }, []);

  // Setup relation connections
  const onConnect = useCallback((connection: Connection) => {
    const { source, sourceHandle, target, targetHandle } = connection;
    if (!source || !sourceHandle || !target || !targetHandle) return;

    // sourceHandle is in format "${tableId}-${columnId}-source"
    // Extract column name by finding the column inside table columns
    const sourceTableObj = schema.tables.find(t => t.id === source);
    const targetTableObj = schema.tables.find(t => t.id === target);
    if (!sourceTableObj || !targetTableObj) return;

    const sourceColId = sourceHandle.replace(`${source}-`, '').replace('-source', '');
    const targetColId = targetHandle.replace(`${target}-`, '').replace('-target', '');

    const sourceCol = sourceTableObj.columns.find(c => c.id === sourceColId);
    const targetCol = targetTableObj.columns.find(c => c.id === targetColId);
    if (!sourceCol || !targetCol) return;

    const newRelation: Relation = {
      id: `rel_${sourceTableObj.name}_${sourceCol.name}_${targetTableObj.name}_${targetCol.name}`,
      fromTable: sourceTableObj.name,
      fromColumn: sourceCol.name,
      toTable: targetTableObj.name,
      toColumn: targetCol.name,
      type: 'many-to-one' // default type
    };

    setSchema(prev => {
      if (prev.relations.some(r => r.id === newRelation.id)) return prev;
      return {
        ...prev,
        relations: [...prev.relations, newRelation]
      };
    });
  }, [schema]);

  // Convert schema state to ReactFlow nodes & edges
  const flowNodes = useMemo<Node[]>(() => {
    return schema.tables.map(table => ({
      id: table.id,
      type: 'table',
      position: { x: table.x ?? 100, y: table.y ?? 100 },
      data: {
        table,
        onRenameTable: handleRenameTable,
        onDeleteTable: handleDeleteTable,
        onAddColumn: handleAddColumn,
        onUpdateColumn: handleUpdateColumn,
        onDeleteColumn: handleDeleteColumn,
      },
    }));
  }, [schema, handleRenameTable, handleDeleteTable, handleAddColumn, handleUpdateColumn, handleDeleteColumn]);

  const flowEdges = useMemo<Edge[]>(() => {
    return schema.relations.map(rel => {
      // Find table IDs
      const fromTableObj = schema.tables.find(t => t.name === rel.fromTable);
      const toTableObj = schema.tables.find(t => t.name === rel.toTable);
      
      const fromTableId = fromTableObj ? fromTableObj.id : rel.fromTable;
      const toTableId = toTableObj ? toTableObj.id : rel.toTable;

      // Find column IDs
      const fromColObj = fromTableObj?.columns.find(c => c.name === rel.fromColumn);
      const toColObj = toTableObj?.columns.find(c => c.name === rel.toColumn);

      const fromColId = fromColObj ? fromColObj.id : rel.fromColumn;
      const toColId = toColObj ? toColObj.id : rel.toColumn;

      const isSelected = selectedEdgeId === rel.id;

      // Label description mapping
      let label = 'N:1';
      if (rel.type === 'one-to-one') label = '1:1';
      else if (rel.type === 'one-to-many') label = '1:N';
      else if (rel.type === 'many-to-many') label = 'N:M';

      return {
        id: rel.id,
        source: fromTableId,
        target: toTableId,
        sourceHandle: `${fromTableId}-${fromColId}-source`,
        targetHandle: `${toTableId}-${toColId}-target`,
        type: 'smoothstep',
        animated: true,
        label,
        selected: isSelected,
        labelStyle: { fill: '#ffffff', fontSize: 9, fontWeight: 700 },
        labelBgPadding: [4, 2],
        labelBgBorderRadius: 4,
        labelBgStyle: { fill: isSelected ? 'hsl(var(--primary))' : 'hsl(var(--muted))', color: '#fff' },
        style: {
          stroke: isSelected ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
          strokeWidth: isSelected ? 3 : 2,
        }
      };
    });
  }, [schema, selectedEdgeId]);

  const onEdgeClick = useCallback((_event: React.MouseEvent, edge: Edge) => {
    setSelectedEdgeId(edge.id === selectedEdgeId ? null : edge.id);
  }, [selectedEdgeId]);

  const handleToggleRelationType = () => {
    if (!selectedEdgeId) return;
    setSchema(prev => ({
      ...prev,
      relations: prev.relations.map(r => {
        if (r.id !== selectedEdgeId) return r;
        const types: Relation['type'][] = ['many-to-one', 'one-to-one', 'one-to-many', 'many-to-many'];
        const nextIdx = (types.indexOf(r.type) + 1) % types.length;
        return { ...r, type: types[nextIdx] };
      })
    }));
  };

  const handleDeleteSelectedRelation = () => {
    if (!selectedEdgeId) return;
    setSchema(prev => ({
      ...prev,
      relations: prev.relations.filter(r => r.id !== selectedEdgeId)
    }));
    setSelectedEdgeId(null);
  };

  const handleClearAll = () => {
    setSchema({ tables: [], relations: [] });
    setSelectedEdgeId(null);
  };

  const handleLoadSample = () => {
    setSchema(initialSampleSchema);
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
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Generator */}
        <SchemaGeneratorPanel 
          onSchemaGenerated={onSchemaGenerated} 
          config={llmConfig} 
          setConfig={setLlmConfig} 
        />

        {/* Dataflow Canvas */}
        <div className="flex-1 h-full relative">
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onEdgeClick={onEdgeClick}
            fitView
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
