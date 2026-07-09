import { CONVERSION_GUIDE } from "./src/server/conversion-guide";
import { generateText, generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { error } from "console";

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
- Automatically add primary keys (e.g. an "id" column of type "serial" or "uuid") if not specified.
- For relationships, set "type" correctly. If Table A has a column referencing Table B, Table A is the "fromTable" and the column is "fromColumn".
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
    const { prompt, provider = "ollama", apiKey = "", model = "" } = body;

    if (!prompt) {
      return Response.json({ error: "Prompt is required" }, { status: 400 });
    }

    if (provider === "ollama") {
      const modelName = model || "gemma4:e4b";
      // Fetch from local Ollama instance
      const response = await fetch("http://localhost:11434/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: "system", content: GENERATE_SYSTEM_PROMPT },
            { role: "user", content: prompt }
          ],
          stream: false,
          format: "json"
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        return Response.json({ error: `Ollama failed: ${errorText}` }, { status: 500 });
      }


      const data = await response.json();
      let rawText = data.message?.content || "";

      // Clean rawText
      rawText = rawText.trim();
      if (rawText.startsWith("```json")) {
        rawText = rawText.substring(7, rawText.length - 3).trim();
      } else if (rawText.startsWith("```")) {
        rawText = rawText.substring(3, rawText.length - 3).trim();
      }

      // Repair incomplete/truncated JSON structures from the local model
      let parsedSchema: any = null;
      let repairAttempts = [
        rawText,
        // Attempt 1: Add missing array/object delimiters if truncated inside table list
        rawText + '\n          ]\n        }\n      ]\n    }\n  ],\n  "relations": []\n}',
        rawText + '\n      ]\n    }\n  ],\n  "relations": []\n}',
        rawText + '\n    }\n  ],\n  "relations": []\n}',
        rawText + '\n  ],\n  "relations": []\n}',
        rawText + '\n}',
        rawText + ']}',
      ];

      // Dynamic JSON recovery function
      const tryBalancedRepair = (jsonStr: string): string => {
        let braces = 0;
        let brackets = 0;
        let inString = false;
        let escaped = false;
        
        for (let i = 0; i < jsonStr.length; i++) {
          const char = jsonStr[i];
          if (escaped) {
            escaped = false;
            continue;
          }
          if (char === '\\') {
            escaped = true;
            continue;
          }
          if (char === '"') {
            inString = !inString;
            continue;
          }
          if (!inString) {
            if (char === '{') braces++;
            if (char === '}') braces--;
            if (char === '[') brackets++;
            if (char === ']') brackets--;
          }
        }
        
        let repaired = jsonStr;
        if (inString) repaired += '"';
        
        while (brackets > 0) {
          repaired += ']';
          brackets--;
        }
        while (braces > 0) {
          repaired += '}';
          braces--;
        }
        return repaired;
      };

      repairAttempts.push(tryBalancedRepair(rawText));

      for (const attempt of repairAttempts) {
        try {
          const candidate = JSON.parse(attempt);
          if (candidate && (candidate.tables || Array.isArray(candidate))) {
            parsedSchema = candidate;
            break;
          }
        } catch (e) {
          // keep trying
        }
      }

      // If all structured parses fail, execute a fallback regex parser to capture what we can
      if (!parsedSchema) {
        try {
          const tables: any[] = [];
          const tableMatches = rawText.matchAll(/"name":\s*"([^"]+)"[\s\S]*?"columns":\s*\[([\s\S]*?)\]/g);
          for (const match of tableMatches) {
            const tableName = match[1];
            const colsText = match[2];
            const columns: any[] = [];
            const colMatches = colsText.matchAll(/\{[\s\S]*?"name":\s*"([^"]+)"[\s\S]*?"type":\s*"([^"]+)"[\s\S]*?\}/g);
            for (const colMatch of colMatches) {
              columns.push({
                name: colMatch[1],
                type: colMatch[2],
                primaryKey: colMatch[0].includes('"primaryKey": true'),
                notNull: colMatch[0].includes('"notNull": true'),
                unique: colMatch[0].includes('"unique": true'),
                isIndex: colMatch[0].includes('"isIndex": true')
              });
            }
            tables.push({ name: tableName, columns });
          }
          if (tables.length > 0) {
            parsedSchema = { tables, relations: [] };
          }
        } catch (e) {
          // fallback failed
        }
      }

      if (!parsedSchema) {
        return Response.json({ error: "Failed to parse or repair incomplete local LLM JSON response", rawResponse: rawText }, { status: 500 });
      }

      const finalSchema = {
        tables: Array.isArray(parsedSchema.tables) ? parsedSchema.tables : [],
        relations: Array.isArray(parsedSchema.relations) ? parsedSchema.relations : []
      };

      return Response.json({ schema: finalSchema, rawResponse: rawText });
    } else {
      // Use Vercel AI SDK
      const modelInstance = getModelInstance(provider, apiKey, model);
      const { text } = await generateText({
        model: modelInstance,
        system: GENERATE_SYSTEM_PROMPT,
        prompt: prompt,
      });

      // Attempt to strip potential markdown codeblocks if provider ignored system instructions
      let cleanedText = text.trim();
      if (cleanedText.startsWith("```json")) {
        cleanedText = cleanedText.substring(7, cleanedText.length - 3).trim();
      } else if (cleanedText.startsWith("```")) {
        cleanedText = cleanedText.substring(3, cleanedText.length - 3).trim();
      }

      try {
        const schema = JSON.parse(cleanedText);
        return Response.json({ schema, rawResponse: text });
      } catch (err) {
        return Response.json({ error: "Failed to parse hosted LLM JSON response", rawResponse: text }, { status: 500 });
      }
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
          stream: false
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

// Serve static assets in production, otherwise proxy handles api routes
const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // API Routing
    if (url.pathname === "/api/schema/generate" && req.method === "POST") {
      return handleGenerate(req);
    }
    if (url.pathname === "/api/schema/translate" && req.method === "POST") {
      return handleTranslate(req);
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
