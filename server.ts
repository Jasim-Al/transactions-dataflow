import { CONVERSION_GUIDE } from "./src/server/conversion-guide";
import { generateText, generateObject, streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { error } from "console";
import { mkdir, readdir, unlink, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const PORT = 3001;

const GENERATE_SYSTEM_PROMPT = `You are an expert database architect. Your task is to analyze the user's input (which could be a natural language description of a database, or an existing schema in another dialect such as MongoDB Mongoose, MySQL, Prisma, etc.) and generate a structured database schema definition for a PostgreSQL database.

You must respond ONLY with a JSON object matching the following structure. Do not include any explanation, markdown formatting (do not wrap in \`\`\`json), or extra characters outside the JSON object.

Schema Structure:
{
  "tables": [
    {
      "name": "table_name",
      "columns": [
        {
          "name": "column_name",
          "type": "serial" | "integer" | "varchar" | "text" | "boolean" | "timestamp" | "uuid" | "jsonb",
          "primaryKey": boolean,
          "notNull": boolean,
          "unique": boolean,
          "isIndex": boolean
        }
      ]
    }
  ],
  "relations": [
    {
      "fromTable": "source_table_name",
      "fromColumn": "source_column_name",
      "toTable": "target_table_name",
      "toColumn": "target_column_name",
      "type": "one-to-one" | "one-to-many" | "many-to-one" | "many-to-many"
    }
  ]
}

Important Instructions:
- Create logical columns and foreign keys based on the user's description.
- Use PostgreSQL-compatible types: "serial", "integer", "varchar", "text", "boolean", "timestamp", "uuid", "jsonb".
- Relational Normalization of Embedded/Nested Structures: Do NOT default to using "jsonb" columns for embedded objects or arrays of sub-documents (e.g. Mongoose nested schemas). Instead, you MUST either:
  1. Flatten the nested keys into separate columns in the main table (e.g. connections details, settings flag values), OR
  2. Extract the nested structure into its own table, creating a relational linkage with a foreign key and relation configuration.
- ONLY use "jsonb" when the column stores highly arbitrary, unstructured, or dynamically changing key-value collections that cannot be represented as regular fields or relations.
- Automatically add primary keys (e.g. an "id" column of type "serial" or "uuid") if not specified.
- MongoDB/Mongoose Schema Translation Rules:
  1. Map Mongoose Schemas/Collections to individual PostgreSQL tables (e.g., Schema "User" -> table "users").
  2. Parse reference keys: Identify fields configured with "ref: 'ModelName'" or "type: Schema.Types.ObjectId". These are foreign keys referencing the primary key of the target table.
  3. Create explicit relational fields: For every such reference, add an integer or uuid column in the source table named like "{fieldName}_id" or "{targetTable}_id" (e.g. "author: { type: ObjectId, ref: 'User' }" must map to column "author_id" in the source table).
  4. Ensure every created reference column has a corresponding mapping entry in the "relations" array pointing to the target table's primary key (usually "id").
- Relational Reference Mapping (relations array):
  You MUST identify all foreign key linkages and represent them in the "relations" array.
  * For every relationship, define:
    - "fromTable": the table holding the foreign key column (e.g. "posts").
    - "fromColumn": the foreign key column name (e.g. "author_id").
    - "toTable": the referenced parent table (e.g. "users").
    - "toColumn": the referenced primary key column (e.g. "id").
    - "type": "one-to-one" | "one-to-many" | "many-to-one" | "many-to-many" (default to "many-to-one" for standard foreign keys).
  * Example mapping:
    If table "posts" has "author_id" referencing table "users"."id", the relations array must contain:
    {
      "fromTable": "posts",
      "fromColumn": "author_id",
      "toTable": "users",
      "toColumn": "id",
      "type": "many-to-one"
    }
  * Ensure that if you add a foreign key column to a table, you also add the corresponding relation mapping into the "relations" list. Do not leave the relations array empty when linkages exist.
- Try to infer indexes on columns that are likely to be queried or used in lookups (e.g. email, username, foreign keys).`;

function getModelInstance(provider: string, apiKey: string, modelName?: string) {
  if (!apiKey) {
    throw new Error(`API Key is required for provider ${provider}`);
  }
  switch (provider) {
    case "openai": {
      const openai = createOpenAI({ apiKey });
      return openai(modelName || "gpt-4o-mini");
    }
    case "anthropic": {
      const anthropic = createAnthropic({ apiKey });
      return anthropic(modelName || "claude-3-5-sonnet-latest");
    }
    case "google": {
      const google = createGoogleGenerativeAI({ apiKey });
      return google(modelName || "gemini-1.5-flash");
    }
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

async function handleGenerate(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { prompt, currentSchema, provider = "ollama", apiKey = "", model = "" } = body;

    if (!prompt) {
      return Response.json({ error: "Prompt is required" }, { status: 400 });
    }

    let userMessageContent = prompt;
    if (currentSchema && currentSchema.tables && currentSchema.tables.length > 0) {
      userMessageContent = `Current database schema:\n${JSON.stringify(currentSchema, null, 2)}\n\n` +
        `User instruction: ${prompt}\n\n` +
        `IMPORTANT: You MUST preserve all existing tables, columns, types, and relations from the current schema unless the user explicitly requests to modify or delete them. ` +
        `Ensure any new tables or relations you add connect properly with the existing tables and maintain reference integrity.`;
    }

    if (provider === "ollama") {
      const modelName = model || "gemma4:e4b";
      // Fetch from local Ollama instance with stream: true
      const response = await fetch("http://localhost:11434/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: "system", content: GENERATE_SYSTEM_PROMPT },
            { role: "user", content: userMessageContent }
          ],
          stream: true,
          format: "json",
          options: {
            num_ctx: 16384,
            num_predict: 8192,
            temperature: 0.2
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        return Response.json({ error: `Ollama failed: ${errorText}` }, { status: 500 });
      }

      const reader = response.body?.getReader();
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();

      const stream = new ReadableStream({
        async start(controller) {
          if (!reader) {
            controller.close();
            return;
          }
          try {
            let buffer = "";
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              const chunkText = decoder.decode(value, { stream: true });
              buffer += chunkText;

              const lines = buffer.split("\n");
              // Keep the last partial line in buffer
              buffer = lines.pop() || "";

              for (const line of lines) {
                if (line.trim() === "") continue;
                try {
                  const parsed = JSON.parse(line);
                  const content = parsed.message?.content || "";
                  if (content) {
                    controller.enqueue(encoder.encode(content));
                  }
                } catch (e) {
                  // Ignore parse errors on incomplete JSON lines
                }
              }
            }
            // Parse remaining buffer
            if (buffer.trim() !== "") {
              try {
                const parsed = JSON.parse(buffer);
                const content = parsed.message?.content || "";
                if (content) {
                  controller.enqueue(encoder.encode(content));
                }
              } catch (e) {}
            }
          } catch (e) {
            console.error("Ollama stream fetch error:", e);
          } finally {
            controller.close();
          }
        }
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive"
        }
      });
    } else {
      // Use Vercel AI SDK streamText
      const modelInstance = getModelInstance(provider, apiKey, model);
      const { textStream } = await streamText({
        model: modelInstance,
        system: GENERATE_SYSTEM_PROMPT,
        prompt: userMessageContent,
      });

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of textStream) {
              controller.enqueue(encoder.encode(chunk));
            }
          } catch (e) {
            console.error("AI SDK stream text error:", e);
          } finally {
            controller.close();
          }
        }
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive"
        }
      });
    }
  } catch (error: any) {
    return Response.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}

