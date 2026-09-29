"use client";

import { useEffect, useRef, useState } from "react";
import {
  CRITERIA,
  GherkinScenario,
  Requirement,
  requirementScore,
  scoreLevel
} from "@/lib/requirements";
import {
  HistoryEntry,
  addHistoryEntry,
  clearHistory,
  formatHistoryDate,
  loadHistory,
  removeHistoryEntry
} from "@/lib/history";

type Status =
  | { state: "idle" }
  | { state: "busy"; label: string }
  | { state: "ok"; label: string }
  | { state: "error"; label: string };

export default function Home() {
  const [sourceText, setSourceText] = useState("");
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const [exporting, setExporting] = useState<"docx" | "pdf" | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [lastReformulatedText, setLastReformulatedText] = useState<string | null>(
    null
  );
  const [rateLimitRemaining, setRateLimitRemaining] = useState<number | null>(
    null
  );
  const [rateLimitTotal, setRateLimitTotal] = useState<number | null>(null);
  const [expandedGherkin, setExpandedGherkin] = useState<Set<number>>(new Set());

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const isUnchangedSinceLastReformulation =
    lastReformulatedText !== null &&
    sourceText.trim() === lastReformulatedText.trim();
  const canReformulate =
    sourceText.trim().length > 0 &&
    status.state !== "busy" &&
    !isUnchangedSinceLastReformulation;
  const canExport = requirements.length > 0 && exporting === null;
  const totalCriteria = CRITERIA.length;

  const fullyConformCount = requirements.filter(
    (r) => requirementScore(r) === totalCriteria
  ).length;
  const toReviewCount = requirements.length - fullyConformCount;

  async function handleImportClick() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setStatus({ state: "busy", label: `Import de « ${file.name} »…` });
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/import", { method: "POST", body: formData });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Échec de l'import du document.");
      }
      const data = await res.json();
      setSourceText(data.text || "");
      setStatus({ state: "ok", label: `Document « ${file.name} » importé.` });
    } catch (err: any) {
      setStatus({ state: "error", label: err.message || "Échec de l'import." });
    }
  }

  async function handleReformulate() {
    if (!canReformulate) return;
    setStatus({ state: "busy", label: "Reformulation en cours…" });
    try {
      const res = await fetch("/api/reformulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: sourceText })
      });

      const remainingHeader = res.headers.get("X-RateLimit-Remaining");
      const limitHeader = res.headers.get("X-RateLimit-Limit");
      if (remainingHeader !== null) setRateLimitRemaining(Number(remainingHeader));
      if (limitHeader !== null) setRateLimitTotal(Number(limitHeader));

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Échec de la reformulation.");
      }
      const data = await res.json();
      const newRequirements = data.requirements || [];
      setRequirements(newRequirements);
      setExpandedGherkin(new Set());
      setHistory((prev) => addHistoryEntry(prev, sourceText, newRequirements));
      setLastReformulatedText(sourceText);
      setStatus({ state: "ok", label: "Reformulation terminée." });
    } catch (err: any) {
      setStatus({ state: "error", label: err.message || "Échec de la reformulation." });
    }
  }

  function updateRequirementText(index: number, text: string) {
    setRequirements((prev) =>
      prev.map((r, i) => (i === index ? { ...r, text } : r))
    );
  }

  function deleteRequirement(index: number) {
    setRequirements((prev) => prev.filter((_, i) => i !== index));
  }

  function toggleGherkin(index: number) {
    setExpandedGherkin((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  function updateScenarioField(
    reqIndex: number,
    scenarioIndex: number,
    field: keyof GherkinScenario,
    value: string
  ) {
    setRequirements((prev) =>
      prev.map((r, i) => {
        if (i !== reqIndex) return r;
        const acceptanceCriteria = r.acceptanceCriteria.map((sc, si) =>
          si === scenarioIndex ? { ...sc, [field]: value } : sc
        );
        return { ...r, acceptanceCriteria };
      })
    );
  }

  function loadHistoryEntry(entry: HistoryEntry) {
    setSourceText(entry.sourceText);
    setRequirements(entry.requirements);
    setExpandedGherkin(new Set());
    setLastReformulatedText(entry.sourceText);
    setHistoryOpen(false);
    setStatus({
      state: "ok",
      label: `Reformulation du ${formatHistoryDate(entry.timestamp)} chargée.`
    });
  }

  function handleDeleteHistoryEntry(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setHistory((prev) => removeHistoryEntry(prev, id));
  }

  function handleClearHistory() {
    setHistory(clearHistory());
  }

  async function handleExport(format: "docx" | "pdf") {
    if (!canExport) return;
    setExporting(format);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requirements, format })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Échec de l'export.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `besoins-reformules.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatus({ state: "ok", label: `Export .${format} téléchargé.` });
    } catch (err: any) {
      setStatus({ state: "error", label: err.message || "Échec de l'export." });
    } finally {
      setExporting(null);
    }
  }

  const dotClass =
    status.state === "busy"
      ? "busy"
      : status.state === "ok"
      ? "ok"
      : status.state === "error"
      ? "error"
      : "";

  return (
    <main className="page">
      <header className="masthead">
        <div className="masthead-row">
          <h1 className="masthead-title">Assistant PO</h1>
          <button
            className="btn btn-ghost history-toggle"
            onClick={() => setHistoryOpen(true)}
          >
            Historique
            {history.length > 0 && (
              <span className="history-count">{history.length}</span>
            )}
          </button>
        </div>
        <div className="masthead-ref">
          Assistant de rédaction d'exigences conforme à la norme
          <br />
          <strong>ISO/IEC/IEEE 29148</strong> — Ingénierie des exigences
        </div>
      </header>

      <section className="workspace">
        <div className="pane">
          <div className="pane-header">
            <span className="pane-label">Texte à reformuler</span>
            <span className="pane-hint">Besoin brut, notes, e-mail, extrait de réunion…</span>
          </div>

          <textarea
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            placeholder="Collez ici le besoin exprimé par le métier, ou importez un document…"
          />

          <div className="pane-actions">
            <button
              className="btn btn-primary"
              disabled={!canReformulate}
              onClick={handleReformulate}
              title={
                isUnchangedSinceLastReformulation
                  ? "Le texte n'a pas changé depuis la dernière reformulation."
                  : undefined
              }
            >
              {status.state === "busy" && status.label.startsWith("Reformulation")
                ? "Reformulation…"
                : "Reformuler"}
            </button>
            <button className="btn btn-ghost" onClick={handleImportClick}>
              Importer un document
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.docx,.pdf,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              hidden
              onChange={handleFileChange}
            />
          </div>

          {rateLimitRemaining !== null && rateLimitTotal !== null && (
            <div
              className={`rate-limit-hint ${
                rateLimitRemaining === 0 ? "rate-limit-hint-empty" : ""
              }`}
            >
              {rateLimitRemaining} reformulation{rateLimitRemaining !== 1 ? "s" : ""}{" "}
              restante{rateLimitRemaining !== 1 ? "s" : ""} sur {rateLimitTotal}
              {rateLimitRemaining === 0 && " — quota réinitialisé après quelques minutes"}
            </div>
          )}
        </div>

        <div className="divider" />

        <div className="pane">
          <div className="pane-header">
            <span className="pane-label">Exigences reformulées</span>
            <span className="pane-hint">Score de conformité ISO 29148 par exigence</span>
          </div>

          {requirements.length === 0 ? (
            <div className="empty-result">
              Le résultat structuré, avec un score de conformité par exigence,
              apparaîtra ici après reformulation.
            </div>
          ) : (
            <>
              <div className="score-summary">
                <span>{requirements.length} exigence{requirements.length > 1 ? "s" : ""}</span>
                <span className="dot-sep">·</span>
                <span className="score-ok-text">
                  {fullyConformCount} conforme{fullyConformCount > 1 ? "s" : ""} ({totalCriteria}/{totalCriteria})
                </span>
                {toReviewCount > 0 && (
                  <>
                    <span className="dot-sep">·</span>
                    <span className="score-warn-text">
                      {toReviewCount} à vérifier
                    </span>
                  </>
                )}
              </div>

              <div className="requirement-list">
                {requirements.map((req, index) => {
                  const score = requirementScore(req);
                  const level = scoreLevel(score, totalCriteria);
                  const previousSection = requirements[index - 1]?.section;
                  const showSectionHeader = req.section !== previousSection;

                  return (
                    <div key={`${req.id}-${index}`}>
                      {showSectionHeader && (
                        <div className="section-heading">{req.section}</div>
                      )}
                      <div className="req-card">
                        <div className="req-card-top">
                          <span className="req-id">{req.id}</span>
                          <span className={`score-pill score-${level}`}>
                            {score}/{totalCriteria}
                          </span>
                          <div className="criteria-dots">
                            {CRITERIA.map((c) => (
                              <span
                                key={c.key}
                                className={`criterion-dot ${
                                  req.criteria?.[c.key] ? "met" : "unmet"
                                }`}
                                title={`${c.label} : ${
                                  req.criteria?.[c.key] ? "respectée" : "non respectée"
                                }`}
                              />
                            ))}
                          </div>
                          <button
                            className="req-delete"
                            onClick={() => deleteRequirement(index)}
                            aria-label={`Supprimer ${req.id}`}
                            title="Supprimer cette exigence"
                          >
                            ×
                          </button>
                        </div>
                        <textarea
                          className="req-text"
                          value={req.text}
                          onChange={(e) => updateRequirementText(index, e.target.value)}
                        />
                        {req.clarification && (
                          <div className="req-clarification">
                            ⚠ {req.clarification}
                          </div>
                        )}

                        {req.acceptanceCriteria && req.acceptanceCriteria.length > 0 && (
                          <div className="gherkin-block">
                            <button
                              className="gherkin-toggle"
                              onClick={() => toggleGherkin(index)}
                            >
                              {expandedGherkin.has(index) ? "▾" : "▸"} Critères
                              d'acceptation ({req.acceptanceCriteria.length})
                            </button>

                            {expandedGherkin.has(index) && (
                              <div className="gherkin-scenarios">
                                {req.acceptanceCriteria.map((sc, scIndex) => (
                                  <div className="gherkin-scenario" key={scIndex}>
                                    <input
                                      className="gherkin-scenario-title"
                                      value={sc.scenario}
                                      onChange={(e) =>
                                        updateScenarioField(
                                          index,
                                          scIndex,
                                          "scenario",
                                          e.target.value
                                        )
                                      }
                                    />
                                    <div className="gherkin-line">
                                      <span className="gherkin-keyword">
                                        Étant donné
                                      </span>
                                      <textarea
                                        className="gherkin-input"
                                        value={sc.given}
                                        onChange={(e) =>
                                          updateScenarioField(
                                            index,
                                            scIndex,
                                            "given",
                                            e.target.value
                                          )
                                        }
                                      />
                                    </div>
                                    <div className="gherkin-line">
                                      <span className="gherkin-keyword">Quand</span>
                                      <textarea
                                        className="gherkin-input"
                                        value={sc.when}
                                        onChange={(e) =>
                                          updateScenarioField(
                                            index,
                                            scIndex,
                                            "when",
                                            e.target.value
                                          )
                                        }
                                      />
                                    </div>
                                    <div className="gherkin-line">
                                      <span className="gherkin-keyword">Alors</span>
                                      <textarea
                                        className="gherkin-input"
                                        value={sc.then}
                                        onChange={(e) =>
                                          updateScenarioField(
                                            index,
                                            scIndex,
                                            "then",
                                            e.target.value
                                          )
                                        }
                                      />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <div className="pane-actions">
            <div className="export-group">
              <button
                className="btn"
                disabled={!canExport}
                onClick={() => handleExport("docx")}
              >
                {exporting === "docx" ? "Export…" : "Exporter en .docx"}
              </button>
              <button
                className="btn"
                disabled={!canExport}
                onClick={() => handleExport("pdf")}
              >
                {exporting === "pdf" ? "Export…" : "Exporter en .pdf"}
              </button>
            </div>
          </div>
        </div>
      </section>

      <div className="status-row" role="status" aria-live="polite">
        {status.state !== "idle" && (
          <>
            <span className={`status-dot ${dotClass}`} />
            <span className={status.state === "error" ? "error-text" : undefined}>
              {status.label}
            </span>
          </>
        )}
      </div>

      <footer className="footer-note">
        <span>Les besoins reformulés doivent être relus par un Product Owner avant diffusion.</span>
        <span>Reformulation assistée par IA — Claude (Anthropic)</span>
      </footer>

      {historyOpen && (
        <div className="drawer-backdrop" onClick={() => setHistoryOpen(false)}>
          <aside className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <span className="pane-label">Historique</span>
              <button
                className="req-delete"
                onClick={() => setHistoryOpen(false)}
                aria-label="Fermer l'historique"
              >
                ×
              </button>
            </div>

            {history.length === 0 ? (
              <div className="empty-result">
                Vos reformulations apparaîtront ici au fur et à mesure,
                conservées uniquement dans ce navigateur.
              </div>
            ) : (
              <>
                <div className="drawer-list">
                  {history.map((entry) => {
                    const total = CRITERIA.length;
                    const conform = entry.requirements.filter(
                      (r) => requirementScore(r) === total
                    ).length;
                    const preview =
                      entry.sourceText.trim().slice(0, 90) +
                      (entry.sourceText.trim().length > 90 ? "…" : "");

                    return (
                      <button
                        key={entry.id}
                        className="history-item"
                        onClick={() => loadHistoryEntry(entry)}
                      >
                        <div className="history-item-top">
                          <span className="history-date">
                            {formatHistoryDate(entry.timestamp)}
                          </span>
                          <span
                            className="req-delete"
                            role="button"
                            aria-label="Supprimer cette entrée"
                            onClick={(e) => handleDeleteHistoryEntry(entry.id, e)}
                          >
                            ×
                          </span>
                        </div>
                        <p className="history-preview">{preview}</p>
                        <div className="history-item-meta">
                          {entry.requirements.length} exigence
                          {entry.requirements.length > 1 ? "s" : ""} · {conform}/
                          {entry.requirements.length} conforme
                          {conform > 1 ? "s" : ""}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <button className="btn btn-ghost drawer-clear" onClick={handleClearHistory}>
                  Vider l'historique
                </button>
              </>
            )}
          </aside>
        </div>
      )}
    </main>
  );
}
