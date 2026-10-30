"use client";

import { useState, useTransition } from "react";
import { postOne, postQueuedNow, setCategorySocialExcluded, skipPost, testConnection, type ActionResult } from "@/app/admin/social/actions";

function Result({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  return <span className={`text-xs ${result.ok ? "text-green-700" : "text-red-600"}`}>{result.message}</span>;
}

export function PostQueuedButton({ waiting }: { waiting: number }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      <button type="button" className="btn-primary text-xs px-4 py-2" disabled={pending} onClick={() => start(async () => setResult(await postQueuedNow()))}>
        {pending ? "Posting…" : `Post waiting now${waiting ? ` (${waiting})` : ""}`}
      </button>
      <Result result={result} />
    </span>
  );
}

export function TestConnectionButton() {
  const [pending, start] = useTransition();
  const [lines, setLines] = useState<{ ok: boolean; text: string }[] | null>(null);
  return (
    <div className="space-y-2">
      <button
        type="button"
        className="btn-secondary text-xs px-3 py-1.5"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const check = await testConnection();
            if ("error" in check) return setLines([{ ok: false, text: check.error }]);
            const out: { ok: boolean; text: string }[] = [];
            out.push(check.facebook ? { ok: check.facebook.ok, text: `Facebook — ${check.facebook.detail}` } : { ok: false, text: "Facebook — META_PAGE_ID isn't set" });
            out.push(
              check.instagram ? { ok: check.instagram.ok, text: `Instagram — ${check.instagram.detail}` } : { ok: false, text: "Instagram — META_INSTAGRAM_ACCOUNT_ID isn't set" },
            );
            setLines(out);
          })
        }
      >
        {pending ? "Checking…" : "Test connection"}
      </button>
      {lines?.map((l) => (
        <p key={l.text} className={`text-xs ${l.ok ? "text-green-700" : "text-red-600"}`}>
          {l.ok ? "✓" : "✕"} {l.text}
        </p>
      ))}
    </div>
  );
}

export function PostRowActions({ id, status }: { id: string; status: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const canPost = status === "FAILED" || status === "SKIPPED" || status === "PENDING";
  const canSkip = status === "PENDING" || status === "FAILED";
  if (!canPost && !canSkip) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-2 justify-end">
      {canPost && (
        <button type="button" className="text-xs underline disabled:opacity-50" disabled={pending} onClick={() => start(async () => setResult(await postOne(id)))}>
          {pending ? "Posting…" : status === "FAILED" ? "Retry" : "Post now"}
        </button>
      )}
      {canSkip && (
        <button type="button" className="text-xs text-stone-500 underline disabled:opacity-50" disabled={pending} onClick={() => start(async () => setResult(await skipPost(id)))}>
          Skip
        </button>
      )}
      <Result result={result} />
    </span>
  );
}

export function CategorySocialToggle({ id, name, excluded }: { id: string; name: string; excluded: boolean }) {
  const [pending, start] = useTransition();
  const [checked, setChecked] = useState(excluded);
  const [result, setResult] = useState<ActionResult | null>(null);
  return (
    <label className="flex items-center gap-2 text-sm py-1">
      <input
        type="checkbox"
        checked={checked}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          setChecked(next);
          start(async () => {
            const r = await setCategorySocialExcluded(id, next);
            if (!r.ok) setChecked(!next);
            setResult(r.ok ? null : r);
          });
        }}
      />
      <span>{name}</span>
      <Result result={result} />
    </label>
  );
}
