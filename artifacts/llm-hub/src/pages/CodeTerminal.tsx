import { useState, useEffect, useRef, useCallback } from "react";
import {
  Terminal, Send, Loader2, Code2, Play, Square, Trash2, Copy, Check,
  FolderOpen, FileCode, ChevronRight, Bot, User, RefreshCw, Settings,
  Maximize2, Minimize2, ArrowUp, ArrowDown, PanelLeftClose, PanelLeft
} from "lucide-react";

const API = import.meta.env.BASE_URL ? import.meta.env.BASE_URL.replace(/\/$/, "") : "";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

interface TerminalLine {
  id: string;
  type: "input" | "output" | "error" | "system";
  content: string;
  timestamp: number;
}

export default function CodeTerminal() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([
    { id: "welcome", type: "system", content: "LLM Hub Code Terminal — Connected to self-hosted Ollama", timestamp: Date.now() },
    { id: "ready", type: "system", content: "Type commands below or chat with your AI coding assistant on the left.", timestamp: Date.now() },
  ]);
  const [terminalInput, setTerminalInput] = useState("");
  const [terminalRunning, setTerminalRunning] = useState(false);
  const [model, setModel] = useState("deepseek-coder:6.7b");
  const [models, setModels] = useState<string[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState(
    "You are an expert software engineer and coding assistant. You help users write, debug, and improve code. When asked to run commands, provide the exact terminal commands. When writing code, always include the full file path. Be concise and precise. If you write code blocks, specify the language."
  );
  const [terminalHistory, setTerminalHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [panelSplit, setPanelSplit] = useState<"both" | "chat" | "terminal">("both");
  const [temperature, setTemperature] = useState(0.3);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const terminalInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetch(`${API}/api/llm/models`).then(r => r.json()).then(d => {
      const names = (d.models || []).map((m: any) => m.name || m.id);
      setModels(names);
      const codeModel = names.find((n: string) => n.includes("deepseek-coder") || n.includes("codellama"));
      if (codeModel) setModel(codeModel);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [terminalLines]);

  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const sendMessage = async () => {
    if (!input.trim() || streaming) return;
    const userMsg: Message = { id: `u-${Date.now()}`, role: "user", content: input.trim(), timestamp: Date.now() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");

    const assistantMsg: Message = { id: `a-${Date.now()}`, role: "assistant", content: "", timestamp: Date.now() };
    setMessages([...newMessages, assistantMsg]);
    setStreaming(true);

    const abortController = new AbortController();
    abortRef.current = abortController;

    try {
      const chatMessages = [
        { role: "system", content: systemPrompt },
        ...newMessages.map(m => ({ role: m.role, content: m.content })),
      ];

      const res = await fetch(`${API}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: chatMessages, stream: true, temperature }),
        signal: abortController.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No reader");

      const decoder = new TextDecoder();
      let buffer = "";
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed.message?.content) {
              fullContent += parsed.message.content;
              setMessages(prev => prev.map(m =>
                m.id === assistantMsg.id ? { ...m, content: fullContent } : m
              ));
            }
          } catch {}
        }
      }

      if (buffer.trim()) {
        try {
          const parsed = JSON.parse(buffer);
          if (parsed.message?.content) {
            fullContent += parsed.message.content;
            setMessages(prev => prev.map(m =>
              m.id === assistantMsg.id ? { ...m, content: fullContent } : m
            ));
          }
        } catch {}
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setMessages(prev => prev.map(m =>
          m.id === assistantMsg.id ? { ...m, content: `Error: ${err.message}` } : m
        ));
      }
    }

    setStreaming(false);
    abortRef.current = null;
  };

  const stopStreaming = () => {
    abortRef.current?.abort();
    setStreaming(false);
  };

  const runCommand = async () => {
    if (!terminalInput.trim() || terminalRunning) return;
    const cmd = terminalInput.trim();
    setTerminalHistory(prev => [...prev, cmd]);
    setHistoryIndex(-1);
    setTerminalInput("");

    setTerminalLines(prev => [...prev, {
      id: `in-${Date.now()}`, type: "input", content: cmd, timestamp: Date.now()
    }]);

    setTerminalRunning(true);

    try {
      const res = await fetch(`${API}/api/code-terminal/exec`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd }),
      });
      const data = await res.json();

      if (data.stdout) {
        setTerminalLines(prev => [...prev, {
          id: `out-${Date.now()}`, type: "output", content: data.stdout, timestamp: Date.now()
        }]);
      }
      if (data.stderr) {
        setTerminalLines(prev => [...prev, {
          id: `err-${Date.now()}`, type: "error", content: data.stderr, timestamp: Date.now()
        }]);
      }
      if (data.error) {
        setTerminalLines(prev => [...prev, {
          id: `err-${Date.now()}`, type: "error", content: data.error, timestamp: Date.now()
        }]);
      }
    } catch (err: any) {
      setTerminalLines(prev => [...prev, {
        id: `err-${Date.now()}`, type: "error", content: err.message, timestamp: Date.now()
      }]);
    }

    setTerminalRunning(false);
  };

  const handleTerminalKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      runCommand();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (terminalHistory.length > 0) {
        const newIndex = historyIndex === -1 ? terminalHistory.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        setTerminalInput(terminalHistory[newIndex]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex >= 0) {
        const newIndex = historyIndex + 1;
        if (newIndex >= terminalHistory.length) {
          setHistoryIndex(-1);
          setTerminalInput("");
        } else {
          setHistoryIndex(newIndex);
          setTerminalInput(terminalHistory[newIndex]);
        }
      }
    }
  };

  const handleChatKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  const clearTerminal = () => {
    setTerminalLines([{
      id: `clear-${Date.now()}`, type: "system", content: "Terminal cleared.", timestamp: Date.now()
    }]);
  };

  const extractCodeBlocks = (content: string): { lang: string; code: string }[] => {
    const blocks: { lang: string; code: string }[] = [];
    const regex = /```(\w*)\n([\s\S]*?)```/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      blocks.push({ lang: match[1] || "text", code: match[2].trim() });
    }
    return blocks;
  };

  const renderMessageContent = (content: string, msgId: string) => {
    const parts = content.split(/(```\w*\n[\s\S]*?```)/g);
    return parts.map((part, i) => {
      const codeMatch = part.match(/```(\w*)\n([\s\S]*?)```/);
      if (codeMatch) {
        const lang = codeMatch[1] || "text";
        const code = codeMatch[2].trim();
        const blockId = `${msgId}-code-${i}`;
        return (
          <div key={i} className="my-2 rounded-lg overflow-hidden border border-white/10">
            <div className="flex items-center justify-between px-3 py-1.5 bg-white/[0.03] border-b border-white/10">
              <span className="text-[10px] text-muted-foreground font-mono">{lang}</span>
              <div className="flex items-center gap-1">
                <button onClick={() => { setTerminalInput(code); terminalInputRef.current?.focus(); }}
                  className="p-1 rounded hover:bg-white/10 transition-all" title="Send to terminal">
                  <Play className="w-3 h-3 text-emerald-400" />
                </button>
                <button onClick={() => copyText(code, blockId)}
                  className="p-1 rounded hover:bg-white/10 transition-all" title="Copy">
                  {copiedId === blockId ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
                </button>
              </div>
            </div>
            <pre className="p-3 text-xs font-mono text-gray-300 overflow-x-auto bg-black/40 whitespace-pre">{code}</pre>
          </div>
        );
      }
      return part ? <span key={i} className="whitespace-pre-wrap">{part}</span> : null;
    });
  };

  const showChat = panelSplit !== "terminal";
  const showTerminal = panelSplit !== "chat";

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-black/20 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center">
            <Code2 className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white">Code Terminal</h1>
            <p className="text-[10px] text-muted-foreground">AI coding assistant + integrated terminal</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={model}
            onChange={e => setModel(e.target.value)}
            className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-xs text-white focus:outline-none focus:border-emerald-500/50"
          >
            {models.length === 0 && <option value={model}>{model}</option>}
            {models.map(m => <option key={m} value={m}>{m}</option>)}
          </select>

          <button onClick={() => setShowSettings(!showSettings)}
            className={`p-1.5 rounded-lg transition-all ${showSettings ? "bg-white/10 text-white" : "hover:bg-white/5 text-muted-foreground hover:text-white"}`}>
            <Settings className="w-3.5 h-3.5" />
          </button>

          <div className="flex items-center border border-white/10 rounded-lg overflow-hidden">
            <button onClick={() => setPanelSplit("both")}
              className={`p-1.5 transition-all ${panelSplit === "both" ? "bg-white/10 text-white" : "hover:bg-white/5 text-muted-foreground"}`}
              title="Split view">
              <PanelLeft className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setPanelSplit("chat")}
              className={`p-1.5 transition-all ${panelSplit === "chat" ? "bg-white/10 text-white" : "hover:bg-white/5 text-muted-foreground"}`}
              title="Chat only">
              <Bot className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setPanelSplit("terminal")}
              className={`p-1.5 transition-all ${panelSplit === "terminal" ? "bg-white/10 text-white" : "hover:bg-white/5 text-muted-foreground"}`}
              title="Terminal only">
              <Terminal className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {showSettings && (
        <div className="px-4 py-3 border-b border-white/5 bg-black/20 space-y-2 flex-shrink-0">
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">System Prompt</label>
            <textarea
              value={systemPrompt}
              onChange={e => setSystemPrompt(e.target.value)}
              rows={2}
              className="w-full mt-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white resize-none focus:outline-none focus:border-emerald-500/50"
            />
          </div>
          <div className="flex items-center gap-4">
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Temperature</label>
              <input type="number" value={temperature} onChange={e => setTemperature(Number(e.target.value))}
                min={0} max={2} step={0.1}
                className="ml-2 w-16 px-2 py-1 rounded bg-white/5 border border-white/10 text-xs text-white focus:outline-none" />
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {showChat && (
          <div className={`flex flex-col ${showTerminal ? "w-1/2 border-r border-white/5" : "w-full"}`}>
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/5 bg-black/10 flex-shrink-0">
              <span className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
                <Bot className="w-3 h-3" /> AI Chat — {model}
              </span>
              <button onClick={clearChat} className="p-1 rounded hover:bg-white/5 text-muted-foreground hover:text-white transition-all" title="Clear chat">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {messages.length === 0 && (
                <div className="flex-1 flex items-center justify-center h-full">
                  <div className="text-center space-y-2">
                    <Code2 className="w-10 h-10 text-muted-foreground/30 mx-auto" />
                    <p className="text-xs text-muted-foreground">Ask me to write code, debug issues, or explain concepts.</p>
                    <div className="flex flex-wrap gap-1.5 justify-center max-w-md">
                      {[
                        "Write a Python Flask API with CRUD endpoints",
                        "Debug this error: TypeError undefined",
                        "Create a React component with Tailwind",
                        "Explain async/await in JavaScript",
                      ].map((s, i) => (
                        <button key={i} onClick={() => setInput(s)}
                          className="px-2 py-1 rounded-lg bg-white/[0.03] border border-white/5 text-[10px] text-muted-foreground hover:text-white hover:bg-white/5 transition-all">
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {messages.map(msg => (
                <div key={msg.id} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : ""}`}>
                  {msg.role === "assistant" && (
                    <div className="w-6 h-6 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Bot className="w-3.5 h-3.5 text-emerald-400" />
                    </div>
                  )}
                  <div className={`rounded-xl px-3 py-2 text-xs max-w-[85%] ${
                    msg.role === "user"
                      ? "bg-primary/20 text-white border border-primary/20"
                      : "bg-white/[0.03] text-gray-300 border border-white/5"
                  }`}>
                    {msg.role === "assistant" ? renderMessageContent(msg.content, msg.id) : (
                      <span className="whitespace-pre-wrap">{msg.content}</span>
                    )}
                    {streaming && msg.role === "assistant" && msg === messages[messages.length - 1] && (
                      <span className="inline-block w-1.5 h-3.5 bg-emerald-400 animate-pulse ml-0.5" />
                    )}
                  </div>
                  {msg.role === "user" && (
                    <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <User className="w-3.5 h-3.5 text-primary" />
                    </div>
                  )}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            <div className="p-3 border-t border-white/5 flex-shrink-0">
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleChatKeyDown}
                  placeholder="Ask about code, debugging, architecture..."
                  rows={2}
                  className="flex-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:border-emerald-500/50"
                />
                {streaming ? (
                  <button onClick={stopStreaming}
                    className="p-2.5 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 transition-all">
                    <Square className="w-4 h-4" />
                  </button>
                ) : (
                  <button onClick={sendMessage} disabled={!input.trim()}
                    className="p-2.5 rounded-xl bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-600/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                    <Send className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {showTerminal && (
          <div className={`flex flex-col ${showChat ? "w-1/2" : "w-full"} bg-black/40`}>
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/5 bg-black/20 flex-shrink-0">
              <span className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
                <Terminal className="w-3 h-3 text-emerald-400" /> Terminal
              </span>
              <button onClick={clearTerminal} className="p-1 rounded hover:bg-white/5 text-muted-foreground hover:text-white transition-all" title="Clear terminal">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 font-mono text-xs space-y-1">
              {terminalLines.map(line => (
                <div key={line.id} className={`${
                  line.type === "input" ? "text-cyan-300" :
                  line.type === "error" ? "text-red-400" :
                  line.type === "system" ? "text-muted-foreground italic" :
                  "text-gray-300"
                }`}>
                  {line.type === "input" && <span className="text-emerald-400 mr-1">$</span>}
                  <span className="whitespace-pre-wrap">{line.content}</span>
                </div>
              ))}
              {terminalRunning && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" /> Running...
                </div>
              )}
              <div ref={terminalEndRef} />
            </div>

            <div className="px-3 py-2 border-t border-white/5 flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-emerald-400 text-xs font-mono">$</span>
                <input
                  ref={terminalInputRef}
                  value={terminalInput}
                  onChange={e => setTerminalInput(e.target.value)}
                  onKeyDown={handleTerminalKeyDown}
                  placeholder="Enter command..."
                  disabled={terminalRunning}
                  className="flex-1 bg-transparent text-xs text-white font-mono placeholder:text-muted-foreground/30 focus:outline-none disabled:opacity-50"
                />
                <button onClick={runCommand} disabled={terminalRunning || !terminalInput.trim()}
                  className="p-1.5 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-emerald-400 disabled:opacity-30 transition-all">
                  <Play className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}