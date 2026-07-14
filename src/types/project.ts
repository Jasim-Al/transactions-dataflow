import type { Node, Edge } from '@xyflow/react';
import type { DatabaseSchema } from './schema';

export interface ProjectMetadata {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  tablesCount: number;
  relationsCount: number;
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  schema: DatabaseSchema;
  nodes: Node[];
  edges: Edge[];
}
