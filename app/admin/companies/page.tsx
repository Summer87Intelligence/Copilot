import Link from "next/link";
import { cookies, headers } from "next/headers";

import { AdminCompaniesCreateForm } from "./admin-companies-create-form";

type CompanyRow = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
};

function formatCreatedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

async function fetchAdminCompanies(): Promise<{
  companies: CompanyRow[];
  error: string | null;
}> {
  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const proto =
    headersList.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const url = `${proto}://${host}/api/admin/companies`;

  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  let res: Response;
  try {
    res = await fetch(url, {
      headers: cookieHeader ? { cookie: cookieHeader } : {},
      cache: "no-store",
    });
  } catch {
    return {
      companies: [],
      error: "No se pudo conectar con el servidor.",
    };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return {
      companies: [],
      error: "La respuesta del servidor no es válida.",
    };
  }

  if (!res.ok) {
    const message =
      json &&
      typeof json === "object" &&
      "message" in json &&
      typeof (json as { message: unknown }).message === "string"
        ? (json as { message: string }).message
        : "No se pudo cargar el listado de empresas.";
    return { companies: [], error: message };
  }

  const raw: unknown[] =
    json &&
    typeof json === "object" &&
    "companies" in json &&
    Array.isArray((json as { companies: unknown }).companies)
      ? ((json as { companies: unknown }).companies as unknown[])
      : [];

  const companies: CompanyRow[] = [];
  for (const row of raw) {
    if (
      row &&
      typeof row === "object" &&
      typeof (row as CompanyRow).id === "string" &&
      typeof (row as CompanyRow).name === "string" &&
      typeof (row as CompanyRow).slug === "string" &&
      typeof (row as CompanyRow).created_at === "string"
    ) {
      companies.push(row as CompanyRow);
    }
  }

  return { companies, error: null };
}

export default async function AdminCompaniesPage() {
  const { companies, error } = await fetchAdminCompanies();

  return (
    <main
      className="min-h-screen px-4 py-8 text-[var(--copilot-ink)]"
      style={{ background: "var(--copilot-canvas)" }}
    >
      <div className="mx-auto max-w-4xl">
        <p className="mb-6 text-sm">
          <Link
            href="/"
            className="text-[var(--copilot-accent)] underline-offset-2 hover:underline"
          >
            ← Volver al inicio
          </Link>
        </p>

        <h1 className="mb-1 text-xl font-semibold tracking-tight">
          Empresas (admin)
        </h1>
        <p className="mb-8 text-sm text-[var(--copilot-ink-muted)]">
          Listado de workspaces registrados en el sistema.
        </p>

        <AdminCompaniesCreateForm />

        {error ? (
          <p
            className="mb-6 rounded-md border border-[var(--copilot-border)] bg-[var(--copilot-card)] px-4 py-3 text-sm"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        {!error && companies.length === 0 ? (
          <p className="mb-6 text-sm text-[var(--copilot-ink-muted)]">
            No hay empresas creadas
          </p>
        ) : null}

        {!error && companies.length > 0 ? (
          <div
            className="overflow-x-auto rounded-md border border-[var(--copilot-border)] bg-[var(--copilot-card)]"
            style={{ boxShadow: "var(--copilot-shadow)" }}
          >
            <table className="w-full min-w-[480px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--copilot-border)] bg-[var(--copilot-sidebar)]">
                  <th className="px-4 py-3 font-medium">Nombre</th>
                  <th className="px-4 py-3 font-medium">Slug</th>
                  <th className="px-4 py-3 font-medium">Creada</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-[var(--copilot-border)] last:border-0"
                  >
                    <td className="px-4 py-3 align-top">{c.name}</td>
                    <td className="px-4 py-3 align-top font-mono text-xs text-[var(--copilot-ink-muted)]">
                      {c.slug}
                    </td>
                    <td className="px-4 py-3 align-top text-[var(--copilot-ink-muted)]">
                      {formatCreatedAt(c.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </main>
  );
}
