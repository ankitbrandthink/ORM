"use client";
import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, HTMLAttributes } from "react";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("card", className)} {...props} />;
}

export function Button({ className, variant = "primary", size, ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost"; size?: "sm" | "md" }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200",
        variant === "primary" && "bg-accent text-white hover:opacity-90",
        variant === "ghost" && "hover:bg-black/5 dark:hover:bg-white/10",
        className
      )}
      {...props}
    />
  );
}

export function Badge({ className = "", ...props }: HTMLAttributes<HTMLSpanElement>) {
  // Flat style: plain colored text, no pill background/border (keeps the text-color classes).
  const noBg = String(className)
    .split(" ")
    .filter((c) => !c.startsWith("bg-") && !c.startsWith("ring-") && !c.startsWith("border-"))
    .join(" ");
  return (
    <span className={cn("inline-flex items-center text-xs font-medium", noBg)} {...props} />
  );
}
