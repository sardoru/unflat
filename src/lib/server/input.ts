import type { SourceFile } from "../parse/run";
import { LIMITS } from "./config";
import { sha256 } from "./ids";
import { GateError, sniff, type ImageType } from "./screen";
import { store } from "./store";

export interface Input {
  src: SourceFile;
  /** sha256 of the document bytes (the ticket binds BUILD to it). */
  hash: string;
  bytes: number;
  /** Set when the document came through Blob (deleted after BUILD). */
  blobPath?: string;
}

const NAME = /[^\w .()-]+/g;

/** Read the uploaded document from a form: inline files, or a Blob pathname this session uploaded. */
export async function readInput(form: FormData, sessionTag: string): Promise<Input> {
  const name = String(form.get("name") ?? "manual").replace(NAME, "").slice(0, 120) || "manual";
  const blob = form.get("blob");
  let parts: Uint8Array[] = [];
  let blobPath: string | undefined;

  if (typeof blob === "string" && blob) {
    const ok = new RegExp(`^src/${sessionTag}/[a-z0-9-]{8,64}\\.(pdf|jpe?g|png|webp)$`).test(blob);
    if (!ok) throw new GateError("That upload isn't yours.", 403, "blob-owner");
    const got = await store.getBytes(blob);
    if (!got) throw new GateError("The upload has expired. Drop the file again.", 404, "blob-missing");
    if (got.bytes.length > LIMITS.blobBytes) throw new GateError("The file is too large.", 413, "too-large");
    parts = [got.bytes];
    blobPath = blob;
  } else {
    const files = form.getAll("file").filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f);
    if (!files.length) throw new GateError("No file was uploaded.", 400, "no-file");
    if (files.length > LIMITS.maxImages) throw new GateError(`Upload at most ${LIMITS.maxImages} photos.`, 413, "too-many");
    const total = files.reduce((a, f) => a + f.size, 0);
    if (total > LIMITS.inlineBytes) throw new GateError("The upload is too large to send directly.", 413, "too-large");
    parts = await Promise.all(files.map(async (f) => new Uint8Array(await f.arrayBuffer())));
  }

  const types = parts.map(sniff);
  if (types.length === 1 && types[0] === "pdf") {
    const data = Buffer.from(parts[0]);
    return { src: { kind: "pdf", name, data }, hash: sha256(data), bytes: data.length, blobPath };
  }
  if (types.every((t) => t && t !== "pdf")) {
    const images = parts.map((p, i) => ({ mediaType: types[i] as ImageType, data: Buffer.from(p) }));
    const hash = sha256(images.map((im) => sha256(im.data)).join(":"));
    return { src: { kind: "images", name, images }, hash, bytes: images.reduce((a, im) => a + im.data.length, 0), blobPath };
  }
  throw new GateError("Upload one PDF, or photos of the pages (JPEG, PNG or WebP).", 415, "type");
}
