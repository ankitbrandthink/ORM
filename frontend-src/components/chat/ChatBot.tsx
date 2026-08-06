"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle, X, Send, Mic, MicOff, Volume2, VolumeX,
  Loader2, Bot, Sparkles,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Msg {
  role: "user" | "assistant";
  text: string;
  navigate?: string;
}

const SUGGESTIONS = [
  "What's the sentiment today?",
  "Show me open tickets",
  "How do I import data?",
  "Explain the crisis score",
];

export function ChatBot() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([{
    role: "assistant",
    text: "Hi! I'm your ORM assistant. Ask me anything about the dashboard — or use your voice 🎤",
  }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [muted, setMuted] = useState(false);
  const [ollamaOnline, setOllamaOnline] = useState<boolean | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Check Ollama status on open
  useEffect(() => {
    if (!open) return;
    api.get("/chat/status").then(r => setOllamaOnline(r.data.online)).catch(() => setOllamaOnline(false));
    inputRef.current?.focus();
  }, [open]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  const speak = useCallback((text: string) => {
    if (muted || typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 1.05;
    utt.pitch = 1;
    utt.volume = 0.9;
    synthRef.current = utt;
    window.speechSynthesis.speak(utt);
  }, [muted]);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Msg = { role: "user", text: text.trim() };
    setMsgs(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const history = msgs.slice(-6).map(m => ({ role: m.role, content: m.text }));
      const r = await api.post("/chat/", { message: text.trim(), history });
      const { reply, navigate } = r.data;
      const botMsg: Msg = { role: "assistant", text: reply, navigate };
      setMsgs(prev => [...prev, botMsg]);
      speak(reply);
      if (navigate) {
        setTimeout(() => {
          router.push(navigate);
          setOpen(false);
        }, 1200);
      }
    } catch {
      const errMsg: Msg = { role: "assistant", text: "Sorry, I couldn't reach the server. Check that the backend is running." };
      setMsgs(prev => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  }, [loading, msgs, router, speak]);

  const startVoice = useCallback(() => {
    if (typeof window === "undefined") return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert("Voice input not supported in this browser. Use Chrome."); return; }

    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = "en-US";
    rec.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      setInput(transcript);
      setListening(false);
      send(transcript);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  }, [send]);

  const stopVoice = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  return (
    <>
      {/* Floating trigger */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setOpen(o => !o)}
        className={cn(
          "fixed bottom-6 right-6 z-50 flex h-13 w-13 items-center justify-center rounded-full shadow-lg",
          "bg-accent text-white transition-all duration-200",
          open && "rotate-0"
        )}
        style={{ height: 52, width: 52 }}
        title="AI Assistant"
        aria-label="Open AI assistant"
      >
        <AnimatePresence mode="wait" initial={false}>
          {open
            ? <motion.span key="x" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}><X className="h-5 w-5" /></motion.span>
            : <motion.span key="chat" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.15 }}><MessageCircle className="h-5 w-5" /></motion.span>
          }
        </AnimatePresence>
      </motion.button>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            className="fixed bottom-[72px] right-6 z-50 flex w-[360px] flex-col rounded-2xl border border-border bg-card shadow-[var(--shadow-lg)] overflow-hidden"
            style={{ height: 500 }}
          >
            {/* Header */}
            <div className="flex items-center gap-2.5 border-b border-border px-4 py-3 bg-card">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10">
                <Bot className="h-4 w-4 text-accent" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold leading-tight">ORM Assistant</p>
                <p className="text-[11px] text-muted leading-tight flex items-center gap-1">
                  {ollamaOnline === null ? "Checking..." : ollamaOnline
                    ? <><span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block" /> Ollama online</>
                    : <><span className="h-1.5 w-1.5 rounded-full bg-orange-400 inline-block" /> Keyword mode</>
                  }
                </p>
              </div>
              <button onClick={() => setMuted(m => !m)} title={muted ? "Unmute voice" : "Mute voice"}
                className="text-muted hover:text-fg transition-colors">
                {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {msgs.map((m, i) => (
                <div key={i} className={cn("flex gap-2 bubble-in", m.role === "user" ? "justify-end" : "justify-start")}>
                  {m.role === "assistant" && (
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10">
                      <Sparkles className="h-3 w-3 text-accent" />
                    </div>
                  )}
                  <div className={cn(
                    "max-w-[80%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-snug",
                    m.role === "user"
                      ? "bg-accent text-white rounded-br-sm"
                      : "bg-black/5 dark:bg-white/8 text-fg rounded-bl-sm"
                  )}>
                    {m.text}
                    {m.navigate && (
                      <p className="mt-1 text-[11px] opacity-70">
                        ↗ Taking you there...
                      </p>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex items-center gap-2 bubble-in">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/10">
                    <Sparkles className="h-3 w-3 text-accent" />
                  </div>
                  <div className="flex gap-1 rounded-2xl bg-black/5 dark:bg-white/8 px-3.5 py-2.5">
                    {[0,1,2].map(d => (
                      <span key={d} className="h-1.5 w-1.5 rounded-full bg-muted animate-bounce"
                        style={{ animationDelay: `${d * 0.15}s` }} />
                    ))}
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Suggestion chips (only when no user messages) */}
            {msgs.length === 1 && (
              <div className="px-4 pb-2 flex flex-wrap gap-1.5">
                {SUGGESTIONS.map(s => (
                  <button key={s} onClick={() => send(s)}
                    className="rounded-full border border-border bg-card px-3 py-1 text-[11px] text-muted
                               hover:border-accent hover:text-accent transition-colors">
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div className="border-t border-border px-3 py-3 flex items-center gap-2">
              <button
                onClick={listening ? stopVoice : startVoice}
                title={listening ? "Stop listening" : "Voice input"}
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all",
                  listening
                    ? "bg-red-500 text-white recording"
                    : "text-muted hover:text-accent hover:bg-accent/10"
                )}
              >
                {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && send(input)}
                placeholder={listening ? "Listening..." : "Ask anything…"}
                disabled={listening}
                className="flex-1 rounded-xl border border-border bg-bg px-3 py-2 text-[13px]
                           placeholder:text-muted/60 focus:outline-none focus:border-accent transition-colors"
              />
              <button
                onClick={() => send(input)}
                disabled={!input.trim() || loading}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-white
                           disabled:opacity-40 hover:opacity-90 transition-opacity"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
