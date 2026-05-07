#!/usr/bin/env node

const input = process.argv[2];
if (!input) {
  console.error('Uso: node fetch-url.mjs https://ejemplo.com');
  process.exit(1);
}

let u;
try {
  u = new URL(input);
} catch {
  console.error('URL inválida');
  process.exit(1);
}

if (!['http:', 'https:'].includes(u.protocol)) {
  console.error('URL inválida: solo http/https');
  process.exit(1);
}

if (['localhost', '127.0.0.1'].includes(u.hostname)) {
  console.error('Host bloqueado');
  process.exit(1);
}

const clean = (h) => h
  .replace(/<script[\s\S]*?<\/script>/gi, '')
  .replace(/<style[\s\S]*?<\/style>/gi, '')
  .replace(/<!--([\s\S]*?)-->/g, '');

const strip = (t) => t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const extract = (h, tag) => {
  const r = new RegExp(<[^>]*>([\\s\\S]*?)<\\/>, 'gi');
  const out = [];
  let m;
  while ((m = r.exec(h))) {
    const x = strip(m[1]);
    if (x) out.push(x);
  }
  return out;
};

(async () => {
  const res = await fetch(u.toString(), {
    method: 'GET',
    redirect: 'follow',
    headers: {
      'user-agent': 'web-analyzer-pro/1.0'
    }
  });

  if (!res.ok) {
    console.error(HTTP );
    process.exit(1);
  }

  const html = await res.text();
  const c = clean(html);

  const data = {
    url: u.toString(),
    title: (c.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').trim(),
    h1: extract(c, 'h1'),
    h2: extract(c, 'h2'),
    text: strip(c).slice(0, 8000)
  };

  console.log(JSON.stringify(data, null, 2));
})().catch((e) => {
  console.error(e?.message || 'Error no controlado');
  process.exit(1);
});
