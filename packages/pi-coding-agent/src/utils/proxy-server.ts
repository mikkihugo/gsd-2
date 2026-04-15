import express from "express";
import type { Server } from "http";
import {
	getModels,
	stream,
	type Context,
	type Message,
	type Model,
	type StreamOptions,
} from "@sf-run/pi-ai";
import { AuthStorage } from "../core/auth-storage.js";
import { ModelRegistry } from "../core/model-registry.js";

export type ProxyServerOptions = {
	port: number;
	authStorage: AuthStorage;
	modelRegistry: ModelRegistry;
	onLog?: (msg: string) => void;
};

export class ProxyServer {
	private server: Server | null = null;

	constructor(private options: ProxyServerOptions) {}

	async start(): Promise<void> {
		if (this.server) return;

		const app = express();
		app.use(express.json());

		const { authStorage, modelRegistry, onLog } = this.options;

		const log = (msg: string) => onLog?.(msg);

		// 1. Model Listing
		app.get(["/v1/models", "/v1beta/models"], async (req, res) => {
			const providers = ["google", "google-gemini-cli", "google-vertex", "anthropic", "openai"];
			const allModels = providers.flatMap((p) => getModels(p as any));

			const formatted = allModels.map((m) => ({
				id: m.id,
				object: "model",
				created: 1677610602,
				owned_by: m.provider,
				name: m.name,
				capabilities: m.capabilities,
			}));

			if (req.path.startsWith("/v1beta")) {
				res.json({ models: formatted });
			} else {
				res.json({ data: formatted, object: "list" });
			}
		});

		// 2. Chat Completions (OpenAI & GenAI)
		const handleChat = async (req: express.Request, res: express.Response) => {
			const body = req.body;
			const isOpenAi = req.path.includes("/v1/chat/completions");
			const modelId = isOpenAi ? body.model : req.params.modelId?.replace(/:streamGenerateContent$/, "");
			
			if (!modelId) {
				return res.status(400).json({ error: "Model ID is required" });
			}

			try {
				// Resolve model and provider
				const resolvedModel = modelRegistry.getModel(modelId);
				if (!resolvedModel) {
					return res.status(404).json({ error: `Model ${modelId} not found` });
				}

				// Resolve API key
				const apiKey = await authStorage.getApiKey(resolvedModel.provider);
				if (!apiKey) {
					return res.status(401).json({ error: `No API key for provider ${resolvedModel.provider}. Use /login first.` });
				}

				// Normalize messages
				const context: Context = isOpenAi 
					? this.normalizeOpenAi(body)
					: this.normalizeGoogle(body);

				const streamOptions: StreamOptions = {
					apiKey,
					temperature: body.temperature,
					maxTokens: isOpenAi ? body.max_tokens : body.generationConfig?.maxOutputTokens,
				};

				const eventStream = stream(resolvedModel as any, context, streamOptions);

				if (body.stream) {
					this.handleStreamingResponse(eventStream, res, isOpenAi, modelId);
				} else {
					await this.handleStaticResponse(eventStream, res, isOpenAi, modelId);
				}

			} catch (err: any) {
				log(`Proxy error: ${err.message}`);
				res.status(500).json({ error: err.message });
			}
		};

		app.post("/v1/chat/completions", handleChat);
		app.post("/v1beta/models/:modelId\\:streamGenerateContent", handleChat);

		return new Promise((resolve) => {
			this.server = app.listen(this.options.port, () => {
				log(`Proxy Server running on http://localhost:${this.options.port}`);
				resolve();
			});
		});
	}

	stop(): void {
		if (this.server) {
			this.server.close();
			this.server = null;
		}
	}

	private normalizeOpenAi(body: any): Context {
		const messages = body.messages || [];
		const system = messages.find((m: any) => m.role === "system")?.content;
		const history = messages.filter((m: any) => m.role !== "system").map((m: any) => ({
			role: m.role === "user" ? "user" : "assistant",
			content: typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content,
		}));
		return { messages: history, systemPrompt: system };
	}

	private normalizeGoogle(body: any): Context {
		const contents = body.contents || [];
		const history = contents.map((c: any) => ({
			role: c.role === "user" ? "user" : "assistant",
			content: (c.parts || []).map((p: any) => ({ type: "text", text: p.text })),
		}));
		const system = body.systemInstruction?.parts?.[0]?.text;
		return { messages: history, systemPrompt: system };
	}

	private handleStreamingResponse(eventStream: any, res: express.Response, isOpenAi: boolean, modelId: string) {
		res.setHeader("Content-Type", isOpenAi ? "text/event-stream" : "application/json");
		
		eventStream.on("data", (ev: any) => {
			if (ev.type === "text_delta") {
				if (isOpenAi) {
					const chunk = {
						id: `chatcmpl-${Date.now()}`,
						object: "chat.completion.chunk",
						created: Math.floor(Date.now() / 1000),
						model: modelId,
						choices: [{ index: 0, delta: { content: ev.delta }, finish_reason: null }],
					};
					res.write(`data: ${JSON.stringify(chunk)}\n\n`);
				} else {
					const chunk = { candidates: [{ content: { parts: [{ text: ev.delta }] } }] };
					res.write(JSON.stringify(chunk) + "\n");
				}
			}
		});

		eventStream.on("done", () => {
			if (isOpenAi) res.write("data: [DONE]\n\n");
			res.end();
		});

		eventStream.on("error", (ev: any) => {
			if (!res.headersSent) res.status(500).json({ error: ev.error.errorMessage });
			else res.end();
		});
	}

	private async handleStaticResponse(eventStream: any, res: express.Response, isOpenAi: boolean, modelId: string) {
		let fullContent = "";
		eventStream.on("data", (ev: any) => {
			if (ev.type === "text_delta") fullContent += ev.delta;
		});

		return new Promise<void>((resolve) => {
			eventStream.on("done", () => {
				if (isOpenAi) {
					res.json({
						id: `chatcmpl-${Date.now()}`,
						object: "chat.completion",
						created: Math.floor(Date.now() / 1000),
						model: modelId,
						choices: [{ index: 0, message: { role: "assistant", content: fullContent }, finish_reason: "stop" }],
					});
				} else {
					res.json({ candidates: [{ content: { parts: [{ text: fullContent }] } }] });
				}
				resolve();
			});
			eventStream.on("error", (ev: any) => {
				res.status(500).json({ error: ev.error.errorMessage });
				resolve();
			});
		});
	}
}
