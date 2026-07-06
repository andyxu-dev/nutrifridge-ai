"use client";

import { useEffect, useRef, useState } from "react";
import { assistantChat, assistantSources } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────

type SourceCitation = {
  source_id: string;
  title: string;
  organization: string;
  url?: string;
  topic: string;
  similarity: number;
};

type ToolCallSummary = {
  tool: string;
  summary: string;
  requires_confirmation?: boolean;
};

type MealLogPreview = {
  meal_type: string;
  meal_name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  notes?: string;
};

type InventoryContext = {
  name: string;
  quantity: number;
  unit: string;
  best_before_date: string | null;
  expiration_risk: string;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  retrieved_sources?: SourceCitation[];
  tool_calls?: ToolCallSummary[];
  inventory_context?: InventoryContext[];
  meal_log_preview?: MealLogPreview | null;
  requires_confirmation?: boolean;
  grounded?: boolean;
  warnings?: string[];
};

type KbSource = {
  source_id: string;
  title: string;
  organization: string;
  url?: string;
  topic: string;
  chunk_count: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────

const TOPIC_COLORS: Record<string, string> = {
  food_safety:    "bg-red-100 text-red-700 border-red-200",
  food_storage:   "bg-blue-100 text-blue-700 border-blue-200",
  nutrition:      "bg-green-100 text-green-700 border-green-200",
  health_conditions: "bg-purple-100 text-purple-700 border-purple-200",
  meal_planning:  "bg-amber-100 text-amber-700 border-amber-200",
};

const RISK_STYLES: Record<string, string> = {
  expired: "text-red-600",
  high:    "text-orange-500",
  medium:  "text-yellow-600",
  low:     "text-green-600",
};

const EXAMPLE_QUESTIONS = [
  "Can I still eat chicken that expires tomorrow?",
  "What should I cook tonight using ingredients expiring soon?",
  "What foods should I avoid if I have high cholesterol?",
  "How should I store spinach properly?",
  "Is grilled chicken and rice a good option for fat loss?",
  "How much protein do I have left today?",
];

function SourceBadge({ source }: { source: SourceCitation }) {
  const color = TOPIC_COLORS[source.topic] ?? "bg-gray-100 text-gray-600 border-gray-200";
  return (
    <div className={`inline-flex items-start gap-2 text-xs border rounded-lg px-3 py-2 ${color}`}>
      <span className="font-semibold shrink-0">{source.organization}</span>
      <span className="text-current opacity-80">—</span>
      <span className="opacity-90">{source.title}</span>
      {source.url && (
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-1 underline underline-offset-2 opacity-70 hover:opacity-100 shrink-0"
        >
          ↗
        </a>
      )}
    </div>
  );
}

function ToolActivityBadge({ call }: { call: ToolCallSummary }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full px-2.5 py-1">
      <span className="font-mono text-indigo-400">⚙</span>
      {call.summary}
    </span>
  );
}

