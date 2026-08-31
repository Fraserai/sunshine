import { API_BASE_URL } from "./config";
import type { VisualGenerateResponse, VoiceTokenResponse } from "../types";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit, timeoutMs = 30_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      throw new ApiError(body?.error?.message ?? `Request failed (${res.status})`, res.status);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export function fetchVoiceToken(): Promise<VoiceTokenResponse> {
  return request<VoiceTokenResponse>("/api/voice/token", { method: "GET" }, 20_000);
}

export interface GenerateVisualInput {
  action: "new" | "continue" | "redirect";
  prompt: string;
  previousVideoUrl?: string;
  generationId: number;
}

export function generateVisual(
  input: GenerateVisualInput,
  signal?: AbortSignal,
): Promise<VisualGenerateResponse> {
  return request<VisualGenerateResponse>(
    "/api/visual/generate",
    { method: "POST", body: JSON.stringify(input), ...(signal ? { signal } : {}) },
    // Generous: a 768P render plus frame extraction can legitimately take a while.
    180_000,
  );
}
