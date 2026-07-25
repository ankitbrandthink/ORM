"use client";
import { useState, useEffect } from "react";
import { AlertCircle, CheckCircle2, Zap } from "lucide-react";
import { api } from "@/lib/api";

interface CommentAnalysisProgressProps {
  postId: string;
  totalComments: number;
  onComplete?: (results: any) => void;
}

export function CommentAnalysisProgress({
  postId,
  totalComments,
  onComplete,
}: CommentAnalysisProgressProps) {
  const [progress, setProgress] = useState(0);
  const [analyzed, setAnalyzed] = useState(0);
  const [status, setStatus] = useState<"analyzing" | "complete" | "error">(
    "analyzing"
  );
  const [message, setMessage] = useState(
    `Analyzing ${totalComments} comments with free LLM…`
  );

  useEffect(() => {
    if (status !== "analyzing") return;

    const interval = setInterval(async () => {
      try {
        const res = await api.get(`/sentiment/progress/${postId}`);
        const { done, total, percent } = res.data;
        setAnalyzed(done);
        setProgress(percent);

        if (percent >= 100 || done >= total) {
          setStatus("complete");
          setMessage(
            `✓ Analysis complete — ${total} comments processed (local LLM)`
          );
          if (onComplete) onComplete({ done, total, percent: 100 });
        }
      } catch (e) {
        setStatus("error");
        setMessage("Analysis failed — check Ollama is running");
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [status, postId, onComplete]);

  const colors = {
    analyzing: "bg-blue-500",
    complete: "bg-green-500",
    error: "bg-red-500",
  };

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        {status === "analyzing" && (
          <Zap className="h-4 w-4 animate-spin text-blue-500" />
        )}
        {status === "complete" && <CheckCircle2 className="h-4 w-4 text-green-500" />}
        {status === "error" && <AlertCircle className="h-4 w-4 text-red-500" />}
        <span className="text-sm font-medium">{message}</span>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted">
          <span>{analyzed} analyzed</span>
          <span>{progress}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full transition-all duration-300 ${colors[status]}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {status === "error" && (
        <div className="text-[11px] text-red-600">
          Tip: Run <code>ollama serve</code> in terminal, then restart analysis.
        </div>
      )}
    </div>
  );
}
