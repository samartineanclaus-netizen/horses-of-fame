export type EthereumProvider = {
  request: (args: {
    method: string;
    params?: unknown[] | Record<string, unknown>;
  }) => Promise<unknown>;
};

export const ROBINHOOD_TESTNET_CHAIN_ID = 46630;
export const ROBINHOOD_TESTNET_CHAIN_ID_HEX = "0xb626";
export const ROBINHOOD_TESTNET_RPC = "https://rpc.testnet.chain.robinhood.com";
export const ROBINHOOD_TESTNET_EXPLORER = "https://explorer.testnet.chain.robinhood.com";

function envAddress(value: string | undefined): `0x${string}` | null {
  if (!value || !/^0x[0-9a-fA-F]{40}$/.test(value)) return null;
  return value as `0x${string}`;
}

export const HOF_CONTRACTS = {
  genesis: envAddress(process.env.NEXT_PUBLIC_HOF_GENESIS_CONTRACT),
  sale: envAddress(process.env.NEXT_PUBLIC_HOF_GENESIS_SALE_CONTRACT),
  usdc: envAddress(process.env.NEXT_PUBLIC_HOF_USDC_CONTRACT),
  raceVoting: envAddress(process.env.NEXT_PUBLIC_HOF_RACE_VOTING_CONTRACT),
  communitySeason: envAddress(process.env.NEXT_PUBLIC_HOF_COMMUNITY_SEASON_CONTRACT),
  hofLeaderboard: envAddress(process.env.NEXT_PUBLIC_HOF_LEADERBOARD_CONTRACT),
} as const;

export const ERC20_APPROVE_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export const GENESIS_SALE_ABI = [
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [{ name: "quantity", type: "uint256" }],
    outputs: [],
  },
] as const;

export const RACE_VOTING_ABI = [
  {
    type: "function",
    name: "commitVote",
    stateMutability: "nonpayable",
    inputs: [
      { name: "commitment", type: "bytes32" },
      { name: "tokenIds", type: "uint256[]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "addVotingPower",
    stateMutability: "nonpayable",
    inputs: [{ name: "tokenIds", type: "uint256[]" }],
    outputs: [],
  },
  {
    type: "function",
    name: "revealVote",
    stateMutability: "nonpayable",
    inputs: [
      { name: "horseNumber", type: "uint8" },
      { name: "salt", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

export const COMMUNITY_SEASON_ABI = [
  {
    type: "function",
    name: "claimRacePoints",
    stateMutability: "nonpayable",
    inputs: [{ name: "race", type: "address" }],
    outputs: [],
  },
  { type: "function", name: "currentSeason", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "racesRegistered", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "seasonsFinalized", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "seasonPoints", stateMutability: "view", inputs: [{ name: "wallet", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allTimePoints", stateMutability: "view", inputs: [{ name: "wallet", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

export const HOF_LEADERBOARD_ABI = [
  { type: "function", name: "currentSeason", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "racesRecorded", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "seasonsFinalized", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "allTimeRanking", stateMutability: "view", inputs: [], outputs: [{ type: "uint8[22]" }] },
  { type: "function", name: "allTimePoints", stateMutability: "view", inputs: [{ name: "horse", type: "uint8" }], outputs: [{ type: "uint256" }] },
] as const;

export function getEthereum(): EthereumProvider | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { ethereum?: EthereumProvider }).ethereum;
}

export async function ensureRobinhoodTestnet(ethereum: EthereumProvider) {
  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: ROBINHOOD_TESTNET_CHAIN_ID_HEX }],
    });
  } catch {
    await ethereum.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: ROBINHOOD_TESTNET_CHAIN_ID_HEX,
          chainName: "Robinhood Chain Testnet",
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: [ROBINHOOD_TESTNET_RPC],
          blockExplorerUrls: [ROBINHOOD_TESTNET_EXPLORER],
        },
      ],
    });
  }
}

export async function requestAccount(ethereum: EthereumProvider): Promise<string> {
  await ensureRobinhoodTestnet(ethereum);
  const accounts = await ethereum.request({ method: "eth_requestAccounts" });
  if (!Array.isArray(accounts) || typeof accounts[0] !== "string") {
    throw new Error("No wallet account connected");
  }
  return accounts[0];
}
