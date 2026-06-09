import OpenAI from "openai";
const REQUEST_TIMEOUT_MS = 180000;

function getEnvFallbackKey() {
  const fromPreload = window?.electronEnv?.OPENAI_API_KEY;
  const fromEnv = typeof process !== "undefined" ? process?.env?.OPENAI_API_KEY : "";
  return fromPreload || fromEnv || "";
}

function resolveLlmConfig(llmConfig) {
  const provider = llmConfig?.provider || "openai";
  const baseUrl = llmConfig?.baseUrl || "https://api.openai.com/v1";
  const model = llmConfig?.model || "gpt-5.4-mini";
  const apiKey =
    llmConfig?.apiKey || (provider === "openai" ? getEnvFallbackKey() : "");
  return {
    provider,
    baseUrl,
    model,
    apiKey
  };
}

function createClientOrThrow(llmConfig) {
  const resolved = resolveLlmConfig(llmConfig);
  if (!resolved.apiKey) {
    if (resolved.provider === "kimi_cn") {
      throw new Error("Missing Kimi Open Platform API key. Please set it in AI Provider settings.");
    }
    throw new Error("Missing OpenAI API key. Please set it in AI Provider settings.");
  }
  const client = new OpenAI({
    apiKey: resolved.apiKey,
    baseURL: resolved.baseUrl,
    timeout: REQUEST_TIMEOUT_MS,
    dangerouslyAllowBrowser: true
  });
  return { client, resolved };
}

async function withTimeout(promise, label) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(REQUEST_TIMEOUT_MS / 1000)}s.`));
    }, REQUEST_TIMEOUT_MS);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}

function extractUsageFromResponseUsage(usage) {
  if (!usage) return null;
  return {
    inputTokens:
      typeof usage.input_tokens === "number"
        ? usage.input_tokens
        : typeof usage.prompt_tokens === "number"
          ? usage.prompt_tokens
          : null,
    outputTokens:
      typeof usage.output_tokens === "number"
        ? usage.output_tokens
        : typeof usage.completion_tokens === "number"
          ? usage.completion_tokens
          : null,
    totalTokens:
      typeof usage.total_tokens === "number" ? usage.total_tokens : null
  };
}

function firstNonEmptyString(values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function formatProviderError(err, provider) {
  const providerLabel = provider === "kimi_cn" ? "Kimi (CN)" : "OpenAI";
  const message =
    err instanceof Error ? err.message : "Unknown provider error";
  if (/connection error/i.test(message)) {
    return `${providerLabel} connection error. Please check base URL, API key, and network.`;
  }
  return `${providerLabel} request failed: ${message}`;
}

async function invokeLlmText({ client, resolved, prompt }) {
  try {
    // Prefer Responses API; if provider does not support it, fallback below.
    const response = await withTimeout(
      client.responses.create({
        model: resolved.model,
        input: prompt
      }),
      `${resolved.provider} responses request`
    );
    const text = response.output_text?.trim();
    if (!text) {
      throw new Error("Provider returned an empty response.");
    }
    return {
      text,
      usage: extractUsageFromResponseUsage(response?.usage)
    };
  } catch (err) {
    const shouldFallbackToChat =
      resolved.provider === "kimi_cn" &&
      /not found|unsupported|responses|404|connection error/i.test(
        err instanceof Error ? err.message : ""
      );

    if (!shouldFallbackToChat) {
      throw new Error(formatProviderError(err, resolved.provider));
    }

    try {
      const chat = await withTimeout(
        client.chat.completions.create({
          model: resolved.model,
          messages: [
            {
              role: "system",
              content:
                "Return only the requested final output. Be concise and avoid extra narration."
            },
            { role: "user", content: prompt }
          ],
          temperature: 1,
          max_tokens: 900
        }),
        `${resolved.provider} chat completion request`
      );
      const firstChoice = chat.choices?.[0] || {};
      const msg = firstChoice.message || {};
      const text = firstNonEmptyString([
        msg.content,
        msg.reasoning_content,
        firstChoice.text,
        typeof msg.tool_calls === "string" ? msg.tool_calls : "",
        typeof chat?.output_text === "string" ? chat.output_text : ""
      ]);
      if (!text) {
        throw new Error("Provider returned an empty chat completion.");
      }
      return {
        text,
        usage: extractUsageFromResponseUsage(chat?.usage)
      };
    } catch (fallbackErr) {
      throw new Error(formatProviderError(fallbackErr, resolved.provider));
    }
  }
}

export async function testProviderConnection({ llmConfig }) {
  const { client, resolved } = createClientOrThrow(llmConfig);
  const startedAt = Date.now();
  const { text } = await invokeLlmText({
    client,
    resolved,
    prompt: "Reply with exactly: OK"
  });
  return {
    ok: /ok/i.test(text),
    provider: resolved.provider,
    model: resolved.model,
    latencyMs: Date.now() - startedAt,
    rawText: text
  };
}

function strictnessInstruction(strictness) {
  if (strictness === "easy") {
    return "Easy mode: If student logic is mostly correct, give partial credit generously.";
  }
  if (strictness === "strict") {
    return "Strict mode: Enforce the rubric tightly and deduct clearly for each missing or incorrect requirement.";
  }
  return "Balanced mode: Follow the rubric faithfully with fair partial credit when appropriate.";
}

function buildPrompt({
  language,
  strictness,
  questions,
  rubric,
  sampleAnswer,
  code,
  noPenaltyRules
}) {
  const globalRulesSection = noPenaltyRules
    ? noPenaltyRules
    : "Not enabled for this grading run.";

  return `=== LANGUAGE ===
