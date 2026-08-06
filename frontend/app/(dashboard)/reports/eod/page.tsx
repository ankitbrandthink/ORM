"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function EodReportRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/reports/daily?tab=eod"); }, [router]);
  return null;
}