async function handleTranslate(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const {
      drizzleSchema,
      targetDb,
      targetOrm,
      provider = "ollama",
      apiKey = "",
      model = ""
    } = body;

    if (!drizzleSchema || !targetDb || !targetOrm) {
      return Response.json({ error: "Missing required fields: drizzleSchema, targetDb, targetOrm" }, { status: 400 });
    }

    const translateSystemPrompt = `You are a Senior database and ORM translator expert. Your task is to translate a Drizzle ORM PostgreSQL schema into a schema file using the "${targetOrm}" ORM targeting a "${targetDb}" database.

Use this comprehensive Conversion Guide to ensure the target output is fully optimized, syntactically correct, and follows design best practices:

${CONVERSION_GUIDE}

Provide only the final code/schema content for "${targetOrm}" targeting "${targetDb}". Do not include conversational text, explanation or preamble. Output the code block wrapped in standard markdown codeblocks (e.g. \`\`\`prisma or \`\`\`typescript).`;

    const userPrompt = `Here is the source Drizzle PostgreSQL schema code to convert:
\`\`\`typescript
${drizzleSchema}
\`\`\``;

    if (provider === "ollama") {
      const modelName = model || "gemma4:e4b";
      const response = await fetch("http://localhost:11434/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: "system", content: translateSystemPrompt },
            { role: "user", content: userPrompt }
          ],
          stream: false,
          options: {
            num_ctx: 16384,
            num_predict: 8192,
            temperature: 0.2
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        return Response.json({ error: `Ollama translation failed: ${errorText}` }, { status: 500 });
      }

      const data = await response.json();
      const rawText = data.message?.content || "";
      return Response.json({
        translatedCode: rawText,
        promptUsed: `${translateSystemPrompt}\n\n${userPrompt}`
      });
    } else {
      // Use Vercel AI SDK
      const modelInstance = getModelInstance(provider, apiKey, model);
      const { text } = await generateText({
        model: modelInstance,
        system: translateSystemPrompt,
        prompt: userPrompt,
      });

      return Response.json({
        translatedCode: text,
        promptUsed: `${translateSystemPrompt}\n\n${userPrompt}`
      });
    }
  } catch (error: any) {
    return Response.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}

