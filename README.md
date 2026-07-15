# Transactions Dataflow (AI Database Architect)

An interactive, visual database design platform that lets you model database schemas using a drag-and-drop canvas, generate schemas from natural language descriptions or database dialects, and compile them to Drizzle ORM schema definitions.

---

## Key Features

* **Visual Database Designer**: Drag-and-drop canvas powered by [@xyflow/react](https://github.com/xyflow/xyflow) to create tables, customize columns, add indexes, and link relationships with live connection handles.
* **AI-Powered Schema Architect**: Describe your database in plain English (or paste a schema from another dialect like MongoDB Mongoose, MySQL, Prisma, etc.) and let AI draft the tables and relations automatically.
* **Incremental Mutations Architecture**: Optimized semantic mutation engine. Major or minor database changes are compiled into small incremental action diffs, providing **sub-2-second streaming response times** and preserving visual table coordinates on the canvas.
* **Live Drizzle ORM Compiler**: Compiles the visual canvas nodes dynamically into fully optimized, type-safe Drizzle ORM PostgreSQL schema code.
* **Multi-ORM Translation Engine**: Translates your Drizzle PostgreSQL schema code into target ORMs (e.g. Prisma, Kysely, TypeORM) or database engines.
* **Local Project Management**: Save, load, and manage database schema projects locally in JSON format.

---

## Tech Stack

### Frontend
* **Core Framework**: React 19 + TypeScript + Vite
* **Visual Canvas**: `@xyflow/react` (React Flow)
* **Styling**: TailwindCSS v4 + Custom glassmorphic utilities
* **Icons**: Lucide React
* **Toast Alerts**: Sonner

### Backend
* **Runtime**: Bun
* **LLM Orchestration**: Vercel AI SDK (`ai` package) with support for:
  * Google Gemini (`@ai-sdk/google`)
  * OpenAI (`@ai-sdk/openai`)
  * Anthropic (`@ai-sdk/anthropic`)
  * Local Ollama models (via custom streams)

---

## Getting Started

### Prerequisites
Make sure you have [Bun](https://bun.sh) installed.

### Setup and Installation

1. Clone the repository and navigate to the project directory:
   ```bash
   cd transactions-dataflow
   ```

2. Install dependencies:
   ```bash
   bun install
   ```

3. Set your environment variables (optional, for cloud LLM providers):
   ```bash
   export GEMINI_API_KEY="your-api-key"
   export OPENAI_API_KEY="your-api-key"
   export ANTHROPIC_API_KEY="your-api-key"
   ```
   *Note: You can also configure API keys directly inside the application UI.*

### Running the Application

Start both the frontend development server and the backend server concurrently:
```bash
bun run dev
```

* The **Frontend** will run at [http://localhost:5173](http://localhost:5173) (or the next available port).
* The **Backend Server** will run at [http://localhost:3001](http://localhost:3001).

### Running Locally with Ollama

If you prefer to run schema generation entirely locally:
1. Ensure [Ollama](https://ollama.com) is installed and running on port `11434`.
2. Download a compatible model (e.g. `gemma4:e4b`):
   ```bash
   ollama pull gemma4:e4b
   ```
3. Open the LLM configurations panel in the top-left of the application, select **Ollama (Local)** as the provider, and input your model name.

---

## Project Structure

```
├── projects/              # Saved local project configurations (JSON)
├── src/
│   ├── components/        # Frontend visual modules (Canvas, Sidebars, Modals)
│   ├── types/             # TypeScript schemas & LLM config definitions
│   ├── utils/
│   │   ├── drizzleGenerator.ts # Compiles canvas structures to Drizzle ORM
│   │   └── schemaMutator.ts    # Computes/Applies incremental schema updates
│   ├── App.tsx            # Application shell & state orchestrator
│   └── main.tsx           # Entry point
├── server.ts              # Bun backend endpoint handling schema generation/translation
├── package.json           # Scripts and dependencies
└── tsconfig.json          # TypeScript configurations
```