${language}

=== STRICTNESS LEVEL ===
${strictness}

=== GLOBAL RULES (LANGUAGE-SPECIFIC) ===
${globalRulesSection}

=== ASSIGNMENT QUESTION ===
${questions}

=== RUBRIC ===
${rubric}

=== SAMPLE ANSWER (REFERENCE ONLY) ===
${sampleAnswer || "None provided."}

=== STUDENT CODE ===
${code}

=== INSTRUCTIONS ===
1. Grade according to the rubric as the scoring standard.
2. Treat sample answer as reference only; do not require exact match.
3. Follow global rules if provided and apply them consistently.
4. Follow strictness level consistently: ${strictnessInstruction(strictness)}
5. Be fair and consistent.
6. Return ONLY valid JSON.

Return ONLY valid JSON in this format:
{
  "total_score": number,
  "criteria": [
    {
      "name": "string",
      "score": number,
      "max_score": number,
      "reason": "string"
    }
  ],
  "strengths": ["string"],
  "bugs": ["string"],
  "suggestions": ["string"],
  "feedback": "string"
}

For each criterion:
- "score" = points the student earned for that item (0 up to max_score).
- "max_score" = total points possible for that criterion (infer from the rubric, e.g. comments like "# 4分", "2 points", section weights).

Important: total_score MUST exactly equal the sum of every criteria[].score. Do not output a total that disagrees with the breakdown. Each score must be <= its max_score.`;
}

export function parseModelJson(rawText) {
  const trimmed = rawText.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const jsonCandidate = fenced ? fenced[1] : trimmed;

  try {
    return JSON.parse(jsonCandidate);
  } catch {
    // Fallback: extract first balanced JSON object from mixed text.
    const start = jsonCandidate.indexOf("{");
    if (start < 0) {
      throw new Error(`Model did not return JSON. Raw output starts with: ${trimmed.slice(0, 80)}`);
    }
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < jsonCandidate.length; i += 1) {
      const ch = jsonCandidate[i];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === "\\") {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
      } else if (ch === '"') {
        inString = true;
      } else if (ch === "{") {
        depth += 1;
      } else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          const objectText = jsonCandidate.slice(start, i + 1);
          return JSON.parse(objectText);
        }
      }
    }
    throw new Error(`Unable to parse JSON from model output. Raw starts with: ${trimmed.slice(0, 80)}`);
  }
}

export async function gradeAssignment({
  language,
  strictness,
  questions,
  rubric,
  sampleAnswer,
  code,
  noPenaltyRules,
  llmConfig
}) {
  const { client, resolved } = createClientOrThrow(llmConfig);

  const prompt = buildPrompt({
    language,
    strictness,
    questions,
    rubric,
    sampleAnswer,
    code,
    noPenaltyRules
  });

  const { text } = await invokeLlmText({ client, resolved, prompt });

  return text;
}

export async function gradeAssignmentWithMeta({
  language,
  strictness,
  questions,
  rubric,
  sampleAnswer,
  code,
  noPenaltyRules,
  llmConfig
}) {
  const { client, resolved } = createClientOrThrow(llmConfig);

  const prompt = buildPrompt({
    language,
    strictness,
    questions,
    rubric,
    sampleAnswer,
    code,
    noPenaltyRules
  });

  const { text, usage } = await invokeLlmText({ client, resolved, prompt });

  return {
    rawText: text,
    usage
  };
}

export async function splitAndRefineRubric({
  mixedText,
  totalScore,
  llmConfig
}) {
  const { client, resolved } = createClientOrThrow(llmConfig);

  const prompt = `You are an expert teaching assistant.

