import type { Document, Source } from "./types";
export function chunks(text: string) {
  const clean = text
    .replace(/\u0000/g, "")
    .replace(/\r/g, "")
    .trim();
  if (clean.length > 160000)
    throw new Error("Document exceeds the 160,000 character extraction limit.");
  const result = [];
  for (let i = 0; i < clean.length; i += 1050)
    result.push({
      id: String(result.length + 1),
      text: clean.slice(i, i + 1200),
    });
  return result;
}
export function retrieve(docs: Document[], query: string): Source[] {
  const terms = [
    ...new Set(query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []),
  ];
  return docs
    .filter((d) => d.status === "ready")
    .flatMap((d) =>
      d.chunks.map((c) => ({
        id: `D:${d.id}:${c.id}`,
        title: d.name,
        snippet: c.text,
        score: terms.reduce(
          (n, t) => n + (c.text.toLowerCase().split(t).length - 1),
          0,
        ),
      })),
    )
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(({ id, title, snippet }) => ({ id, title, snippet }));
}
export function citedSources(text: string, provided: Source[]) {
  return provided.filter((s) => text.includes(`[${s.id}]`));
}
