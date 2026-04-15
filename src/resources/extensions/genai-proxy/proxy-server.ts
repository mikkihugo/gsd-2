import express from "express";
import type { Server } from "http";
import {
  streamGoogleGeminiCli,
  type Context,
  type GoogleGeminiCliOptions,
  type Message,
  type Model,
  getModels,
} from "@sf-run/pi-ai";

let server: Server | null = null;
let oauth: { token: string; projectId: string } | null = null;

type GoogleGeminiCliModel = Model<"google-gemini-cli">;
type JsonRecord = Record<string, unknown>;
type GooglePart = { text?: string };
type GoogleContent = { role?: string; parts?: GooglePart[] };
type OpenAiMessage = {
  role?: string;
  content?: string | Array<{ type?: string; text?: string }>;
};

function buildGeminiCliModel(modelId: string): GoogleGeminiCliModel {
  return {
    id: modelId,
    api: "google-gemini-cli",
    provider: "google",
    name: modelId,
    baseUrl: "",
    envVar: "",
    input: "text",
    reasoning: false,
    promptCache: false,
    maxOutputTokens: 0,
  } as unknown as GoogleGeminiCliModel;
}

function normalizeGoogleContents(contents: unknown): Message[] {
  if (!Array.isArray(contents)) return [];
  return contents.map((content) => {
    const entry = content as GoogleContent;
    const role = entry.role === "user" ? "user" : "assistant";
    const text = Array.isArray(entry.parts)
      ? entry.parts.map((part) => part.text ?? "").join("")
      : "";
    return {
      role,
      content: [{ type: "text", text }],
    } as Message;
  });
}

function normalizeOpenAiMessages(messages: unknown): {
  systemPrompt: string | undefined;
  messages: Message[];
} {
  if (!Array.isArray(messages)) return { systemPrompt: undefined, messages: [] };

  const typedMessages = messages as OpenAiMessage[];
  const systemMessage = typedMessages.find((message) => message.role === "system");
  const nonSystemMessages = typedMessages.filter((message) => message.role !== "system");

  return {
    systemPrompt: typeof systemMessage?.content === "string" ? systemMessage.content : undefined,
    messages: nonSystemMessages.map((message) => {
      const text = typeof message.content === "string"
        ? message.content
        : Array.isArray(message.content)
          ? message.content.map((part) => part.text ?? "").join("")
          : "";
      return {
        role: message.role === "user" ? "user" : "assistant",
        content: [{ type: "text", text }],
      } as Message;
    }),
  };
}

function buildOptions(
  generationConfig: JsonRecord | undefined,
  oauthState: { token: string; projectId: string },
): GoogleGeminiCliOptions {
  return {
    apiKey: JSON.stringify(oauthState),
    temperature: typeof generationConfig?.temperature === "number" ? generationConfig.temperature : undefined,
    maxTokens: typeof generationConfig?.maxOutputTokens === "number" ? generationConfig.maxOutputTokens : undefined,
  };
}

export function isRunning(): boolean {
  return server !== null;
}

