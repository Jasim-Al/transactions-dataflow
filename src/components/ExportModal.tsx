import React, { useState } from 'react';
import { X, Copy, Check, Download, ArrowRight, Code, Terminal, Sparkles } from 'lucide-react';
import type { LLMConfig } from '../types/schema';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  drizzleCode: string;
  config: LLMConfig;
}

export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose, drizzleCode, config }) => {
  const [activeTab, setActiveTab] = useState<'drizzle' | 'translate'>('drizzle');
  const [targetDb, setTargetDb] = useState('MongoDB');
  const [targetOrm, setTargetOrm] = useState('Mongoose');
  
  const [copiedDrizzle, setCopiedDrizzle] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedTranslation, setCopiedTranslation] = useState(false);

  const [loading, setLoading] = useState(false);
  const [translatedCode, setTranslatedCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopyDrizzle = () => {
    navigator.clipboard.writeText(drizzleCode);
    setCopiedDrizzle(true);
    setTimeout(() => setCopiedDrizzle(false), 2000);
  };

  const handleDownloadDrizzle = () => {
    const blob = new Blob([drizzleCode], { type: 'text/typescript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'schema.ts';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleTranslate = async () => {
    setLoading(true);
    setError(null);
    setTranslatedCode(null);

    try {
      const response = await fetch('/api/schema/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          drizzleSchema: drizzleCode,
          targetDb,
          targetOrm,
          provider: config.provider,
          apiKey: config.apiKey,
          model: config.model,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to translate schema');
      }

      console.log("LLM Translation Response:", data.translatedCode);
      setTranslatedCode(data.translatedCode);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to perform conversion. Check if your LLM settings are correct.');
    } finally {
      setLoading(false);
    }
  };

  // Compile the prompt that users can copy to paste in external LLMs
  const compileConversionPrompt = () => {
    return `Translate this Drizzle ORM PostgreSQL schema to use the "${targetOrm}" ORM targeting a "${targetDb}" database.

Here is the source Drizzle PostgreSQL schema code to convert:
\`\`\`typescript
${drizzleCode}
\`\`\`

Ensure it is fully optimized, syntactically correct, and follows schema design best practices. Provide only the final code/schema content for "${targetOrm}" targeting "${targetDb}".`;
  };

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(compileConversionPrompt());
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  const handleCopyTranslation = () => {
    if (translatedCode) {
      navigator.clipboard.writeText(translatedCode);
      setCopiedTranslation(true);
      setTimeout(() => setCopiedTranslation(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div 
        className="w-full max-w-3xl bg-card border border-border rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/80">
          <div className="flex items-center gap-2">
            <Code className="w-5 h-5 text-primary" />
            <h2 className="text-base font-bold text-foreground">Export Schema</h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-secondary/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-border/50 p-2 bg-secondary/20">
          <button
            onClick={() => setActiveTab('drizzle')}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'drizzle'
                ? 'bg-card border border-border/85 text-primary shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            1. Drizzle ORM schema.ts
          </button>
          <button
            onClick={() => setActiveTab('translate')}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'translate'
                ? 'bg-card border border-border/85 text-primary shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            2. Translate to other Dialect + ORM
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'drizzle' ? (
            <div className="space-y-4 h-full flex flex-col">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">PostgreSQL Drizzle Schema</h3>
                  <p className="text-xs text-muted-foreground">The visual data model compiled to Drizzle code.</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleCopyDrizzle}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary text-foreground rounded-lg border border-border hover:border-muted-foreground text-xs font-semibold transition-all cursor-pointer"
                  >
                    {copiedDrizzle ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copy
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleDownloadDrizzle}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-xs font-semibold transition-all cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download schema.ts
                  </button>
                </div>
              </div>

              <div className="flex-1 bg-background/50 border border-border rounded-xl p-4 font-mono text-[11px] leading-relaxed text-foreground overflow-auto max-h-[350px] relative">
                <pre>{drizzleCode}</pre>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Dialect settings inputs */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-secondary/35 rounded-xl border border-border/50">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">
                    Preferred Database
                  </label>
                  <input
                    type="text"
                    value={targetDb}
                    onChange={(e) => setTargetDb(e.target.value)}
                    placeholder="e.g. MongoDB, MySQL, SQLite"
                    className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground outline-none focus:border-primary transition-colors"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">
                    Preferred ORM
                  </label>
                  <input
                    type="text"
                    value={targetOrm}
                    onChange={(e) => setTargetOrm(e.target.value)}
                    placeholder="e.g. Mongoose, Prisma, TypeORM"
                    className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground outline-none focus:border-primary transition-colors"
                  />
                </div>
              </div>

              {/* Actions Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col p-4 rounded-xl border border-border/60 hover:border-primary/40 bg-secondary/15 transition-all justify-between gap-4">
                  <div>
                    <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <Terminal className="w-3.5 h-3.5 text-primary" />
                      Option A: Copy AI Prompt
                    </h4>
                    <p className="text-[11px] text-muted-foreground leading-relaxed mt-1">
                      Copies a fully structured prompt with your schema and the translation guide. You can paste this in any external LLM model.
                    </p>
                  </div>
                  <button
                    onClick={handleCopyPrompt}
                    className="w-full py-2 bg-secondary hover:bg-secondary/80 border border-border hover:border-muted-foreground text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 text-foreground transition-all cursor-pointer"
                  >
                    {copiedPrompt ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        Prompt Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copy LLM Prompt
                      </>
                    )}
                  </button>
                </div>

                <div className="flex flex-col p-4 rounded-xl border border-border/60 hover:border-primary/40 bg-secondary/15 transition-all justify-between gap-4">
                  <div>
                    <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-primary" />
                      Option B: Translate via LLM
                    </h4>
                    <p className="text-[11px] text-muted-foreground leading-relaxed mt-1">
                      Converts your schema into {targetOrm} ({targetDb}) instantly using the selected {config.provider} LLM model.
                    </p>
                  </div>
                  <button
                    onClick={handleTranslate}
                    disabled={loading}
                    className="w-full py-2 bg-primary hover:bg-primary/95 text-primary-foreground text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    {loading ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                        Translating...
                      </>
                    ) : (
                      <>
                        <ArrowRight className="w-3.5 h-3.5" />
                        Translate Schema
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Error Output */}
              {error && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-xs text-destructive">
                  {error}
                </div>
              )}

              {/* Translation Output */}
              {translatedCode && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">Converted Schema ({targetOrm})</span>
                    <button
                      onClick={handleCopyTranslation}
                      className="flex items-center gap-1 px-2.5 py-1 bg-secondary border border-border hover:border-muted-foreground rounded-md text-[10px] font-bold text-foreground transition-all cursor-pointer"
                    >
                      {copiedTranslation ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          Copy Code
                        </>
                      )}
                    </button>
                  </div>
                  <div className="bg-background/50 border border-border rounded-xl p-4 font-mono text-[10px] leading-relaxed text-foreground overflow-auto max-h-[300px]">
                    <pre>{translatedCode}</pre>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