Split the following mixed content into:
1) rubric
2) sample_answer

Mixed content often has Python code plus Chinese scoring notes such as:
- 4分 / 2分 / 为1分
- return 为1分
- concatenation 为1分
- 打印为1分

Rules:
- Keep executable/reference code in sample_answer.
- Move scoring notes/instructions into rubric.
- If a line has code plus inline grading comment, keep code in sample_answer and move comment meaning to rubric.
- Remove grading comments from sample_answer code.
- Refine rubric to be clear and teacher-friendly with bullet points and explicit point breakdown where possible.
- Sample answer is reference only, not the only correct implementation.
- If question total score is provided, make rubric criteria add up to that total score.
- Include a clear first rubric line like "Total score: X" when total score is provided.

Return ONLY valid JSON:
{
  "rubric": "string",
  "sample_answer": "string"
}

=== MIXED CONTENT ===
${mixedText}

=== QUESTION TOTAL SCORE (OPTIONAL) ===
${totalScore || "Not provided"}`;

  const { text } = await invokeLlmText({ client, resolved, prompt });

  const parsed = parseModelJson(text);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof parsed.rubric !== "string" ||
    typeof parsed.sample_answer !== "string"
  ) {
    throw new Error("AI split returned invalid JSON format.");
  }

  return {
    rubric: parsed.rubric.trim(),
    sampleAnswer: parsed.sample_answer.trim()
  };
}

export async function assistGlobalRubric({
  language,
  existingGlobalRubric,
  request,
  llmConfig
}) {
  if (!request?.trim()) {
    throw new Error("Please enter a request for the AI assistant.");
  }

  const { client, resolved } = createClientOrThrow(llmConfig);

  const prompt = `You are an assistant helping a teacher write global grading rules.

Task:
- Read the teacher request and existing global rubric.
- Return an improved global rubric text that is ready to paste into the app.
- Keep it concise, clear, and actionable.
- Use bullet points.
- Do not include anything outside JSON.

Return ONLY valid JSON:
{
  "global_rubric": "string",
  "note": "string"
}

Requirements:
- "global_rubric" is the complete revised rubric text (not a diff).
- Preserve useful existing rules when possible.
- Add new rules requested by teacher.
- "note" is a short one-line summary of what changed.

=== LANGUAGE ===
${language || "Not specified"}

=== EXISTING GLOBAL RUBRIC ===
${existingGlobalRubric || "None"}

=== TEACHER REQUEST ===
${request}`;

  const { text } = await invokeLlmText({ client, resolved, prompt });

  const parsed = parseModelJson(text);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof parsed.global_rubric !== "string" ||
    typeof parsed.note !== "string"
  ) {
    throw new Error("AI assistant returned invalid JSON format.");
  }

  return {
    globalRubric: parsed.global_rubric.trim(),
    note: parsed.note.trim()
  };
}
