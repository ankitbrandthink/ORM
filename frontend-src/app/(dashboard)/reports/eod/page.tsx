"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// EOD Report has moved to Seeding Report (sheet-linked deployment tracker).
export default function EodReportRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/reports/seeding"); }, [router]);
  return null;
}