const PROJECTS_DIR = "./projects";
async function ensureProjectsDir() {
  if (!existsSync(PROJECTS_DIR)) {
    await mkdir(PROJECTS_DIR, { recursive: true });
  }
}

async function handleGetProjects(): Promise<Response> {
  try {
    await ensureProjectsDir();
    const files = await readdir(PROJECTS_DIR);
    const projectsList = [];
    for (const file of files) {
      if (file.endsWith(".json")) {
        const filePath = `${PROJECTS_DIR}/${file}`;
        try {
          const content = await readFile(filePath, "utf-8");
          const parsed = JSON.parse(content);
          projectsList.push({
            id: parsed.id,
            name: parsed.name,
            createdAt: parsed.createdAt,
            updatedAt: parsed.updatedAt,
            tablesCount: parsed.schema?.tables?.length || 0,
            relationsCount: parsed.schema?.relations?.length || 0,
          });
        } catch (e) {
          console.error(`Error reading project file ${file}:`, e);
        }
      }
    }
    projectsList.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return Response.json(projectsList);
  } catch (err: any) {
    return Response.json({ error: err.message || "Failed to list projects" }, { status: 500 });
  }
}

async function handleGetProject(id: string): Promise<Response> {
  try {
    await ensureProjectsDir();
    const filePath = `${PROJECTS_DIR}/${id}.json`;
    if (!existsSync(filePath)) {
      return Response.json({ error: "Project not found" }, { status: 404 });
    }
    const content = await readFile(filePath, "utf-8");
    return new Response(content, { headers: { "Content-Type": "application/json" } });
  } catch (err: any) {
    return Response.json({ error: err.message || "Failed to get project" }, { status: 500 });
  }
}

async function handleSaveProject(req: Request): Promise<Response> {
  try {
    await ensureProjectsDir();
    const body = await req.json();
    const { name, schema, nodes, edges } = body;
    let id = body.id;

    if (!name) {
      return Response.json({ error: "Project name is required" }, { status: 400 });
    }

    if (!id) {
      id = `proj_${Date.now()}`;
    }

    const filePath = `${PROJECTS_DIR}/${id}.json`;
    let createdAt = new Date().toISOString();
    
    if (existsSync(filePath)) {
      try {
        const existing = JSON.parse(await readFile(filePath, "utf-8"));
        createdAt = existing.createdAt || createdAt;
      } catch (e) {}
    }

    const projectData = {
      id,
      name,
      createdAt,
      updatedAt: new Date().toISOString(),
      schema,
      nodes,
      edges
    };

    await writeFile(filePath, JSON.stringify(projectData, null, 2), "utf-8");
    return Response.json(projectData);
  } catch (err: any) {
    return Response.json({ error: err.message || "Failed to save project" }, { status: 500 });
  }
}

async function handleDeleteProject(id: string): Promise<Response> {
  try {
    await ensureProjectsDir();
    const filePath = `${PROJECTS_DIR}/${id}.json`;
    if (!existsSync(filePath)) {
      return Response.json({ error: "Project not found" }, { status: 404 });
    }
    await unlink(filePath);
    return Response.json({ success: true, message: "Project deleted successfully" });
  } catch (err: any) {
    return Response.json({ error: err.message || "Failed to delete project" }, { status: 500 });
  }
}