export async function startProxy(port: number, onLog: (msg: string) => void): Promise<void> {
  if (server) return;

  const app = express();
  app.use(express.json());

  app.get("/login", async (_req, res) => {
    try {
      const message =
        "OAuth login is not available from the extension package boundary yet. " +
        "Provide cached credentials through the hosting environment instead.";
      onLog(message);
      res.status(501).send(message);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      onLog(`Login failed: ${message}`);
      res.status(500).send(message);
    }
  });

  // 2. Models listing endpoints
  app.get(["/v1/models", "/v1beta/models"], (req, res) => {
    const providers = ["google", "google-gemini-cli", "google-vertex"] as const;
    const allModels = providers.flatMap((p) => getModels(p as any));

    const formatted = allModels.map((m) => ({
      id: m.id,
      object: "model",
      created: 1677610602,
      owned_by: "google",
      name: m.name,
      capabilities: m.capabilities,
    }));

    if (req.path.startsWith("/v1beta")) {
      res.json({ models: formatted });
    } else {
      res.json({ data: formatted, object: "list" });
    }
  });

  app.post("/v1beta/models/:modelPath", async (req, res) => {
    if (!oauth) {
      return res.status(401).json({ error: "Not authenticated. Visit /login first." });
    }

    const params = req.params as Record<string, string | undefined>;
    const modelPath = params.modelPath ?? "";
    const modelId = modelPath.replace(/:streamGenerateContent$/, "");
    const body = req.body as JsonRecord;
    const contents = body.contents;
    const systemInstruction = body.systemInstruction as JsonRecord | undefined;
    const generationConfig = body.generationConfig as JsonRecord | undefined;

    try {
      const model = buildGeminiCliModel(modelId);
      const context: Context = {
        messages: normalizeGoogleContents(contents),
        systemPrompt: typeof systemInstruction?.parts === "object"
          ? ((systemInstruction.parts as GooglePart[] | undefined)?.[0]?.text)
          : undefined,
      };
      const options = buildOptions(generationConfig, oauth);
      const stream = streamGoogleGeminiCli(model, context, options);

      res.setHeader("Content-Type", "application/json");
      for await (const event of stream) {
        if (event.type === "text_delta") {
          res.write(JSON.stringify({
            candidates: [{ content: { parts: [{ text: event.delta }] } }],
          }) + "\n");
        } else if (event.type === "error") {
          onLog(`Stream error: ${event.error.errorMessage}`);
          if (!res.headersSent) {
            res.status(500).json({ error: event.error.errorMessage });
          }
          return;
        }
      }
      res.end();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      onLog(`Proxy error: ${message}`);
      res.status(500).json({ error: message });
    }
  });

  app.post("/v1/chat/completions", async (req, res) => {
    if (!oauth) {
      return res.status(401).json({ error: "Not authenticated. Visit /login first." });
    }

    const body = req.body as JsonRecord;
    const modelId = typeof body.model === "string" ? body.model : "gemini-2.5-flash";
    const isStreaming = body.stream === true;
    const temperature = typeof body.temperature === "number" ? body.temperature : undefined;
    const maxTokens = typeof body.max_tokens === "number" ? body.max_tokens : undefined;
    const normalized = normalizeOpenAiMessages(body.messages);

    try {
      const model = buildGeminiCliModel(modelId);
      const context: Context = {
        messages: normalized.messages,
        systemPrompt: normalized.systemPrompt,
      };
      const options: GoogleGeminiCliOptions = {
        apiKey: JSON.stringify(oauth),
        temperature,
        maxTokens,
      };
      const stream = streamGoogleGeminiCli(model, context, options);

      if (isStreaming) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        for await (const event of stream) {
          if (event.type === "text_delta") {
            const chunk = {
              id: `chatcmpl-${Date.now()}`,
              object: "chat.completion.chunk",
              created: Math.floor(Date.now() / 1000),
              model: modelId,
              choices: [{
                index: 0,
                delta: { content: event.delta },
                finish_reason: null,
              }],
            };
            res.write(`data: ${JSON.stringify(chunk)}\n\n`);
          } else if (event.type === "error") {
            onLog(`OpenAI stream error: ${event.error.errorMessage}`);
            if (!res.headersSent) {
              res.status(500).json({ error: event.error.errorMessage });
            }
            return;
          }
        }

        res.write("data: [DONE]\n\n");
        res.end();
        return;
      }

      let fullContent = "";
      for await (const event of stream) {
        if (event.type === "text_delta") {
          fullContent += event.delta;
        } else if (event.type === "error") {
          onLog(`OpenAI stream error: ${event.error.errorMessage}`);
          res.status(500).json({ error: event.error.errorMessage });
          return;
        }
      }

      res.json({
        id: `chatcmpl-${Date.now()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: modelId,
        choices: [{
          index: 0,
          message: { role: "assistant", content: fullContent },
          finish_reason: "stop",
        }],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      onLog(`OpenAI proxy error: ${message}`);
      res.status(500).json({ error: message });
    }
  });

  await new Promise<void>((resolve) => {
    server = app.listen(port, () => {
      onLog(`GenAI Proxy Server running on http://localhost:${port}`);
      resolve();
    });
  });
}

export function stopProxy(): void {
  if (server) {
    server.close();
    server = null;
  }
}
