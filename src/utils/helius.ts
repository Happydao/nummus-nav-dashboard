import { getRequiredEnv } from "./env.js";

interface RpcSuccess<T> {
  jsonrpc: string;
  id: number;
  result: T;
}

interface RpcFailure {
  jsonrpc: string;
  id: number;
  error: {
    code: number;
    message: string;
  };
}

type RpcResponse<T> = RpcSuccess<T> | RpcFailure;

export class HeliusClient {
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(options: { apiKey?: string; timeoutMs?: number } = {}) {
    this.apiKey = options.apiKey ?? getRequiredEnv("HELIUS_API_KEY");
    this.timeoutMs = options.timeoutMs ?? Number(process.env.HELIUS_TIMEOUT_MS ?? 20_000);
  }

  async rpc<T>(method: string, params: unknown): Promise<T> {
    const payload = await this.fetchJson<RpcResponse<T>>(
      `https://mainnet.helius-rpc.com/?api-key=${this.apiKey}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method,
          params
        })
      }
    );

    if ("error" in payload) {
      throw new Error(`Helius RPC ${method} failed: ${payload.error.message}`);
    }

    return payload.result;
  }

  async getEnhancedTransactionsByAddress<T>(
    address: string,
    options: { limit?: number; before?: string } = {}
  ): Promise<T[]> {
    const url = new URL(`https://api.helius.xyz/v0/addresses/${address}/transactions`);
    url.searchParams.set("api-key", this.apiKey);
    url.searchParams.set("limit", String(options.limit ?? 100));
    if (options.before) {
      url.searchParams.set("before", options.before);
    }

    return this.fetchJson<T[]>(url.toString());
  }

  private async fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    const response = await fetch(url, {
      ...init,
      signal: controller.signal
    }).finally(() => clearTimeout(timeout));

    if (!response.ok) {
      throw new Error(`Helius request failed with HTTP ${response.status}`);
    }

    return (await response.json()) as T;
  }
}
