export interface JsonChatContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
    url: string;
  };
}

export interface JsonChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | JsonChatContentPart[];
}

interface OpenAIChatCompletionsResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
}

interface OpenAIResponsesResponse {
  output_text?: string;
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

function extractJsonObject(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  throw new Error('No JSON object found in model response');
}

async function requestJsonViaChatCompletions(
  baseUrl: string,
  model: string,
  messages: JsonChatMessage[],
  fetchImpl: typeof fetch,
  apiKey?: string
) {
  const response = await fetchImpl(`${stripTrailingSlash(baseUrl)}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model,
      messages: messages.map((message) => ({
        role: message.role,
        content:
          typeof message.content === 'string'
            ? message.content
            : message.content.map((part) =>
                part.type === 'text'
                  ? { type: 'text', text: part.text ?? '' }
                  : { type: 'image_url', image_url: part.image_url }
              ),
      })),
      temperature: 0.1,
      response_format: {
        type: 'json_object',
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Chat completions request failed with status ${response.status}: ${errorBody}`);
  }

  const payload = (await response.json()) as OpenAIChatCompletionsResponse;
  const content = payload.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    throw new Error('Chat completions response did not include message content');
  }

  return JSON.parse(extractJsonObject(content)) as unknown;
}

async function requestJsonViaResponses(
  baseUrl: string,
  model: string,
  messages: JsonChatMessage[],
  fetchImpl: typeof fetch,
  apiKey: string
) {
  const response = await fetchImpl(`${stripTrailingSlash(baseUrl)}/responses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: messages.map((message) => ({
        role: message.role,
        content: [
          {
            type: 'input_text',
            text: message.content,
          },
        ],
      })),
      text: {
        format: {
          type: 'json_object',
        },
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Responses request failed with status ${response.status}: ${errorBody}`);
  }

  const payload = (await response.json()) as OpenAIResponsesResponse;
  if (!payload.output_text) {
    throw new Error('Responses API did not include output_text');
  }

  return JSON.parse(extractJsonObject(payload.output_text)) as unknown;
}

export async function requestStructuredJson(
  messages: JsonChatMessage[],
  fetchImpl: typeof fetch = fetch
) {
  const localBaseUrl = process.env.OMLX_BASE_URL ?? 'http://127.0.0.1:8000/v1';
  const localModel = process.env.OMLX_MODEL ?? 'Qwen2.5-VL-7B-Instruct';
  const openaiBaseUrl = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
  const openaiModel = process.env.OPENAI_MODEL ?? 'gpt-5-mini';
  const openaiApiKey = process.env.OPENAI_API_KEY;

  try {
    return await requestJsonViaChatCompletions(
      localBaseUrl,
      localModel,
      messages,
      fetchImpl
    );
  } catch (localError) {
    if (!openaiApiKey) {
      throw localError;
    }

    return requestJsonViaResponses(
      openaiBaseUrl,
      openaiModel,
      messages,
      fetchImpl,
      openaiApiKey
    );
  }
}
