/**
 * Guía cognitiva ejecutiva: orienta la lectura sin competir con alertas ni KPIs.
 * Tipografía serif/itálica del sistema (sin fuentes nuevas).
 */
export function CopilotReadingKey({
  lines,
  title = "Clave de lectura",
}: {
  lines: readonly string[];
  title?: string;
}) {
  return (
    <aside
      className="w-full max-w-sm rounded-2xl border border-[rgba(101,84,63,0.12)] bg-[#faf7f0] px-4 py-3.5 shadow-[0_2px_14px_rgba(44,40,37,0.06)]"
      aria-label={title}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#6b6258]">
        {title}
      </p>
      <ul className="mt-2.5 list-none space-y-1.5 p-0 font-serif text-[0.9375rem] font-normal italic leading-snug text-[#2c2824]">
        {lines.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    </aside>
  );
}