function MealLogPreviewCard({
  preview,
  onConfirm,
  onCancel,
  confirming,
}: {
  preview: MealLogPreview;
  onConfirm: () => void;
  onCancel: () => void;
  confirming: boolean;
}) {
  return (
    <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
      <p className="text-sm font-semibold text-amber-800 mb-2">Meal Log Preview</p>
      <div className="grid grid-cols-2 gap-1 text-xs text-amber-900 mb-3">
        <span><strong>Meal:</strong> {preview.meal_name}</span>
        <span><strong>Type:</strong> {preview.meal_type}</span>
        <span><strong>Calories:</strong> {preview.calories} kcal</span>
        <span><strong>Protein:</strong> {preview.protein_g}g</span>
        <span><strong>Carbs:</strong> {preview.carbs_g}g</span>
        <span><strong>Fat:</strong> {preview.fat_g}g</span>
      </div>
      {preview.notes && <p className="text-xs text-amber-700 mb-3">Note: {preview.notes}</p>}
      <div className="flex gap-2">
        <button
          onClick={onConfirm}
          disabled={confirming}
          className="px-4 py-1.5 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700 disabled:opacity-50"
        >
          {confirming ? "Logging…" : "Confirm & Log"}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-1.5 bg-white text-gray-600 border border-gray-300 rounded-lg text-xs font-semibold hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

export default function AssistantPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [mode, setMode] = useState<"rag" | "agent">("rag");
  const [kbSources, setKbSources] = useState<KbSource[]>([]);
  const [showSources, setShowSources] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<{
    preview: MealLogPreview;
    convId: string;
  } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    assistantSources().then((data: { sources?: KbSource[] } | null) => {
      if (data?.sources) setKbSources(data.sources);
    });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text: string, confirmLog = false) => {
    if (!text.trim() || sending) return;
    setSending(true);

    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    try {
      const response = await assistantChat({
        message: text,
        conversation_id: conversationId,
        mode,
        confirm_log_meal: confirmLog,
      });

      if (!conversationId && response.conversation_id) {
        setConversationId(response.conversation_id);
      }

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: response.assistant_message,
        retrieved_sources: response.retrieved_sources ?? [],
        tool_calls: response.tool_calls ?? [],
        inventory_context: response.inventory_context ?? [],
        meal_log_preview: response.meal_log_preview ?? null,
        requires_confirmation: response.requires_confirmation ?? false,
        grounded: response.grounded ?? false,
        warnings: response.warnings ?? [],
      };
      setMessages((prev) => [...prev, assistantMsg]);

      if (response.requires_confirmation && response.meal_log_preview) {
        setPendingConfirm({
          preview: response.meal_log_preview,
          convId: response.conversation_id,
        });
      }
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Sorry, something went wrong: ${e instanceof Error ? e.message : "unknown error"}`,
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleConfirmLog = async () => {
    if (!pendingConfirm) return;
    setConfirming(true);
    setPendingConfirm(null);
    await sendMessage("Yes, please log this meal.", true);
    setConfirming(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const startNewConversation = () => {
    setMessages([]);
    setConversationId(undefined);
    setPendingConfirm(null);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Nutrition Assistant</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Ask about food safety, nutrition, expiration, and meal planning
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={startNewConversation}
            className="text-xs text-gray-500 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50"
          >
            New Chat
          </button>
          <button
            onClick={() => setShowSources(!showSources)}
            className="text-xs text-indigo-600 border border-indigo-200 px-3 py-1.5 rounded-lg hover:bg-indigo-50"
          >
            {showSources ? "Hide Sources" : `Knowledge Base (${kbSources.length})`}
          </button>
        </div>
      </div>

      {/* Mode toggle */}
      <div className="flex items-center gap-3 bg-white rounded-xl border border-gray-100 px-4 py-3 shadow-sm">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Mode</span>
        <div className="flex rounded-lg overflow-hidden border border-gray-200 text-xs">
          <button
            onClick={() => setMode("rag")}
            className={`px-4 py-1.5 font-medium transition-colors ${
              mode === "rag"
                ? "bg-green-600 text-white"
                : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            Knowledge Q&A
          </button>
          <button
            onClick={() => setMode("agent")}
            className={`px-4 py-1.5 font-medium transition-colors ${
              mode === "agent"
                ? "bg-indigo-600 text-white"
                : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            Agent (checks your fridge)
          </button>
        </div>
        <span className="text-xs text-gray-400">
          {mode === "rag"
            ? "Answers grounded in nutrition knowledge base"
            : "Uses tools to check your inventory, macros, and meal logs"}
        </span>
      </div>

      {/* Knowledge base sources panel */}
      {showSources && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Knowledge Base Sources ({kbSources.length} sources)
          </h3>
          <div className="space-y-2">
            {kbSources.map((s) => {
              const color = TOPIC_COLORS[s.topic] ?? "bg-gray-100 text-gray-600 border-gray-200";
              return (
                <div key={s.source_id} className="flex items-start gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${color}`}>
                    {s.topic.replace(/_/g, " ")}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-800 truncate">{s.title}</p>
                    <p className="text-xs text-gray-500">{s.organization} · {s.chunk_count} chunks</p>
                  </div>
                  {s.url && (
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-indigo-500 hover:text-indigo-700 shrink-0"
                    >
                      ↗
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Chat area */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col" style={{ minHeight: "500px" }}>
        <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ maxHeight: "60vh" }}>
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-64 text-center space-y-4">
              <div className="text-4xl">🥦</div>
              <div>
                <p className="text-gray-700 font-semibold mb-1">Ask me anything about nutrition or food safety</p>
                <p className="text-sm text-gray-400">
                  {mode === "agent"
                    ? "Agent mode checks your actual fridge inventory and today's nutrition logs."
                    : "Knowledge Q&A mode uses curated FDA, USDA, and NIH guidelines."}
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 mt-2">
                {EXAMPLE_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-full px-3 py-1.5 hover:bg-green-100 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] space-y-2 ${msg.role === "user" ? "items-end" : "items-start"} flex flex-col`}>
                {/* Bubble */}
                <div
                  className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-green-600 text-white rounded-br-sm"
                      : "bg-gray-50 border border-gray-100 text-gray-800 rounded-bl-sm"
                  }`}
                >
                  {msg.content}
                </div>

                {/* Tool activity (agent mode) */}
                {msg.role === "assistant" && msg.tool_calls && msg.tool_calls.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {msg.tool_calls.map((call, j) => (
                      <ToolActivityBadge key={j} call={call} />
                    ))}
                  </div>
                )}

                {/* Meal log preview */}
                {msg.role === "assistant" && msg.meal_log_preview && msg.requires_confirmation && pendingConfirm && (
                  <MealLogPreviewCard
                    preview={msg.meal_log_preview}
                    onConfirm={handleConfirmLog}
                    onCancel={() => setPendingConfirm(null)}
                    confirming={confirming}
                  />
                )}

                {/* Inventory context used */}
                {msg.role === "assistant" && msg.inventory_context && msg.inventory_context.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {msg.inventory_context.map((item, j) => (
                      <span
                        key={j}
                        className={`text-xs px-2 py-0.5 rounded-full border bg-white ${
                          RISK_STYLES[item.expiration_risk] ?? "text-gray-500"
                        } border-gray-200`}
                      >
                        {item.name} — {item.expiration_risk}
                      </span>
                    ))}
                  </div>
                )}

                {/* Source citations */}
                {msg.role === "assistant" && msg.retrieved_sources && msg.retrieved_sources.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Sources
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {msg.retrieved_sources.map((src, j) => (
                        <SourceBadge key={j} source={src} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Grounding indicator */}
                {msg.role === "assistant" && (
                  <p className={`text-xs ${msg.grounded ? "text-green-500" : "text-gray-400"}`}>
                    {msg.grounded ? "✓ Grounded in knowledge base or live data" : "General knowledge — no sources retrieved"}
                  </p>
                )}

                {/* Warnings */}
                {msg.role === "assistant" && msg.warnings && msg.warnings.length > 0 && (
                  <div className="space-y-1">
                    {msg.warnings.map((w, j) => (
                      <p key={j} className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                        ⚠ {w}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex justify-start">
              <div className="bg-gray-50 border border-gray-100 rounded-2xl rounded-bl-sm px-4 py-3">
                <span className="text-sm text-gray-400 animate-pulse">Thinking…</span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input area */}
        <div className="border-t border-gray-100 p-4">
          <div className="flex gap-3">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                mode === "agent"
                  ? "Ask me to check your inventory, log a meal, or suggest what to cook…"
                  : "Ask about food safety, expiration, nutrition, or dietary advice…"
              }
              rows={2}
              disabled={sending}
              className="flex-1 text-sm border border-gray-200 rounded-xl px-4 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-green-300 disabled:opacity-50"
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || sending}
              className="px-5 py-2.5 bg-green-600 text-white rounded-xl font-semibold text-sm hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              Send
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2 text-center">
            Educational information only — not medical advice. Consult a healthcare professional for dietary decisions.
          </p>
        </div>
      </div>
    </div>
  );
}
