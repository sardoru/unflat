# Changelog

All notable changes to Unflat. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] — 2026-10-12

First release, live at https://unflat-nine.vercel.app (PR #1).

### Added

- **Two-pass parser:** Claude Opus 5.5 reads a manual (READ: product, parts, sub-assemblies, steps, poses, source pages), then lays it out in 3D (BUILD: every part and fastener placed). Each pass is streamed, with its own structured-output schema. `normalize.ts` repairs and checks the result.
- **3D engine:** generalized from the 3d-assembly-manual starter. It has whole-assembly poses animated between steps, sub-assemblies staged on the floor, automatic cameras, numbered marks spread until none overlap, hole decals and a metric scale bar. The same HTML is the viewer (`/m/[id]`) and the download (`/m/[id]/download`).
- **Upload gate**, before any expensive call:
  - access-code sessions;
  - magic-byte, size and page checks;
  - a scan of the PDF text layer for text aimed at a model;
  - per-session, per-IP and daily-budget limits;
  - a Claude Haiku 5.5 classifier;
  - single-use READ→BUILD tickets bound to the document hash.
- **Cleanup and storage:** refused uploads are deleted at once. A daily cron clears abandoned uploads, spent tickets and old usage-ledger days. Uploads go to a private Vercel Blob store for large files.
- **Viewer pages:** per-page manual images and per-manual OG cards.
- **Landing page:** an anatomy-kit hero figure (Fig 1 · Flat-pack, unflattened), the uploader with live reading notes, "My manuals", and the BILLY example (`/m/billy`).
- **Brand assets:** the site OG image, icon and Apple touch icon.
- **Tests:** unit tests (spec normalizing, upload screening, page rendering), plus e2e scripts for the upload paths and the attack PDFs.

### Fixed

- The usage ledger now writes a non-empty body, because Vercel Blob rejects empty ones.
- The pdf.js worker is resolved through Node module resolution, and `public/` is created before the copy, so it builds in a fresh Git checkout.
- The step progress bar animates with `transform`, not `width`.
