export interface Column {
  id: string; // Unique within table
  name: string;
  type: 'serial' | 'integer' | 'varchar' | 'text' | 'boolean' | 'timestamp' | 'uuid' | 'jsonb';
  primaryKey: boolean;
  notNull: boolean;
  unique: boolean;
  isIndex: boolean;
}

export interface Table {
  id: string; // unique ID, usually table name
  name: string;
  columns: Column[];
  x?: number;
  y?: number;
}

export interface Relation {
  id: string;
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  type: 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many';
}

export interface DatabaseSchema {
  tables: Table[];
  relations: Relation[];
}

export interface LLMConfig {
  provider: 'ollama' | 'openai' | 'anthropic' | 'google';
  apiKey: string;
  model: string;
}
