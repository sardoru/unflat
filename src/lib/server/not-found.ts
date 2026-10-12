/** A plain 404 for manual links, in the manual sheet's own look. */
export function notFoundHtml(): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Manual not found · Unflat</title><meta name="robots" content="noindex">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fff;color:#141414;font:15px/1.5 -apple-system,"Helvetica Neue",Arial,sans-serif}main{max-width:34ch;padding:24px}h1{font-size:18px;margin:0 0 6px}p{margin:0 0 14px;color:#5f5f5f}a{color:#141414}</style></head>
<body><main><h1>This manual isn't here</h1><p>The link may be mistyped, or the manual was never saved.</p><a href="/">Make a manual</a></main></body></html>`;
  return new Response(html, { status: 404, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
