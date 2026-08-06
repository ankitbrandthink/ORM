"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowRight, ArrowLeft, Sparkles } from "lucide-react";

const STEPS = [
  {
    title: "Welcome to ORM CMS 👋",
    body: "This is your Online Reputation Management dashboard. It tracks what people are saying about your brands across social media — in real time.",
    anchor: null,
  },
  {
    title: "Sentiment Cards",
    body: "These four numbers tell you the mood at a glance: % happy comments, % upset, total analysed, and your risk level. Green is good, red needs attention.",
    anchor: "tour-stats",
  },
  {
    title: "Sentiment & Trend Charts",
    body: "The donut shows today's positive/negative split. The line chart shows whether mood is improving or worsening over time. Use Insights for deeper trends.",
    anchor: "tour-charts",
  },
  {
    title: "Reply Queue",
    body: "Every negative or flagged comment becomes a ticket. The Reply Queue shows how many are waiting. Go there to respond and mark them resolved.",
    anchor: "tour-queue",
  },
  {
    title: "AI Assistant 🤖",
    body: "The blue chat button (bottom-right) is your AI assistant. Ask it anything — or use voice commands. It can navigate you to any page automatically.",
    anchor: null,
  },
  {
    title: "You're all set!",
    body: "Start by adding your brand in Clients & Accounts, then import or paste a post link. Charts fill up as comments are analysed. Need help? Hover any ? icon.",
    anchor: null,
  },
];

const STORAGE_KEY = "orm_tour_done";

export function Tour() {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const done = localStorage.getItem(STORAGE_KEY);
    if (!done) setVisible(true);
  }, []);

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem(STORAGE_KEY, "1");
  };

  const next = () => {
    if (step >= STEPS.length - 1) { dismiss(); return; }
    setStep(s => s + 1);
  };

  const prev = () => setStep(s => Math.max(0, s - 1));

  return (
    <AnimatePresence>
      {visible && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-[2px]"
            onClick={dismiss}
          />

          {/* Card */}
          <motion.div
            key={`step-${step}`}
            initial={{ opacity: 0, scale: 0.94, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 10 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            className="fixed left-1/2 top-1/2 z-[61] w-[380px] -translate-x-1/2 -translate-y-1/2
                       rounded-2xl border border-border bg-card shadow-[var(--shadow-lg)] p-6"
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/10">
                  <Sparkles className="h-3.5 w-3.5 text-accent" />
                </div>
                <span className="text-[11px] font-medium text-muted">
                  {step + 1} / {STEPS.length}
                </span>
              </div>
              <button onClick={dismiss} className="text-muted hover:text-fg transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            <h2 className="text-[16px] font-semibold mb-2">{STEPS[step].title}</h2>
            <p className="text-[13px] text-muted leading-relaxed">{STEPS[step].body}</p>

            {/* Progress dots */}
            <div className="flex gap-1.5 mt-5 mb-4">
              {STEPS.map((_, i) => (
                <button key={i} onClick={() => setStep(i)}
                  className={`h-1.5 rounded-full transition-all duration-200 ${
                    i === step ? "w-5 bg-accent" : "w-1.5 bg-border hover:bg-muted"
                  }`}
                />
              ))}
            </div>

            {/* Buttons */}
            <div className="flex items-center justify-between">
              <button onClick={dismiss} className="text-[12px] text-muted hover:text-fg transition-colors">
                Skip tour
              </button>
              <div className="flex gap-2">
                {step > 0 && (
                  <button onClick={prev}
                    className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[13px] font-medium
                               border border-border hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                    <ArrowLeft className="h-3.5 w-3.5" /> Back
                  </button>
                )}
                <button onClick={next}
                  className="flex items-center gap-1.5 rounded-xl bg-accent px-4 py-1.5 text-[13px]
                             font-medium text-white hover:opacity-90 transition-opacity">
                  {step === STEPS.length - 1 ? "Let's go!" : "Next"}
                  {step < STEPS.length - 1 && <ArrowRight className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
