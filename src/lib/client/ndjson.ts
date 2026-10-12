export type StreamEvent = { type: string } & Record<string, unknown>;

/** Read a newline-delimited JSON response as it arrives. */
export async function* readNdjson(res: Response): AsyncGenerator<StreamEvent> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) yield JSON.parse(line) as StreamEvent;
    }
  }
  if (buf.trim()) yield JSON.parse(buf) as StreamEvent;
}
