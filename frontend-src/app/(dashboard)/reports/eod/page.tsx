"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// EOD Report lives inside the Daily Reports page (tab-based).
// Redirect there so both sidebar entries land on the same content.
export default function EodReportRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/reports/daily?tab=eod"); }, [router]);
  return null;
}
