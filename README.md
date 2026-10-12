# Unflat

**The flat-pack manual, unflattened.** Drop in an assembly manual (an IKEA PDF, or photos of its pages). Claude reads every page, and Unflat turns each step into a 3D animation you can turn, replay, download and share.

Live: https://unflat-nine.vercel.app · Example: https://unflat-nine.vercel.app/m/billy

## How it works

1. **Gate** (`/api/parse/read`, before any expensive call)
   - access-code session
   - file type by magic bytes, size and page caps
   - a scan of the PDF's text layer for text aimed at a model (including near-invisible print)
   - per-session, per-IP and daily-budget limits
   - a Claude Haiku 5.5 classifier that must agree the document is an assembly manual and addresses no AI
2. **READ pass** (Claude Opus 5.5, streamed): product, parts with sizes, sub-assemblies, steps with poses, tips and source pages → `ManualOutline`.
3. **BUILD pass** (Claude Opus 5.5, streamed). It runs only with a single-use ticket from READ, bound to the same document hash and the unaltered READ result. It places every part and fastener in 3D → `ManualLayout`.
4. **Normalize** (`src/lib/spec/normalize.ts`): repairs and checks the spec (renumbering, dangling references, hardware defaults, overlaps, counts).
5. **Engine** (`engine/engine.js`). The [3d-assembly-manual](https://github.com/SkylarKitchen/skills/tree/main/skills/design/3d-assembly-manual) starter, generalized to data. The spec drives:
   - part models built from the spec;
   - whole-assembly poses (on its back or side, upside-down), animated between steps;
   - sub-assemblies staged on the floor that slide in at their join step;
   - automatic cameras, detail bubbles, hole decals and a metric scale bar.

   The same HTML document is the viewer (`/m/[id]`) and the download (`/m/[id]/download`).

The landing figure is drawn with the [anatomy](https://github.com/wheresryan22/anatomy) kit (`src/lib/iso`, `src/components/hero`).

## Spec conventions

All geometry is in centimetres, in the **finished product's frame**: origin at the floor centre, +x right, +y up, +z toward the viewer. Hardware is placed by **hole mouth + insertion axis** (pointing into the material). Motion is described in the **world frame** per step:
- `pose`: how the body lies on the floor at that step;
- `view`: where the camera looks from;
- `from`: where an arriving part comes from.

See `src/lib/spec/types.ts` and the prompt in `src/lib/parse/prompt.ts`.

## Security and cost controls

| Layer | Where |
|---|---|
| Invite codes → signed `httpOnly` session (jose, HS256) | `src/lib/server/session.ts`, `/api/session` |
| Fails closed in production without codes, secret, Blob or key | `uploadsBlocked()` in `src/lib/server/config.ts` |
| Magic-byte types, 4.3 MB inline / 20 MB via private Blob, ≤ 60 pages, no encrypted PDFs | `src/lib/server/input.ts`, `/api/parse/read` |
| Text-layer injection scan (hard patterns, zero-width, tiny text) | `src/lib/server/screen.ts` |
| Haiku 5.5 classifier (schema-locked, low effort) | `classify()` in `src/lib/server/screen.ts` |
| Hardened prompts: document and uploader note are untrusted data | `src/lib/parse/prompt.ts` |
| Structured output only, no tools, `max_tokens` caps (40k / 48k) | `src/lib/parse/run.ts`, `LIMITS` |
| Single-use READ→BUILD tickets bound to document + READ hashes | `src/lib/server/tickets.ts` |
| Daily limits: 6 manuals/session, 8/IP, one at a time, `DAILY_BUDGET_USD` | `src/lib/server/ledger.ts` |
| Client disconnect aborts the Claude request | `req.signal` → SDK stream |
| Viewer: model text rendered as text only, JSON script-escaped, hash-locked CSP, SRI on three.js | `src/lib/engine/render.ts` |

Recommended extra layer: enable the Vercel Firewall for the project. Then add two rate-limit rules:
- `/api/parse*`: 8 requests per 10 min per IP.
- `POST /api/session` and `/api/upload*`: 12 per 10 min per IP.

Also set a monthly spend limit on the Anthropic workspace that holds the API key.

## Environment

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API key (server only) |
| `ACCESS_CODES` | Comma-separated invite codes (≥ 8 chars each) |
| `SESSION_SECRET` | ≥ 32 random bytes for sessions and tickets |
| `BLOB_READ_WRITE_TOKEN` | Private Blob store: manuals, page images, uploads, usage ledger |
| `DAILY_BUDGET_USD` | Default 25 |
| Optional | `ANTHROPIC_MODEL` (default `claude-opus-5-5`), `PARSE_EFFORT` (`high`), `SCREEN_MODEL` (`claude-haiku-5-5`), `MAX_PAGES`, `MAX_UPLOAD_MB`, `SESSION_DAILY_MANUALS`, `IP_DAILY_MANUALS`, `UPLOADS_ENABLED=0` (kill switch), `SITE_URL` |

## Scripts

```sh
npm run dev                       # builds the engine bundle, then next dev
npm test                          # vitest: normalizer, injection scan, render/CSP
npx tsx --env-file=.env.local scripts/parse-manual.mts manual.pdf out/ "hint"   # both passes from the CLI
npx tsx scripts/render-spec.mts out/spec.json manual.html                        # spec → standalone manual
node scripts/shoot.mjs manual.html shots/ 0,1,2 phone,desktop                     # captures in headless Chrome
npx tsx --env-file=.env.local scripts/screen-pdf.mts file.pdf                     # run the content gate
```

Typical cost and time with Claude Opus 5.5:
- BILLY (16 pp, 12 steps): about $0.90 and 4 min.
- TARVA (24 pp, 31 steps): about $1.60 and 9 min.
- The gate adds well under 1¢.

## Credits

- 3D engine: derived from the 3d-assembly-manual starter (MIT, Skylar Kitchen); see `engine/LICENSE-3d-assembly-manual`.
- Landing figure: anatomy kit (MIT); see `src/lib/iso/LICENSE`.
- Fonts: Geist and Geist Mono (OFL).

Not affiliated with IKEA. Manuals and product names belong to their owners.
