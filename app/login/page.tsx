"use client";

import { useState } from "react";
import Link from "next/link";

import { signInWithMagicLink } from "@/lib/auth";
import { messageError, messageSuccess } from "@/styles/ui";

const pageBg = "#f7f4ed";
const textPrimary = "#2c2825";
const panelBg = "#f2efe8";
const panelBorder = "rgba(120, 100, 80, 0.12)";
const muted = "rgba(44, 40, 37, 0.6)";
const inputBorder = "rgba(44, 40, 37, 0.18)";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setLoading(true);
    try {
      const { error } = await signInWithMagicLink(email);
      if (error) {
        setMessage({ type: "error", text: error.message });
        return;
      }
      setMessage({
        type: "success",
        text: "Revisá tu correo: te enviamos un enlace para iniciar sesión. Abrilo en este mismo navegador.",
      });
      setEmail("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        backgroundColor: pageBg,
        color: textPrimary,
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Arial, sans-serif',
        padding: "32px 24px 56px",
        maxWidth: "480px",
        margin: "0 auto",
      }}
    >
      <p style={{ margin: "0 0 20px", fontSize: "14px" }}>
        <Link
          href="/"
          style={{ color: "rgba(90, 75, 120, 0.9)", textDecoration: "none" }}
        >
          ← Volver al inicio
        </Link>
      </p>

      <h1
        style={{
          margin: "0 0 12px",
          fontSize: "26px",
          fontWeight: 700,
          letterSpacing: "-0.02em",
        }}
      >
        Iniciar sesión
      </h1>

      <p
        style={{
          margin: "0 0 28px",
          fontSize: "15px",
          lineHeight: 1.55,
          color: muted,
        }}
      >
        Ingresá tu email y te enviamos un enlace mágico. No hace falta contraseña.
      </p>

      <section
        style={{
          backgroundColor: panelBg,
          border: `1px solid ${panelBorder}`,
          borderRadius: "16px",
          padding: "24px",
        }}
      >
        <form onSubmit={(e) => void handleSubmit(e)}>
          <label
            htmlFor="login-email"
            style={{
              display: "block",
              marginBottom: "8px",
              fontSize: "13px",
              fontWeight: 600,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: muted,
            }}
          >
            Email
          </label>
          <input
            id="login-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            placeholder="tu@empresa.com"
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "12px 14px",
              fontSize: "16px",
              borderRadius: "12px",
              border: `1px solid ${inputBorder}`,
              backgroundColor: "#faf8f5",
              color: textPrimary,
              fontFamily: "inherit",
              marginBottom: "18px",
            }}
          />

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "14px 20px",
              borderRadius: "12px",
              border: "1px solid rgba(90, 75, 120, 0.28)",
              backgroundColor: loading ? "#e0dce8" : "#e4ddf0",
              color: textPrimary,
              fontSize: "16px",
              fontWeight: 600,
              cursor: loading ? "wait" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {loading ? "Enviando…" : "Enviar enlace mágico"}
          </button>
        </form>

        {message ? (
          <p
            role="status"
            style={{
              margin: "20px 0 0",
              padding: "14px 16px",
              borderRadius: "12px",
              fontSize: "14px",
              lineHeight: 1.5,
              backgroundColor:
                message.type === "success"
                  ? messageSuccess.background
                  : messageError.background,
              border:
                message.type === "success"
                  ? `1px solid ${messageSuccess.border}`
                  : `1px solid ${messageError.border}`,
              color:
                message.type === "success" ? messageSuccess.text : messageError.text,
            }}
          >
            {message.text}
          </p>
        ) : null}
      </section>

      <p style={{ margin: "24px 0 0", fontSize: "14px", textAlign: "center" }}>
        <Link
          href="/account"
          style={{ color: "rgba(90, 75, 120, 0.95)", fontWeight: 500 }}
        >
          Mi cuenta
        </Link>
      </p>
    </main>
  );
}
