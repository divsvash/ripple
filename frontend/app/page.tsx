"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppShell from "../components/AppShell";
import { ApiError, disconnect, discover, getStatus, SESSION_ERRORS } from "../lib/api";
import { emptyDiscoveryResponse, findLocalNode, mergeDiscoveryResponse, seedDiscoveryResponse } from "../lib/knowledgeGraph";
import type { ConnectionStatus, DiscoveryResponse, DiscoveryStats, ProgressEvent } from "../lib/types";

export default function Home() {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [result, setResult] = useState<DiscoveryResponse>(() => seedDiscoveryResponse());
  const [query, setQuery] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ProgressEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<{ stats: DiscoveryStats; warnings: string[]; message: string | null } | null>(null);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ id: string; token: number } | null>(null);
  const [graphEpoch, setGraphEpoch] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      setStatusError(null);
      const next = await getStatus();
      if (next.session_expired) setSessionNotice("Your session expired. Reconnect to continue.");
      setStatus(next);
    } catch (err) {
      setStatusError(err instanceof ApiError ? err.message : "Could not reach the Ripple server.");
    }
  }, []);

  useEffect(() => { void refreshStatus(); }, [refreshStatus]);
  useEffect(() => () => abortRef.current?.abort(), []);

  async function runLiveSearch(text: string) {
    if (running || !status?.connected || !status.ai.ready) return;
    const event = text.trim();
    if (event.length < 3) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setQuery(event);
    setRunning(true);
    setError(null);
    setProgress([]);
    setLastRun(null);
    try {
      const data = await discover(event, (item) => setProgress((current) => [...current, item]), controller.signal);
      const merged = mergeDiscoveryResponse(result, data);
      setResult(merged);
      setLastRun({ stats: data.stats, warnings: data.warnings, message: data.message ?? null });
      const focus = findLocalNode(merged.graph.nodes, data.event.origin_label) ?? findLocalNode(merged.graph.nodes, event);
      if (focus) setFocusRequest({ id: focus.id, token: Date.now() });
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      const apiError = err instanceof ApiError ? err : new ApiError("Discovery failed.", "unknown", 0, true);
      if (SESSION_ERRORS.has(apiError.code)) {
        setSessionNotice(apiError.message);
        setStatus((current) => current ? { ...current, connected: false } : current);
      } else {
        setError(apiError.message);
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  /** Replaces the whole graph (empty canvas or the sample) and resets the workspace. */
  function replaceGraph(next: DiscoveryResponse) {
    abortRef.current?.abort();
    setResult(next);
    setLastRun(null);
    setProgress([]);
    setError(null);
    setQuery("");
    setFocusRequest(null);
    setGraphEpoch((epoch) => epoch + 1);
  }

  const liveDiscoveryProblem = useMemo(() => {
    if (statusError) return "Live discovery is unavailable because the backend could not be reached.";
    if (!status) return "Checking live discovery availability…";
    if (!status.connected) return sessionNotice ?? "Connect SerpApi to enable live discovery.";
    if (!status.ai.ready) return "Gemini is currently required for live discovery. Local exploration remains available.";
    return null;
  }, [sessionNotice, status, statusError]);

  return (
    <AppShell
      status={status}
      result={result}
      query={query}
      running={running}
      progress={progress}
      lastRun={lastRun}
      graphEpoch={graphEpoch}
      onNewGraph={() => replaceGraph(emptyDiscoveryResponse())}
      onLoadSample={() => replaceGraph(seedDiscoveryResponse())}
      error={error}
      liveDiscoveryProblem={liveDiscoveryProblem}
      focusRequest={focusRequest}
      onLocalFocus={(id, label) => { setQuery(label); setError(null); setFocusRequest({ id, token: Date.now() }); }}
      onLiveSearch={runLiveSearch}
      onCancel={() => abortRef.current?.abort()}
      onStatusChange={(next) => { setStatus(next); setSessionNotice(null); }}
      onDisconnect={async () => {
        try { setStatus(await disconnect()); }
        catch { await refreshStatus(); }
        setSessionNotice(null);
      }}
    />
  );
}
