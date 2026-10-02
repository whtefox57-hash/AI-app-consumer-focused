type Track = {
  trackId: number;
  trackName: string;
  artistName: string;
  trackViewUrl: string;
  primaryGenreName?: string;
};
const genres: Record<string, string[]> = {
  working: ["ambient", "classical", "jazz", "instrumental", "electronic"],
  walking: ["dance", "pop", "rock", "hip-hop"],
  cooking: ["jazz", "soul", "latin", "pop"],
  traveling: ["alternative", "world", "rock", "pop"],
  reflecting: ["ambient", "classical", "folk", "singer/songwriter"],
};
export function rankCatalog(
  tracks: Track[],
  context: string,
  moment: string,
  feedback: { track_id: number; context: string; feedback: string }[],
) {
  const cues = /calm|quiet|rain|gentle|soft/i.test(moment)
    ? ["ambient", "classical", "jazz"]
    : /energy|fast|upbeat|party/i.test(moment)
      ? ["dance", "pop", "rock"]
      : [];
  return tracks
    .filter(
      (t) =>
        t.trackId &&
        t.trackName &&
        t.artistName &&
        /^https:\/\/(music|itunes)\.apple\.com\//.test(t.trackViewUrl),
    )
    .filter(
      (t) =>
        !feedback.some(
          (f) =>
            f.track_id === t.trackId &&
            f.context === context &&
            ["disliked", "wrong moment"].includes(f.feedback),
        ),
    )
    .map((track, index) => ({
      track,
      score:
        (genres[context] || []).filter((g) =>
          track.primaryGenreName?.toLowerCase().includes(g),
        ).length *
          2 +
        cues.filter((g) => track.primaryGenreName?.toLowerCase().includes(g))
          .length *
          3 +
        (feedback.some(
          (f) =>
            f.track_id === track.trackId &&
            f.context === context &&
            f.feedback === "liked",
        )
          ? 4
          : 0) -
        index / 100,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ track }) => track);
}
