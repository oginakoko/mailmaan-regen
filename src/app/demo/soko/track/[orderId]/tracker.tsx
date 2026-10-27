"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface StageState {
  key: string;
  label: string;
  event: string;
  dueSeconds: number;
  fired: boolean;
}

interface StatusState {
  stages: StageState[];
  error?: string;
}

/** Polls the demo status endpoint; visits drive stage advancement. */
export default function Tracker({ orderId, initial }: { orderId: string; initial: StatusState }) {
  const [state, setState] = useState<StatusState>(initial);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/demo/soko/status?order=${encodeURIComponent(orderId)}`, {
        cache: "no-store",
      });
      if (!response.ok) return;
      const payload = (await response.json()) as StatusState;
      setState(payload);
      if (payload.stages.every((stage) => stage.fired) && timer.current) {
        clearInterval(timer.current);
        timer.current = null;
      }
    } catch {
      // Keep the last known state; the next poll retries.
    }
  }, [orderId]);

  useEffect(() => {
    timer.current = setInterval(() => void refresh(), 10_000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [refresh]);

  const doneCount = state.stages.filter((stage) => stage.fired).length;
  return (
    <div>
      <p className="text-sm text-stone-500">
        {doneCount} of {state.stages.length} stages emailed. This page checks
        every 10 seconds — keep it open and watch your inbox.
      </p>
      {state.error ? (
        <p className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p>
      ) : null}
      <ol className="mt-4 space-y-0">
        {state.stages.map((stage, index) => (
          <li key={stage.key} className="relative flex gap-4 pb-6 last:pb-0">
            {index < state.stages.length - 1 ? (
              <span
                aria-hidden
                className={`absolute left-[13px] top-7 h-full w-0.5 ${stage.fired ? "bg-[#1a7f37]" : "bg-stone-200"}`}
              />
            ) : null}
            <span
              aria-hidden
              className={`z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                stage.fired ? "bg-[#1a7f37] text-white" : "border border-stone-300 bg-white text-stone-400"
              }`}
            >
              {stage.fired ? "✓" : index + 1}
            </span>
            <div className="pt-0.5">
              <p className="font-medium text-stone-900">{stage.label}</p>
              <p className="font-mono text-xs text-stone-500">
                {stage.event} · {stage.fired ? "email sent" : stage.dueSeconds === 0 ? "sending…" : `due ~${Math.round(stage.dueSeconds / 60)} min after checkout`}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
