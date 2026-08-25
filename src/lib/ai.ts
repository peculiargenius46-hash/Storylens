// Server-only. A provider-independent chat client.
//
// StoryLens does not depend on any single AI company. Almost every provider now
// speaks the same request shape as OpenAI's chat API, so one small client can
// talk to all of them by varying three things: the address, the key, and the
// model name. That is all this file does.
//
// Two ideas make it flexible:
//
//   1. A provider registry. Each known provider (Groq, OpenAI, OpenRouter,
//      DeepSeek and friends) has an address and the name of its key. Add a key
//      to the environment and that provider is live. Add none of a provider's
//      key and it is simply skipped.
//
//   2. Fallback chains. Each job (cheap work versus quality work, for a free
//      user versus a paying one) resolves to an ordered list of provider/model
//      pairs. The client tries the first, and if it is rate limited, down, or
//      the key was pulled, it moves to the next. So if a free model stops being
//      free or a provider is switched off, the work keeps flowing to whatever
//      is still configured, with no code change and no redeploy.
//
// Keys are read from the environment and never leave the server.

export type TaskTier = "light" | "main";
export type PlanTier = "free" | "paid";
export type ChatUsage = { inputTokens: number; outputTokens: number };

type Provider = {
  name: string;
  url: string;
  keyEnv: string;
  extraHeaders?: Record<string, string>;
};

// Every one of these speaks the OpenAI-style /chat/completions request.
const PROVIDERS: Record<string, Provider> = {
  groq: {
    name: "groq",
    url: "https://api.groq.com/openai/v1/chat/completions",
    keyEnv: "GROQ_API_KEY",
  },
  openai: {
    name: "openai",
    url: "https://api.openai.com/v1/chat/completions",
    keyEnv: "OPENAI_API_KEY",
  },
  openrouter: {
    name: "openrouter",
    url: "https://openrouter.ai/api/v1/chat/completions",
    keyEnv: "OPENROUTER_API_KEY",
  },
  together: {
    name: "together",
    url: "https://api.together.xyz/v1/chat/completions",
    keyEnv: "TOGETHER_API_KEY",
  },
  deepseek: {
    name: "deepseek",
    url: "https://api.deepseek.com/chat/completions",
    keyEnv: "DEEPSEEK_API_KEY",
  },
  mistral: {
    name: "mistral",
    url: "https://api.mistral.ai/v1/chat/completions",
    keyEnv: "MISTRAL_API_KEY",
  },
  fireworks: {
    name: "fireworks",
    url: "https://api.fireworks.ai/inference/v1/chat/completions",
    keyEnv: "FIREWORKS_API_KEY",
  },
  xai: {
    name: "xai",
    url: "https://api.x.ai/v1/chat/completions",
    keyEnv: "XAI_API_KEY",
  },
};

// An escape hatch for any future provider that is OpenAI-compatible but not in
// the list above. Set CUSTOM_AI_BASE_URL (and CUSTOM_AI_API_KEY) and reference
// it in a chain as `custom:the-model-name`.
function customProvider(): Provider | null {
  const raw = process.env.CUSTOM_AI_BASE_URL;
  if (!raw) return null;

  const trimmed = raw.replace(/\/+$/, "");
  const url = trimmed.endsWith("/chat/completions")
    ? trimmed
    : `${trimmed}/chat/completions`;

  return { name: "custom", url, keyEnv: "CUSTOM_AI_API_KEY" };
}

function getProvider(name: string): Provider | null {
  if (name === "custom") return customProvider();
  return PROVIDERS[name] ?? null;
}

function providerKey(provider: Provider): string | undefined {
  return process.env[provider.keyEnv] || undefined;
}

// Built-in chains. Each is an ordered, comma-separated list of provider:model.
// Godfrey can override any of these from the environment (see SLOT_ENV) without
// touching code. Groq is first for free work because it is fast and low cost;
// OpenAI sits at the back as a paid safety net when a key is present.
const DEFAULT_CHAINS: Record<string, string> = {
  free_light: "groq:llama-3.1-8b-instant, openai:gpt-4o-mini",
  free_main:
    "groq:llama-3.3-70b-versatile, deepseek:deepseek-chat, openai:gpt-4o-mini",
  paid_light: "groq:llama-3.1-8b-instant, openai:gpt-4o-mini",
  paid_main:
    "openai:gpt-4o, deepseek:deepseek-chat, groq:llama-3.3-70b-versatile",
};

const SLOT_ENV: Record<string, string> = {
  free_light: "AI_FREE_LIGHT",
  free_main: "AI_FREE_MAIN",
  paid_light: "AI_PAID_LIGHT",
  paid_main: "AI_PAID_MAIN",
};

type Attempt = { provider: Provider; model: string; key: string };

