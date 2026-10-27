"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface StageState {
  key: string;
  label: string;
  event: string;
  dueSeconds: number;
  fired: boolean;
  runStatus: string | null;
  runError: string | null;
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
      const settled = (status: string | null) =>
        status === "completed" || status === "failed" || status === "skipped";
      if (payload.stages.every((stage) => stage.fired && settled(stage.runStatus)) && timer.current) {
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

  const doneCount = state.stages.filter((stage) => stage.runStatus === "completed").length;
  return (
    <div>
      <p className="text-sm text-stone-500">
        {doneCount} of {state.stages.length} emails sent. This page checks
        every 10 seconds — keep it open and watch your inbox.
      </p>
      {state.error ? (
        <p className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p>
      ) : null}
      <ol className="mt-4 space-y-0">
        {state.stages.map((stage, index) => {
          const failed = stage.fired && stage.runStatus === "failed";
          const sent = stage.fired && stage.runStatus === "completed";
          return (
            <li key={stage.key} className="relative flex gap-4 pb-6 last:pb-0">
              {index < state.stages.length - 1 ? (
                <span
                  aria-hidden
                  className={`absolute left-[13px] top-7 h-full w-0.5 ${sent ? "bg-[#1a7f37]" : failed ? "bg-red-400" : "bg-stone-200"}`}
                />
              ) : null}
              <span
                aria-hidden
                className={`z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  sent
                    ? "bg-[#1a7f37] text-white"
                    : failed
                      ? "bg-red-600 text-white"
                      : "border border-stone-300 bg-white text-stone-400"
                }`}
              >
                {sent ? "✓" : failed ? "!" : index + 1}
              </span>
              <div className="pt-0.5">
                <p className="font-medium text-stone-900">{stage.label}</p>
                <p className="font-mono text-xs text-stone-500">
                  {stage.event} ·{" "}
                  {sent
                    ? "email sent"
                    : failed
                      ? `failed: ${stage.runError ?? "send failed"}`
                      : stage.fired
                        ? "sending…"
                        : stage.dueSeconds === 0
                          ? "sending…"
                          : `due ~${Math.round(stage.dueSeconds / 60)} min after checkout`}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
