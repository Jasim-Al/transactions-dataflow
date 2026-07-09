import React, { useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Trash2, Plus, Edit2, Check, Settings } from 'lucide-react';
import type { Table, Column } from '../types/schema';

interface TableNodeProps {
  data: {
    table: Table;
    onRenameTable: (tableId: string, newName: string) => void;
    onDeleteTable: (tableId: string) => void;
    onAddColumn: (tableId: string) => void;
    onUpdateColumn: (tableId: string, columnId: string, updates: Partial<Column>) => void;
    onDeleteColumn: (tableId: string, columnId: string) => void;
  };
}

export const TableNode: React.FC<TableNodeProps> = ({ data }) => {
  const { table, onRenameTable, onDeleteTable, onAddColumn, onUpdateColumn, onDeleteColumn } = data;
  const [isEditingName, setIsEditingName] = useState(false);
  const [tableNameInput, setTableNameInput] = useState(table.name);
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);

  const handleRenameSubmit = () => {
    if (tableNameInput.trim()) {
      onRenameTable(table.id, tableNameInput.trim().toLowerCase().replace(/\s+/g, '_'));
      setIsEditingName(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRenameSubmit();
    } else if (e.key === 'Escape') {
      setTableNameInput(table.name);
      setIsEditingName(false);
    }
  };

  return (
    <div className="react-flow__node-table min-w-[320px] max-w-[420px] rounded-xl overflow-hidden border border-border bg-card/95 backdrop-blur-md shadow-2xl transition-all">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-primary/10 to-primary/5 border-b border-border/80">
        <div className="flex items-center gap-2 flex-1 mr-2">
          <div className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
          {isEditingName ? (
            <input
              type="text"
              value={tableNameInput}
              onChange={(e) => setTableNameInput(e.target.value)}
              onBlur={handleRenameSubmit}
              onKeyDown={handleKeyDown}
              autoFocus
              className="bg-background/80 border border-primary/50 text-foreground text-sm font-semibold rounded px-2 py-0.5 w-full outline-none focus:ring-1 focus:ring-primary"
            />
          ) : (
            <span 
              onClick={() => setIsEditingName(true)}
              className="text-sm font-semibold text-foreground tracking-wide cursor-pointer hover:text-primary transition-colors flex items-center gap-1.5"
            >
              {table.name}
              <Edit2 className="w-3.5 h-3.5 text-muted-foreground opacity-50 hover:opacity-100" />
            </span>
          )}
        </div>
        <button
          onClick={() => onDeleteTable(table.id)}
          className="text-muted-foreground hover:text-destructive p-1 rounded-md hover:bg-secondary/80 transition-colors"
          title="Delete Table"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Column List */}
      <div className="p-3 space-y-2">
        {table.columns.map((col) => {
          const isEditing = editingColumnId === col.id;
          return (
            <div 
              key={col.id} 
              className={`relative flex flex-col p-2 rounded-lg border transition-all ${
                isEditing 
                  ? 'bg-secondary/40 border-primary/30' 
                  : 'bg-secondary/20 border-transparent hover:border-border/60'
              }`}
            >
              {/* Handles */}
              <Handle
                type="target"
                position={Position.Left}
                id={`${table.id}-${col.id}-target`}
                className="!bg-primary hover:!bg-foreground"
                style={{ left: '-4px' }}
              />
              
              <Handle
                type="source"
                position={Position.Right}
                id={`${table.id}-${col.id}-source`}
                className="!bg-primary hover:!bg-foreground"
                style={{ right: '-4px' }}
              />

              {/* View / Edit Form */}
              {isEditing ? (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={col.name}
                      onChange={(e) => onUpdateColumn(table.id, col.id, { name: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                      placeholder="Column name"
                      className="bg-background text-foreground text-xs rounded border border-border px-2 py-1 flex-1 outline-none focus:border-primary"
                    />
                    <select
                      value={col.type}
                      onChange={(e) => onUpdateColumn(table.id, col.id, { type: e.target.value as any })}
                      className="bg-background text-foreground text-xs rounded border border-border px-2 py-1 outline-none focus:border-primary"
                    >
                      <option value="serial">serial</option>
                      <option value="integer">integer</option>
                      <option value="varchar">varchar(255)</option>
                      <option value="text">text</option>
                      <option value="boolean">boolean</option>
                      <option value="timestamp">timestamp</option>
                      <option value="uuid">uuid</option>
                      <option value="jsonb">jsonb</option>
                    </select>
                  </div>

                  {/* Badges Toggles */}
                  <div className="flex flex-wrap gap-1.5 items-center justify-between">
                    <div className="flex gap-1">
                      <button
                        onClick={() => onUpdateColumn(table.id, col.id, { primaryKey: !col.primaryKey })}
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded border transition-all ${
                          col.primaryKey 
                            ? 'bg-primary/20 border-primary text-primary-foreground' 
                            : 'bg-background/40 border-border text-muted-foreground hover:border-muted-foreground'
                        }`}
                        title="Primary Key"
                      >
                        PK
                      </button>
                      <button
                        onClick={() => onUpdateColumn(table.id, col.id, { unique: !col.unique })}
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded border transition-all ${
                          col.unique 
                            ? 'bg-amber-500/20 border-amber-500 text-amber-300' 
                            : 'bg-background/40 border-border text-muted-foreground hover:border-muted-foreground'
                        }`}
                        title="Unique Constraint"
                      >
                        UQ
                      </button>
                      <button
                        onClick={() => onUpdateColumn(table.id, col.id, { notNull: !col.notNull })}
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded border transition-all ${
                          col.notNull 
                            ? 'bg-teal-500/20 border-teal-500 text-teal-300' 
                            : 'bg-background/40 border-border text-muted-foreground hover:border-muted-foreground'
                        }`}
                        title="Not Null"
                      >
                        NN
                      </button>
                      <button
                        onClick={() => onUpdateColumn(table.id, col.id, { isIndex: !col.isIndex })}
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded border transition-all ${
                          col.isIndex 
                            ? 'bg-blue-500/20 border-blue-500 text-blue-300' 
                            : 'bg-background/40 border-border text-muted-foreground hover:border-muted-foreground'
                        }`}
                        title="Index Column"
                      >
                        IX
                      </button>
                    </div>
                    
                    <div className="flex gap-1">
                      <button
                        onClick={() => onDeleteColumn(table.id, col.id)}
                        className="text-muted-foreground hover:text-destructive p-1 rounded hover:bg-background/60 transition-colors"
                        title="Delete Column"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setEditingColumnId(null)}
                        className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-background/60 transition-colors"
                        title="Close Edit"
                      >
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between group">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${col.primaryKey ? 'text-primary font-semibold' : 'text-foreground'}`}>
                      {col.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground/80 bg-secondary px-1.5 py-0.5 rounded">
                      {col.type}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-1.5">
                    {/* Constraints badges visual indicators */}
                    <div className="flex gap-0.5">
                      {col.primaryKey && <span className="text-[8px] bg-primary/20 text-primary border border-primary/30 px-1 rounded-sm font-bold">PK</span>}
                      {col.unique && <span className="text-[8px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1 rounded-sm font-bold">UQ</span>}
                      {col.notNull && <span className="text-[8px] bg-teal-500/10 text-teal-400 border border-teal-500/20 px-1 rounded-sm font-bold">NN</span>}
                      {col.isIndex && <span className="text-[8px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1 rounded-sm font-bold">IX</span>}
                    </div>

                    <button
                      onClick={() => setEditingColumnId(col.id)}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary p-0.5 rounded transition-all"
                      title="Edit Column"
                    >
                      <Settings className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {table.columns.length === 0 && (
          <div className="text-center py-4 text-xs text-muted-foreground/60 italic border border-dashed border-border/60 rounded-lg">
            No columns. Add one below.
          </div>
        )}
      </div>

      {/* Footer / Add column */}
      <div className="px-3 py-2.5 bg-secondary/10 border-t border-border/50 flex items-center justify-center">
        <button
          onClick={() => onAddColumn(table.id)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors py-1 px-3 w-full justify-center rounded-lg hover:bg-secondary/40 border border-dashed border-border/60 hover:border-primary/40"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Column
        </button>
      </div>
    </div>
  );
};
