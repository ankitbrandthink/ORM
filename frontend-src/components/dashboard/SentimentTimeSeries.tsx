"use client";
import { Card } from "@/components/ui/primitives";
import { VolumeChart } from "./VolumeChart";

interface Point { date: string; Positive: number; Negative: number; Neutral: number }

export function SentimentTimeSeries({ data, title = "Sentiment trend over time" }: { data: Point[]; title?: string }) {
  if (!data.length) return null;
  return (
    <Card>
      <VolumeChart data={data} title={title} height={220} showLegend={true} />
    </Card>
  );
}
