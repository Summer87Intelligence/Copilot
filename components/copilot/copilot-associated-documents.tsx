"use client";

import type { ProtoDocument } from "@/lib/copilot-documents-data";

const ghostDocLinkClass =
  "inline-flex items-center justify-center rounded-xl border border-[var(--copilot-border)] bg-white/60 px-3 py-1.5 text-xs font-medium text-[var(--copilot-ink)] shadow-sm transition hover:bg-white whitespace-nowrap";

function formatIssueDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso + "T12:00:00").toLocaleDateString("es-UY", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function displayFileName(doc: ProtoDocument): string {
  return doc.file_name?.trim() || "Documento sin nombre";
}

export function CopilotAssociatedDocumentsSection({
  documents,
  loading,
  error,
  emptyHint,
  showHeader = true,
}: {
  documents: ProtoDocument[];
  loading: boolean;
  error: string | null;
  emptyHint?: string;
  showHeader?: boolean;
}) {
  return (
    <section
      className={
        showHeader
          ? "rounded-xl border border-[var(--copilot-border)] bg-white/70 p-4"
          : "space-y-3"
      }
    >
      {showHeader ? (
        <>
          <h4 className="text-sm font-semibold text-[var(--copilot-ink)]">Documentos asociados</h4>
          <p className="mt-1 text-xs text-[var(--copilot-ink-muted)]">
            Registros en{" "}
            <code className="rounded bg-[rgba(44,40,37,0.06)] px-1">proto_documents</code>{" "}
            vinculados a este caso.
          </p>
        </>
      ) : null}

      {loading ? (
        <p className={`text-sm text-[var(--copilot-ink-muted)] ${showHeader ? "mt-3" : ""}`}>
          Cargando documentos…
        </p>
      ) : null}

      {!loading && error ? (
        <p className={`text-sm text-amber-900 ${showHeader ? "mt-3" : ""}`}>{error}</p>
      ) : null}

      {!loading && !error && documents.length === 0 ? (
        <p className={`text-sm text-[var(--copilot-ink-muted)] ${showHeader ? "mt-3" : ""}`}>
          {emptyHint ??
            "Aún no hay documentos cargados para este vínculo. Cuando existan filas en proto_documents, aparecerán acá."}
        </p>
      ) : null}

      {!loading && !error && documents.length > 0 ? (
        <ul className={`space-y-3 ${showHeader ? "mt-3" : ""}`}>
          {documents.map((doc) => (
            <li
              key={doc.id}
              className="rounded-lg border border-[var(--copilot-border)] bg-white/90 px-3 py-3 text-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-semibold text-[var(--copilot-ink)]">
                    {displayFileName(doc)}
                  </p>
                  <p className="text-xs uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                    Tipo: {doc.document_type}
                  </p>
                  <p className="text-xs text-[var(--copilot-ink-muted)]">
                    Fecha: {formatIssueDate(doc.issue_date)}
                  </p>
                  <p className="text-xs text-[var(--copilot-ink-muted)]">
                    Referencia: {doc.reference ?? "—"}
                  </p>
                  <p className="text-xs text-[var(--copilot-ink-muted)]">
                    Estado: {doc.status}
                  </p>
                  {doc.notes ? (
                    <p className="text-xs leading-relaxed text-[var(--copilot-ink-muted)]">
                      {doc.notes}
                    </p>
                  ) : null}
                </div>
                <div className="shrink-0 pt-0.5">
                  {doc.file_url ? (
                    <a
                      href={doc.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={ghostDocLinkClass}
                    >
                      Ver documento
                    </a>
                  ) : (
                    <span className="text-xs text-[var(--copilot-ink-muted)]">Sin URL</span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
