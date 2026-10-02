import { GoogleGenAI } from "@google/genai";
async function main() {
  // This mode uses only the fixed synthetic prompt below, never app data.
  const connectionOnly = process.argv.includes("--connection-only");
  if (
    !process.env.GEMINI_API_KEY ||
    (!connectionOnly && process.env.GEMINI_PAID_PROJECT !== "true")
  ) {
    console.error(
      "Live probe blocked: add GEMINI_API_KEY securely and confirm a billed project with GEMINI_PAID_PROJECT=true.",
    );
    process.exitCode = 2;
    return;
  }
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: { timeout: 30000, retryOptions: { attempts: 1 } },
  });
  const selected = process.env.GEMINI_MODEL || "gemini-flash-latest";
  try {
    const metadata = await ai.models.get({ model: selected });
    const response = await ai.models.generateContent({
      model: selected,
      contents: "Reply with the single word connected.",
      config: { maxOutputTokens: 256, temperature: 0 },
    });
    if (!response.text?.toLowerCase().includes("connected")) throw new Error();
    console.log(
      JSON.stringify({
        status: "live provider response passed",
        model: selected,
        returnedModelVersion: response.modelVersion ?? null,
        displayName: metadata.displayName,
        scope: connectionOnly
          ? "fixed synthetic connection test"
          : "billed-project probe",
        ownerConfirmedBilling: process.env.GEMINI_PAID_PROJECT === "true",
        inputTokens: response.usageMetadata?.promptTokenCount ?? null,
        outputTokens: response.usageMetadata?.candidatesTokenCount ?? null,
        thinkingTokens: response.usageMetadata?.thoughtsTokenCount ?? null,
      }),
    );
  } catch {
    console.error(
      "Live provider probe failed. Check allowed domains, billed-project access, and selected model availability. No credential or provider response was logged.",
    );
    process.exitCode = 1;
  }
}
void main();
