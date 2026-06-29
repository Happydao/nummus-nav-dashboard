import { NUMMUS_MINT } from "../utils/constants.js";
import { round } from "../utils/math.js";

const DEXSCREENER_TOKEN_PAIRS_URL = "https://api.dexscreener.com/token-pairs/v1/solana";

interface DexScreenerPair {
  chainId?: string;
  dexId?: string;
  pairAddress?: string;
  url?: string;
  baseToken?: { address?: string; symbol?: string };
  quoteToken?: { address?: string; symbol?: string };
  liquidity?: { usd?: number };
}

export interface DexLiquidityPool {
  pairAddress: string;
  dexId: string;
  pairLabel: string;
  liquidityUsd: number;
  url: string | null;
}

export interface DexLiquidity {
  totalLiquidityUsd: number | null;
  poolCount: number | null;
  provider: "dexscreener";
  pools: DexLiquidityPool[];
}

export async function getCurrentDexLiquidity(): Promise<DexLiquidity> {
  try {
    const response = await fetch(`${DEXSCREENER_TOKEN_PAIRS_URL}/${NUMMUS_MINT}`);
    if (!response.ok) return unavailableLiquidity();

    const pairs = (await response.json()) as DexScreenerPair[];
    if (!Array.isArray(pairs)) return unavailableLiquidity();

    const uniquePools = new Map<string, DexLiquidityPool>();
    for (const pair of pairs) {
      const pairAddress = pair.pairAddress?.trim();
      const containsNummus =
        pair.baseToken?.address === NUMMUS_MINT || pair.quoteToken?.address === NUMMUS_MINT;
      const liquidityUsd = pair.liquidity?.usd;
      if (
        pair.chainId !== "solana" ||
        !pairAddress ||
        !containsNummus ||
        typeof liquidityUsd !== "number" ||
        !Number.isFinite(liquidityUsd) ||
        liquidityUsd <= 0
      ) {
        continue;
      }
      uniquePools.set(pairAddress.toLowerCase(), {
        pairAddress,
        dexId: pair.dexId?.trim() || "unknown",
        pairLabel: `${pair.baseToken?.symbol ?? "?"}/${pair.quoteToken?.symbol ?? "?"}`,
        liquidityUsd: round(liquidityUsd, 2) ?? liquidityUsd,
        url: pair.url ?? null
      });
    }

    if (uniquePools.size === 0) return unavailableLiquidity();
    const pools = [...uniquePools.values()].sort((a, b) => b.liquidityUsd - a.liquidityUsd);
    const totalLiquidityUsd = pools.reduce((sum, pool) => sum + pool.liquidityUsd, 0);
    return {
      totalLiquidityUsd: round(totalLiquidityUsd, 2),
      poolCount: uniquePools.size,
      provider: "dexscreener",
      pools
    };
  } catch {
    return unavailableLiquidity();
  }
}

function unavailableLiquidity(): DexLiquidity {
  return {
    totalLiquidityUsd: null,
    poolCount: null,
    provider: "dexscreener",
    pools: []
  };
}