async function handleImportDrizzle(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { drizzleSchema, provider = "ollama", apiKey = "", model = "" } = body;

    if (!drizzleSchema) {
      return Response.json({ error: "Drizzle schema is required" }, { status: 400 });
    }

    const IMPORT_SYSTEM_PROMPT = `You are an expert database architect. Your task is to analyze a Drizzle ORM schema definition and convert it into a structured database schema definition JSON object matching the schema below.

You must respond ONLY with a JSON object matching the following structure. Do not include any explanation, markdown formatting (do not wrap in \`\`\`json or \`\`\`), or extra characters outside the JSON object.

Schema Structure:
{
  "tables": [
    {
      "name": "table_name",
      "columns": [
        {
          "name": "column_name",
          "type": "serial" | "integer" | "varchar" | "text" | "boolean" | "timestamp" | "uuid" | "jsonb",
          "primaryKey": boolean,
          "notNull": boolean,
          "unique": boolean,
          "isIndex": boolean
        }
      ]
    }
  ],
  "relations": [
    {
      "fromTable": "source_table_name",
      "fromColumn": "source_column_name",
      "toTable": "target_table_name",
      "toColumn": "target_column_name",
      "type": "one-to-one" | "one-to-many" | "many-to-one" | "many-to-many"
    }
  ]
}

Important Instructions:
- Parse all pgTable definitions and extract table names, column names, column types, primary keys, notNull, unique, and index constraints.
- Parse defineRelations definitions to populate the "relations" array with correct fromTable, fromColumn, toTable, toColumn, and type mappings.
- If a relation does not specify field/reference columns directly in the defineRelations, search for the corresponding foreign key definition or infer them from the table names and fields (e.g. if post has authorId, and relation references users, infer posts.author_id to users.id).
- Ensure that if you add a foreign key column to a table, you also add the corresponding relation mapping into the "relations" list. Do not leave the relations array empty when linkages exist.
- Response must be ONLY valid JSON matching the structure. No codeblocks, no markdown, no explanation.`;

    const userPrompt = `Here is the Drizzle schema to import:\n\n${drizzleSchema}`;

    let jsonResult = "";

    if (provider === "ollama") {
      const modelName = model || "gemma4:e4b";
      const response = await fetch("http://localhost:11434/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: "system", content: IMPORT_SYSTEM_PROMPT },
            { role: "user", content: userPrompt }
          ],
          stream: false,
          format: "json",
          options: {
            num_ctx: 16384,
            num_predict: 8192,
            temperature: 0.1
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        return Response.json({ error: `Ollama import failed: ${errorText}` }, { status: 500 });
      }

      const data = await response.json();
      jsonResult = data.message?.content || "";
    } else {
      const modelInstance = getModelInstance(provider, apiKey, model);
      const { text } = await generateText({
        model: modelInstance,
        system: IMPORT_SYSTEM_PROMPT,
        prompt: userPrompt,
        temperature: 0.1,
      });
      jsonResult = text;
    }

    let cleaned = jsonResult.trim();
    if (cleaned.startsWith("```json")) {
      cleaned = cleaned.substring(7, cleaned.length - 3).trim();
    } else if (cleaned.startsWith("```")) {
      cleaned = cleaned.substring(3, cleaned.length - 3).trim();
    }

    const schemaObj = JSON.parse(cleaned);
    return Response.json(schemaObj);
  } catch (error: any) {
    return Response.json({ error: error.message || "Failed to parse Drizzle schema" }, { status: 500 });
  }
}

// Serve static assets in production, otherwise proxy handles api routes
const server = Bun.serve({
  port: PORT,
  idleTimeout: 255, // Allow connections to stream up to ~4 minutes before idling out
  async fetch(req) {
    const url = new URL(req.url);

    // API Routing
    if (url.pathname === "/api/schema/generate" && req.method === "POST") {
      return handleGenerate(req);
    }
    if (url.pathname === "/api/schema/translate" && req.method === "POST") {
      return handleTranslate(req);
    }
    if (url.pathname === "/api/schema/import" && req.method === "POST") {
      return handleImportDrizzle(req);
    }
    if (url.pathname === "/api/projects" && req.method === "GET") {
      return handleGetProjects();
    }
    if (url.pathname.startsWith("/api/projects/") && req.method === "GET") {
      const id = url.pathname.slice("/api/projects/".length);
      return handleGetProject(id);
    }
    if (url.pathname === "/api/projects" && req.method === "POST") {
      return handleSaveProject(req);
    }
    if (url.pathname.startsWith("/api/projects/") && req.method === "DELETE") {
      const id = url.pathname.slice("/api/projects/".length);
      return handleDeleteProject(id);
    }

    // Static assets fallback for production
    const filePath = `./dist${url.pathname === "/" ? "/index.html" : url.pathname}`;
    const file = Bun.file(filePath);
    if (await file.exists()) {
      return new Response(file);
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Server running at http://localhost:${server.port}`);
export default server;
