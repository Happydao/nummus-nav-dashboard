import { DEFAULT_SOLANA_RPC_URL } from "./constants.js";

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

export class SolanaRpcClient {
  constructor(
    private readonly rpcUrl = process.env.SOLANA_RPC_URL ?? DEFAULT_SOLANA_RPC_URL,
    private readonly timeoutMs = Number(process.env.SOLANA_RPC_TIMEOUT_MS ?? 20_000)
  ) {}

  async call<T>(method: string, params: unknown[] = []): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    const response = await fetch(this.rpcUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      signal: controller.signal,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method,
        params
      })
    }).finally(() => clearTimeout(timeout));

    if (!response.ok) {
      throw new Error(`Solana RPC ${method} failed with HTTP ${response.status}`);
    }

    const payload = (await response.json()) as RpcResponse<T>;
    if ("error" in payload) {
      throw new Error(`Solana RPC ${method} failed: ${payload.error.message}`);
    }

    return payload.result;
  }
}
