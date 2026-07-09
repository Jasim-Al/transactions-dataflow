import type { DatabaseSchema } from '../types/schema';

// Helper to convert table names (e.g. user_profiles) to camelCase variable names (e.g. userProfiles)
export function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

export function generateDrizzleSchema(schema: DatabaseSchema): string {
  if (!schema.tables || schema.tables.length === 0) {
    return `// No tables defined yet. Generate or add tables to see the Drizzle ORM schema.`;
  }

  const imports = new Set<string>(['pgTable']);
  
  // Collect all column types used to build import statement
  schema.tables.forEach(table => {
    table.columns.forEach(col => {
      if (col.type === 'serial') imports.add('serial');
      else if (col.type === 'integer') imports.add('integer');
      else if (col.type === 'varchar') imports.add('varchar');
      else if (col.type === 'text') imports.add('text');
      else if (col.type === 'boolean') imports.add('boolean');
      else if (col.type === 'timestamp') imports.add('timestamp');
      else if (col.type === 'uuid') imports.add('uuid');
      else if (col.type === 'jsonb') imports.add('jsonb');
    });
  });

  // Check if we need pgIndex
  const hasIndices = schema.tables.some(table => 
    table.columns.some(col => col.isIndex)
  );
  if (hasIndices) {
    imports.add('pgIndex');
  }

  const importStatement = `import { ${Array.from(imports).sort().join(', ')} } from "drizzle-orm/pg-core";\n` +
    `import { defineRelations } from "drizzle-orm";\n\n`;

  let tableDefinitions = '';

  schema.tables.forEach(table => {
    const varName = toCamelCase(table.name);
    let tableCode = `export const ${varName} = pgTable("${table.name}", {\n`;

    // Generate columns
    table.columns.forEach(col => {
      let colDef = `  ${toCamelCase(col.name)}: `;
      
      switch (col.type) {
        case 'serial':
          colDef += `serial("${col.name}")`;
          break;
        case 'integer':
          colDef += `integer("${col.name}")`;
          break;
        case 'varchar':
          colDef += `varchar("${col.name}", { length: 255 })`;
          break;
        case 'text':
          colDef += `text("${col.name}")`;
          break;
        case 'boolean':
          colDef += `boolean("${col.name}")`;
          break;
        case 'timestamp':
          colDef += `timestamp("${col.name}")`;
          break;
        case 'uuid':
          colDef += `uuid("${col.name}")`;
          break;
        case 'jsonb':
          colDef += `jsonb("${col.name}")`;
          break;
      }

      if (col.primaryKey) colDef += '.primaryKey()';
      if (col.notNull && col.type !== 'serial') colDef += '.notNull()';
      if (col.unique) colDef += '.unique()';

      tableCode += `${colDef},\n`;
    });

    // Check for indexes
    const tableIndexedCols = table.columns.filter(col => col.isIndex);
    if (tableIndexedCols.length > 0) {
      tableCode += `}, (table) => {\n  return {\n`;
      tableIndexedCols.forEach(col => {
        const indexName = `${table.name}_${col.name}_idx`;
        tableCode += `    ${toCamelCase(col.name)}Idx: pgIndex("${indexName}").on(table.${toCamelCase(col.name)}),\n`;
      });
      tableCode += `  };\n});\n\n`;
    } else {
      tableCode += `});\n\n`;
    }

    tableDefinitions += tableCode;
  });

  // Generate Relations definitions
  let relationsDefinitions = '';
  
  const tablesWithRelations = schema.tables.filter(table => {
    const hasSource = schema.relations.some(r => r.fromTable === table.name);
    const hasTarget = schema.relations.some(r => r.toTable === table.name);
    return hasSource || hasTarget;
  });

  if (tablesWithRelations.length > 0) {
    relationsDefinitions += `export const schemaRelations = defineRelations({\n`;
    tablesWithRelations.forEach(table => {
      relationsDefinitions += `  ${toCamelCase(table.name)},\n`;
    });
    relationsDefinitions += `}, (r) => ({\n`;

    schema.tables.forEach(table => {
      const tableVar = toCamelCase(table.name);
      const sourceRelations = schema.relations.filter(r => r.fromTable === table.name);
      const targetRelations = schema.relations.filter(r => r.toTable === table.name);

      if (sourceRelations.length > 0 || targetRelations.length > 0) {
        relationsDefinitions += `  ${tableVar}: {\n`;
        
        // Relations where this table is the source (owns the foreign key)
        sourceRelations.forEach(r => {
          const relationName = toCamelCase(r.fromColumn.replace(/_id$/, ''));
          const targetTableVar = toCamelCase(r.toTable);
          
          relationsDefinitions += `    ${relationName}: r.one(${targetTableVar}, {\n` +
            `      fields: [${tableVar}.${toCamelCase(r.fromColumn)}],\n` +
            `      references: [${targetTableVar}.${toCamelCase(r.toColumn)}],\n` +
            `    }),\n`;
        });

        // Relations where this table is the target (is referenced by others)
        const relationsAdded = new Set<string>();
        targetRelations.forEach(r => {
          const sourceTableVar = toCamelCase(r.fromTable);
          let fieldName = sourceTableVar;
          
          if (relationsAdded.has(fieldName)) {
            fieldName += '_' + toCamelCase(r.fromColumn);
          }
          relationsAdded.add(fieldName);

          if (r.type === 'one-to-one') {
            relationsDefinitions += `    ${fieldName}: r.one(${sourceTableVar}),\n`;
          } else {
            relationsDefinitions += `    ${fieldName}: r.many(${sourceTableVar}),\n`;
          }
        });

        relationsDefinitions += `  },\n`;
      }
    });

    relationsDefinitions += `}));\n\n`;
  }

  return imports.size > 0 
    ? `${importStatement}${tableDefinitions}${relationsDefinitions}`.trim() + '\n'
    : '';
}