// Turns a chain string into concrete attempts, dropping any whose provider has
// no key configured. Model names may themselves contain a colon (OpenRouter's
// `:free` suffix, for example), so only the first colon separates provider
// from model.
function resolveChain(plan: PlanTier, tier: TaskTier): Attempt[] {
  const slot = `${plan}_${tier}`;
  const raw = process.env[SLOT_ENV[slot]] || DEFAULT_CHAINS[slot] || "";

  const attempts: Attempt[] = [];

  for (const token of raw.split(",")) {
    const entry = token.trim();
    if (!entry) continue;

    const colon = entry.indexOf(":");
    if (colon === -1) continue;

    const providerName = entry.slice(0, colon).trim();
    const model = entry.slice(colon + 1).trim();
    if (!model) continue;

    const provider = getProvider(providerName);
    if (!provider) continue;

    const key = providerKey(provider);
    if (!key) continue;

    attempts.push({ provider, model, key });
  }

  return attempts;
}

/** True when at least one provider key is present, so intelligence can run. */
export function hasAIConfig(): boolean {
  if (customProvider() && process.env.CUSTOM_AI_API_KEY) return true;
  return Object.values(PROVIDERS).some((p) => Boolean(process.env[p.keyEnv]));
}

/** Names of the providers that currently have a key, for messages and logs. */
export function configuredProviders(): string[] {
  const names = Object.values(PROVIDERS)
    .filter((p) => process.env[p.keyEnv])
    .map((p) => p.name);
  if (customProvider() && process.env.CUSTOM_AI_API_KEY) names.push("custom");
  return names;
}

const JSON_MODE_DISABLED = process.env.AI_DISABLE_JSON_MODE === "true";

function errorMessage(body: unknown): string {
  if (body && typeof body === "object" && "error" in body) {
    const err = (body as { error: unknown }).error;
    if (typeof err === "string") return err;
    if (err && typeof err === "object" && "message" in err) {
      return String((err as { message: unknown }).message ?? "");
    }
  }
  return "";
}

function tryParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

// Weaker models sometimes wrap JSON in prose or code fences. Parse defensively:
// strip fences, then, failing that, take the outermost balanced object.
function parseJsonObject<T>(content: string): T | null {
  const cleaned = content
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  const direct = tryParse<T>(cleaned);
  if (direct !== null) return direct;

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end > start) {
    return tryParse<T>(cleaned.slice(start, end + 1));
  }

  return null;
}

async function callOnce<T>(
  attempt: Attempt,
  system: string,
  user: string,
  maxTokens: number
): Promise<{ data: T; usage: ChatUsage; model: string }> {
  const { provider, model, key } = attempt;

  const send = (useJsonMode: boolean) =>
    fetch(provider.url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        ...(provider.extraHeaders ?? {}),
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: maxTokens,
        ...(useJsonMode ? { response_format: { type: "json_object" } } : {}),
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

  let response = await send(!JSON_MODE_DISABLED);

  // A few models accept the request but reject the JSON-mode flag. If that is
  // the only complaint, try once more without it before abandoning this model.
  if (
    !response.ok &&
    !JSON_MODE_DISABLED &&
    (response.status === 400 || response.status === 422)
  ) {
    const peek = await response.clone().json().catch(() => null);
    if (/response_format|json/i.test(errorMessage(peek))) {
      response = await send(false);
    }
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      errorMessage(body) || `${provider.name} returned ${response.status}`
    );
  }

  const content: string = body?.choices?.[0]?.message?.content ?? "";

  const usage: ChatUsage = {
    inputTokens: Number(
      body?.usage?.prompt_tokens ?? body?.usage?.input_tokens ?? 0
    ),
    outputTokens: Number(
      body?.usage?.completion_tokens ?? body?.usage?.output_tokens ?? 0
    ),
  };

  const data = parseJsonObject<T>(content);
  if (data === null) {
    throw new Error("The model did not return readable JSON.");
  }

  return { data, usage, model: `${provider.name}/${model}` };
}

/**
 * Sends a system + user prompt and returns a single parsed JSON object, trying
 * each provider in the chain until one answers. Also returns token usage for
 * metering and the model that actually served the request.
 *
 * The caller owns the shape of the JSON; this only guarantees it parsed. So a
 * slightly off response degrades in the extraction code rather than throwing.
 */
export async function chatJson<T = unknown>(
  plan: PlanTier,
  tier: TaskTier,
  system: string,
  user: string,
  maxTokens = 1600
): Promise<{ data: T; usage: ChatUsage; model: string }> {
  const attempts = resolveChain(plan, tier);

  if (attempts.length === 0) {
    throw new Error(
      "No AI provider is configured for this task. Add at least one provider key " +
        "(for example GROQ_API_KEY or OPENAI_API_KEY) in your environment variables."
    );
  }

  const failures: string[] = [];

  for (const attempt of attempts) {
    try {
      const result = await callOnce<T>(attempt, system, user, maxTokens);
      if (failures.length > 0) {
        console.info(
          `[ai] ${plan}/${tier} served by ${result.model} after ${failures.length} fallback(s)`
        );
      }
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failures.push(`${attempt.provider.name}/${attempt.model}: ${message}`);
    }
  }

  throw new Error(
    "Every configured AI provider failed for this step. " + failures.join(" | ")
  );
}
