"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, type FormEvent } from "react";

export function AdminCompaniesCreateForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setFormError(null);
      setSuccessMsg(null);

      const trimmedName = name.trim();
      if (!trimmedName) {
        setFormError("Indicá un nombre para la empresa.");
        return;
      }

      const payload: { name: string; slug?: string } = { name: trimmedName };
      const slugTrim = slug.trim();
      if (slugTrim) {
        payload.slug = slugTrim;
      }

      setSubmitting(true);
      try {
        const res = await fetch("/api/admin/companies/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          credentials: "same-origin",
        });

        let json: unknown = null;
        try {
          json = await res.json();
        } catch {
          json = null;
        }

        if (!res.ok) {
          const msg =
            json &&
            typeof json === "object" &&
            "message" in json &&
            typeof (json as { message: unknown }).message === "string"
              ? (json as { message: string }).message
              : "No se pudo crear la empresa.";
          setFormError(msg);
          return;
        }

        setName("");
        setSlug("");
        setSuccessMsg("Empresa creada correctamente.");
        router.refresh();
      } catch {
        setFormError("No se pudo conectar con el servidor.");
      } finally {
        setSubmitting(false);
      }
    },
    [name, slug, router]
  );

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-8 rounded-md border border-[var(--copilot-border)] bg-[var(--copilot-card)] p-4"
      style={{ boxShadow: "var(--copilot-shadow)" }}
    >
      <h2 className="mb-3 text-sm font-medium text-[var(--copilot-ink)]">
        Nueva empresa
      </h2>

      {successMsg ? (
        <p
          className="mb-3 text-sm text-[var(--copilot-accent)]"
          role="status"
        >
          {successMsg}
        </p>
      ) : null}

      {formError ? (
        <p
          className="mb-3 text-sm text-red-700 dark:text-red-400"
          role="alert"
        >
          {formError}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="min-w-0 flex-1 sm:max-w-xs">
          <label
            htmlFor="admin-company-name"
            className="mb-1 block text-xs text-[var(--copilot-ink-muted)]"
          >
            Nombre
          </label>
          <input
            id="admin-company-name"
            name="name"
            type="text"
            autoComplete="organization"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={submitting}
            className="w-full rounded border border-[var(--copilot-border)] bg-white px-3 py-2 text-sm text-[var(--copilot-ink)] outline-none focus:border-[var(--copilot-accent)] disabled:opacity-60 dark:bg-neutral-900"
          />
        </div>
        <div className="min-w-0 flex-1 sm:max-w-xs">
          <label
            htmlFor="admin-company-slug"
            className="mb-1 block text-xs text-[var(--copilot-ink-muted)]"
          >
            Slug <span className="font-normal">(opcional)</span>
          </label>
          <input
            id="admin-company-slug"
            name="slug"
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            disabled={submitting}
            placeholder="Se genera desde el nombre si lo dejás vacío"
            className="w-full rounded border border-[var(--copilot-border)] bg-white px-3 py-2 text-sm text-[var(--copilot-ink)] outline-none focus:border-[var(--copilot-accent)] disabled:opacity-60 dark:bg-neutral-900"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="shrink-0 rounded bg-[var(--copilot-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {submitting ? "Creando…" : "Crear empresa"}
        </button>
      </div>
    </form>
  );
}
