"use client";

import { useState } from "react";

interface TokenResult {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

/**
 * One-time AliExpress OAuth setup, done by clicking through this page
 * instead of hand-building curl commands — the browser session already
 * carries the /admin Basic Auth credentials, and ALIEXPRESS_APP_KEY/
 * ALIEXPRESS_APP_SECRET never have to leave Vercel's own env vars (this
 * page just calls /api/admin/aliexpress/auth, which reads them server-side).
 */
export default function AliExpressAuthPage() {
  const [redirectUri, setRedirectUri] = useState("");
  const [code, setCode] = useState("");
  const [authorizeUrl, setAuthorizeUrl] = useState<string | null>(null);
  const [tokens, setTokens] = useState<TokenResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"url" | "exchange" | null>(null);

  async function getAuthorizeUrl() {
    setError(null);
    setAuthorizeUrl(null);
    if (!redirectUri) {
      setError("Enter the redirect/callback URI first.");
      return;
    }
    setBusy("url");
    try {
      const res = await fetch(`/api/admin/aliexpress/auth?redirectUri=${encodeURIComponent(redirectUri)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not build authorize URL");
      setAuthorizeUrl(data.authorizeUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build authorize URL");
    } finally {
      setBusy(null);
    }
  }

  async function exchangeCode() {
    setError(null);
    setTokens(null);
    if (!redirectUri || !code) {
      setError("Enter both the redirect/callback URI and the code from the redirect.");
      return;
    }
    setBusy("exchange");
    try {
      const res = await fetch("/api/admin/aliexpress/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, redirectUri }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Token exchange failed");
      setTokens(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Token exchange failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="max-w-2xl">
      <p className="eyebrow mb-2">AliExpress</p>
      <h1 className="font-serif text-3xl mb-2">Connect AliExpress account</h1>
      <p className="text-sm text-stone-600 mb-8">
        One-time OAuth setup to get <code>ALIEXPRESS_ACCESS_TOKEN</code>/<code>ALIEXPRESS_REFRESH_TOKEN</code>. Uses
        this deployment&rsquo;s own <code>ALIEXPRESS_APP_KEY</code>/<code>ALIEXPRESS_APP_SECRET</code> env vars — they
        never leave the server.
      </p>

      <div className="card p-6 mb-6">
        <label className="block text-sm mb-2" htmlFor="redirectUri">
          Redirect / callback URI
        </label>
        <input
          id="redirectUri"
          type="text"
          value={redirectUri}
          onChange={(e) => setRedirectUri(e.target.value)}
          placeholder="https://www.webese.ai/api/callback"
          className="w-full border border-stone-300 px-3 py-2 text-sm mb-4"
        />

        <div className="mb-2 text-sm font-medium">Step 1 — get the authorize link</div>
        <button className="btn-secondary mb-4" onClick={getAuthorizeUrl} disabled={busy !== null}>
          {busy === "url" ? "Loading…" : "Get authorize link"}
        </button>
        {authorizeUrl && (
          <p className="text-sm mb-4">
            Visit this link, log into the AliExpress account being connected, and approve access. You&rsquo;ll be
            redirected back to your callback URI with a <code>?code=...</code> in the address bar — copy that code
            below.
            <br />
            <a href={authorizeUrl} target="_blank" rel="noreferrer" className="underline break-all">
              {authorizeUrl}
            </a>
          </p>
        )}

        <div className="mb-2 mt-6 text-sm font-medium">Step 2 — exchange the code for tokens</div>
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Code from the redirect URL"
          className="w-full border border-stone-300 px-3 py-2 text-sm mb-4"
        />
        <button className="btn-primary" onClick={exchangeCode} disabled={busy !== null}>
          {busy === "exchange" ? "Exchanging…" : "Exchange code for tokens"}
        </button>
      </div>

      {error && <p className="text-sm text-red-600 mb-6">{error}</p>}

      {tokens && (
        <div className="card p-6">
          <p className="text-sm font-medium mb-3">
            Success — add these to your environment variables, then redeploy:
          </p>
          <pre className="bg-ink-950 text-warm-50 text-xs p-4 overflow-x-auto whitespace-pre-wrap break-all">
            {`ALIEXPRESS_ACCESS_TOKEN=${tokens.accessToken}\nALIEXPRESS_REFRESH_TOKEN=${tokens.refreshToken}`}
          </pre>
          {tokens.expiresAt > 0 && (
            <p className="text-xs text-stone-500 mt-3">
              Access token expires {new Date(tokens.expiresAt).toISOString()} — the refresh token keeps it renewed
              automatically after that, no need to repeat this.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
