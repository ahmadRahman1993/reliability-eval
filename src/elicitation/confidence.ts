import type { ConfidenceElicitor } from "../types.js";

const CONFIDENCE_SUFFIX = `
Respond in this exact format:
ANSWER: <your answer>
CONFIDENCE: <a number between 0 and 1 representing how confident you are>`;

const ANSWER_RE = /ANSWER:\s*(.+?)(?:\n|$)/i;
const CONFIDENCE_RE = /CONFIDENCE:\s*([0-9]*\.?[0-9]+)/i;

export function defaultConfidenceElicitor(): ConfidenceElicitor {
  return {
    buildPrompt(original: string): string {
      return original + CONFIDENCE_SUFFIX;
    },
    parse(response: string): { answer: string; confidence: number | null } {
      const answerMatch = ANSWER_RE.exec(response);
      const confidenceMatch = CONFIDENCE_RE.exec(response);

      const answer = answerMatch ? (answerMatch[1] ?? "").trim() : response.trim();

      let confidence: number | null = null;
      if (confidenceMatch) {
        const parsed = Number.parseFloat(confidenceMatch[1] ?? "");
        if (Number.isFinite(parsed)) {
          confidence = Math.max(0, Math.min(1, parsed));
        }
      }

      return { answer, confidence };
    },
  };
}
