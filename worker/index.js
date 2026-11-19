// Cloudflare Worker: Simpleman waitlist API + password-protected dataroom.
// Static files are served by the [assets] config; this only runs for paths
// that don't match a static file (e.g. /api/*, /dataroom).
//
// Bindings (see wrangler.toml):
//   DB                  D1 database (schema in worker/schema.sql)
//   ASSETS              static assets
//   DATAROOM_PASSWORD   secret: `npx wrangler secret put DATAROOM_PASSWORD`

const MAX_LEN = 2000;
const FIELDS = ['based', 'about', 'people', 'anything_else', 'email'];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    try {
      if (path === '/api/waitlist') {
        if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
        return await submit(request, env);
      }

      if (path === '/dataroom' || path.startsWith('/dataroom/')) {
        const denied = checkAuth(request, env);
        if (denied) return denied;

        if (path === '/dataroom' && request.method === 'GET') return await dataroom(env);
        if (path === '/dataroom/export.csv' && request.method === 'GET') return await exportCsv(env);
        if (path === '/dataroom/delete' && request.method === 'POST') return await remove(request, env);
        return new Response('Not found', { status: 404 });
      }
    } catch (err) {
      console.error(err);
      return json({ error: 'Server error' }, 500);
    }

    return env.ASSETS.fetch(request);
  },
};

/* ---------- public: form submission ---------- */

async function submit(request, env) {
  let data;
  const type = request.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    data = await request.json().catch(() => null);
  } else {
    const form = await request.formData().catch(() => null);
    data = form && Object.fromEntries(form);
  }
  if (!data || typeof data !== 'object') return json({ error: 'Invalid request' }, 400);

  // Honeypot: real visitors never see or fill this field.
  if (data.website) return json({ ok: true });

  const row = {};
  for (const f of FIELDS) row[f] = String(data[f] ?? '').trim().slice(0, MAX_LEN);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email) || row.email.length > 254) {
    return json({ error: 'Please enter a valid email address.' }, 400);
  }

  await env.DB.prepare(
    `INSERT INTO waitlist (based, about, people, anything_else, email, country, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    row.based, row.about, row.people, row.anything_else, row.email,
    request.cf?.country || null,
    (request.headers.get('user-agent') || '').slice(0, 300)
  ).run();

  return json({ ok: true });
}

/* ---------- private: dataroom ---------- */

function checkAuth(request, env) {
  const expected = env.DATAROOM_PASSWORD;
  if (!expected) return new Response('Dataroom password is not configured.', { status: 503 });

  const header = request.headers.get('authorization') || '';
  let password = '';
  if (header.startsWith('Basic ')) {
    try {
      const decoded = atob(header.slice(6));
      password = decoded.slice(decoded.indexOf(':') + 1);
    } catch { /* fall through to 401 */ }
  }
  if (password && safeEqual(password, expected)) return null;

  return new Response('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Simpleman dataroom", charset="UTF-8"' },
  });
}

function safeEqual(a, b) {
  const enc = new TextEncoder();
  const x = enc.encode(a), y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

async function allRows(env) {
  const { results } = await env.DB.prepare(
    'SELECT * FROM waitlist ORDER BY created_at DESC, id DESC'
  ).all();
  return results || [];
}

async function dataroom(env) {
  const rows = await allRows(env);
  const body = rows.length
    ? rows.map(r => `
      <article class="entry">
        <header>
          <a class="email" href="mailto:${esc(r.email)}">${esc(r.email)}</a>
          <span class="meta">${esc(r.created_at)} UTC${r.country ? ' · ' + esc(r.country) : ''}</span>
          <form method="post" action="/dataroom/delete" onsubmit="return confirm('Delete this submission? This cannot be undone.')">
            <input type="hidden" name="id" value="${r.id}"><button type="submit">delete</button>
          </form>
        </header>
        <dl>
          <dt>Where are you based?</dt><dd>${esc(r.based) || '—'}</dd>
          <dt>What is your institution about?</dt><dd>${esc(r.about) || '—'}</dd>
          <dt>How many people in your team would consume simpleman and in what quantities?</dt><dd>${esc(r.people) || '—'}</dd>
          <dt>Anything else?</dt><dd>${esc(r.anything_else) || '—'}</dd>
        </dl>
      </article>`).join('')
    : '<p class="empty">No submissions yet.</p>';

  const html = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>Simpleman · Dataroom</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Times New Roman', Times, serif; color: #111; background: #fff; padding: 48px 16px 96px; }
  main { max-width: 860px; margin: 0 auto; }
  .top { display: flex; align-items: center; gap: 16px; margin-bottom: 40px; }
  .top img { width: 56px; }
  h1 { font-weight: normal; font-size: 40px; }
  .bar { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 24px; font-size: 18px; }
  .bar a, button { font: 16px 'Times New Roman', Times, serif; color: #111; background: #fff;
    border: 2px solid #d8d8d8; padding: 4px 14px; text-decoration: none; cursor: pointer; }
  .bar a:hover, button:hover { border-color: #a0a0a0; }
  .entry { border: 2px solid #cfcfcf; background: #f4f4f4; padding: 20px 24px; margin-bottom: 20px; }
  .entry header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px 16px; margin-bottom: 14px; }
  .email { font-size: 21px; color: #111; }
  .meta { color: #888; font-size: 15px; flex: 1; }
  dl { display: grid; gap: 4px; }
  dt { color: #777; font-size: 15px; margin-top: 8px; }
  dd { font-size: 18px; white-space: pre-wrap; overflow-wrap: anywhere; }
  .empty { color: #888; font-size: 18px; }
</style></head>
<body><main>
  <div class="top"><a href="/"><img src="/img/hat.png" alt="Simpleman"></a><h1>Dataroom</h1></div>
  <div class="bar"><span>${rows.length} waitlist submission${rows.length === 1 ? '' : 's'}</span><a href="/dataroom/export.csv">export CSV</a></div>
  ${body}
</main></body></html>`;

  return new Response(html, { headers: privateHeaders('text/html; charset=utf-8') });
}

async function exportCsv(env) {
  const rows = await allRows(env);
  const cols = ['id', 'created_at', 'email', 'based', 'about', 'people', 'anything_else', 'country'];
  const cell = v => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // stop spreadsheet formula injection
    return '"' + s.replace(/"/g, '""') + '"';
  };
  const csv = '﻿' + [cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\r\n');
  const headers = privateHeaders('text/csv; charset=utf-8');
  headers['Content-Disposition'] = 'attachment; filename="simpleman-waitlist.csv"';
  return new Response(csv, { headers });
}

async function remove(request, env) {
  const form = await request.formData();
  const id = parseInt(form.get('id'), 10);
  if (Number.isInteger(id)) await env.DB.prepare('DELETE FROM waitlist WHERE id = ?').bind(id).run();
  return Response.redirect(new URL('/dataroom', request.url).toString(), 303);
}

/* ---------- helpers ---------- */

function privateHeaders(type) {
  return { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
