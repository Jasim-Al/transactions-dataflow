import type { DatabaseSchema, Table, Column, Relation } from '../types/schema';

export interface SchemaAction {
  type: 'addTable' | 'deleteTable' | 'renameTable' | 'addColumn' | 'deleteColumn' | 'modifyColumn' | 'addRelation' | 'deleteRelation';
  table?: Table;
  tableName?: string;
  oldName?: string;
  newName?: string;
  column?: Column | Partial<Column>;
  columnName?: string;
  relation?: Relation;
  relationId?: string;
  fromTable?: string;
  fromColumn?: string;
  toTable?: string;
  toColumn?: string;
}

export function applySchemaActions(currentSchema: DatabaseSchema, actions: SchemaAction[]): DatabaseSchema {
  // Deep clone current schema
  const updated: DatabaseSchema = JSON.parse(JSON.stringify(currentSchema));

  if (!updated.tables) updated.tables = [];
  if (!updated.relations) updated.relations = [];

  for (const action of actions) {
    switch (action.type) {
      case 'addTable': {
        if (!action.table) break;
        const newTable = { ...action.table };
        newTable.id = newTable.id || newTable.name;
        // Avoid duplicate tables by name
        if (!updated.tables.some(t => t.name.toLowerCase() === newTable.name.toLowerCase())) {
          // Initialize columns with unique IDs if missing
          newTable.columns = (newTable.columns || []).map((col, colIdx) => ({
            ...col,
            id: col.id || `col_${Date.now()}_${colIdx}_${col.name}`,
          }));
          updated.tables.push(newTable);
        }
        break;
      }

      case 'deleteTable': {
        const nameToDelete = action.tableName;
        if (!nameToDelete) break;
        
        updated.tables = updated.tables.filter(t => t.name.toLowerCase() !== nameToDelete.toLowerCase());
        updated.relations = updated.relations.filter(r => 
          r.fromTable.toLowerCase() !== nameToDelete.toLowerCase() &&
          r.toTable.toLowerCase() !== nameToDelete.toLowerCase()
        );
        break;
      }

      case 'renameTable': {
        const { oldName, newName } = action;
        if (!oldName || !newName) break;

        const table = updated.tables.find(t => t.name.toLowerCase() === oldName.toLowerCase());
        if (table) {
          table.name = newName;
          table.id = newName; // Typically align ID with name
        }

        // Update relations referencing this table
        updated.relations.forEach(r => {
          if (r.fromTable.toLowerCase() === oldName.toLowerCase()) {
            r.fromTable = newName;
          }
          if (r.toTable.toLowerCase() === oldName.toLowerCase()) {
            r.toTable = newName;
          }
        });
        break;
      }

      case 'addColumn': {
        const { tableName, column } = action;
        if (!tableName || !column) break;

        const table = updated.tables.find(t => t.name.toLowerCase() === tableName.toLowerCase());
        if (table) {
          const colName = column.name;
          if (colName && !table.columns.some(c => c.name.toLowerCase() === colName.toLowerCase())) {
            const newCol: Column = {
              id: column.id || `col_${Date.now()}_${colName}`,
              name: colName,
              type: (column.type as any) || 'varchar',
              primaryKey: !!column.primaryKey,
              notNull: !!column.notNull,
              unique: !!column.unique,
              isIndex: !!column.isIndex,
            };
            table.columns.push(newCol);
          }
        }
        break;
      }

      case 'deleteColumn': {
        const { tableName, columnName } = action;
        if (!tableName || !columnName) break;

        const table = updated.tables.find(t => t.name.toLowerCase() === tableName.toLowerCase());
        if (table) {
          table.columns = table.columns.filter(c => c.name.toLowerCase() !== columnName.toLowerCase());
        }

        // Delete relations that referenced this column
        updated.relations = updated.relations.filter(r => 
          !(r.fromTable.toLowerCase() === tableName.toLowerCase() && r.fromColumn.toLowerCase() === columnName.toLowerCase()) &&
          !(r.toTable.toLowerCase() === tableName.toLowerCase() && r.toColumn.toLowerCase() === columnName.toLowerCase())
        );
        break;
      }

      case 'modifyColumn': {
        const { tableName, columnName, column } = action;
        if (!tableName || !columnName || !column) break;

        const table = updated.tables.find(t => t.name.toLowerCase() === tableName.toLowerCase());
        if (table) {
          const col = table.columns.find(c => c.name.toLowerCase() === columnName.toLowerCase());
          if (col) {
            // Apply modifications
            if (column.name) col.name = column.name;
            if (column.type) col.type = column.type;
            if (column.primaryKey !== undefined) col.primaryKey = column.primaryKey;
            if (column.notNull !== undefined) col.notNull = column.notNull;
            if (column.unique !== undefined) col.unique = column.unique;
            if (column.isIndex !== undefined) col.isIndex = column.isIndex;
          }
        }
        break;
      }

      case 'addRelation': {
        if (!action.relation) break;
        const newRel = { ...action.relation };
        newRel.id = newRel.id || `rel_${newRel.fromTable}_${newRel.fromColumn}_${newRel.toTable}_${newRel.toColumn}`;
        
        // Avoid duplicate relations
        const exists = updated.relations.some(r => 
          r.fromTable.toLowerCase() === newRel.fromTable.toLowerCase() &&
          r.fromColumn.toLowerCase() === newRel.fromColumn.toLowerCase() &&
          r.toTable.toLowerCase() === newRel.toTable.toLowerCase() &&
          r.toColumn.toLowerCase() === newRel.toColumn.toLowerCase()
        );
        if (!exists) {
          updated.relations.push(newRel);
        }
        break;
      }

      case 'deleteRelation': {
        const { relationId, fromTable, fromColumn, toTable, toColumn } = action;
        if (relationId) {
          updated.relations = updated.relations.filter(r => r.id !== relationId);
        } else if (fromTable && fromColumn && toTable && toColumn) {
          updated.relations = updated.relations.filter(r => 
            !(r.fromTable.toLowerCase() === fromTable.toLowerCase() &&
              r.fromColumn.toLowerCase() === fromColumn.toLowerCase() &&
              r.toTable.toLowerCase() === toTable.toLowerCase() &&
              r.toColumn.toLowerCase() === toColumn.toLowerCase())
          );
        }
        break;
      }
    }
  }

  return updated;
}
