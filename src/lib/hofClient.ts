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
  seasonRewards: envAddress(process.env.NEXT_PUBLIC_HOF_SEASON_REWARDS_CONTRACT),
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

export const ERC20_BALANCE_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

export const GENESIS_VOTING_ABI = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "tokenOfOwnerByIndex", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "index", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "votingPowerOf", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ type: "uint256" }] },
] as const;

// Backward-compatible descriptive alias used by read-only wallet/race pages.
// It contains the same Genesis view functions and does not change contract logic.
export const GENESIS_READ_ABI = GENESIS_VOTING_ABI;

export const GENESIS_SALE_ABI = [
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [{ name: "quantity", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "refund",
    stateMutability: "nonpayable",
    inputs: [{ name: "tokenIds", type: "uint256[]" }],
    outputs: [],
  },
  { type: "function", name: "sold", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "deadline", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "soldOutAt", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "saleSuccessful", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "refundsEnabled", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
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
  { type: "function", name: "opensAt", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "closesAt", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "votingOpen", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "commitmentOf", stateMutability: "view", inputs: [{ name: "wallet", type: "address" }], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "committedVP", stateMutability: "view", inputs: [{ name: "wallet", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "revealed", stateMutability: "view", inputs: [{ name: "wallet", type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "revealedHorse", stateMutability: "view", inputs: [{ name: "wallet", type: "address" }], outputs: [{ type: "uint8" }] },
  { type: "function", name: "tokenUsed", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ type: "bool" }] },
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
  { type: "function", name: "getSeasonTop3", stateMutability: "view", inputs: [{ name: "seasonNumber", type: "uint8" }], outputs: [{ type: "address[3]" }] },
] as const;

export const HOF_LEADERBOARD_ABI = [
  { type: "function", name: "currentSeason", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "racesRecorded", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "seasonsFinalized", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "ranking", stateMutability: "view", inputs: [], outputs: [{ type: "uint8[22]" }] },
  { type: "function", name: "seasonPoints", stateMutability: "view", inputs: [{ name: "horse", type: "uint8" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "seasonHistory", stateMutability: "view", inputs: [{ name: "seasonNumber", type: "uint8" }, { name: "horse", type: "uint8" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allTimeRanking", stateMutability: "view", inputs: [], outputs: [{ type: "uint8[22]" }] },
  { type: "function", name: "allTimePoints", stateMutability: "view", inputs: [{ name: "horse", type: "uint8" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "genesisGrandChampion", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

export const SEASON_REWARDS_ABI = [
  { type: "function", name: "communityPaid", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "communityRemaining", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "hofReserved", stateMutability: "pure", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "hofSeasonAllocation", stateMutability: "pure", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "communitySeasonPaid", stateMutability: "view", inputs: [{ name: "season", type: "uint8" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "COMMUNITY_FIRST", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "COMMUNITY_SECOND", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "COMMUNITY_THIRD", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "CHAPTER_PRIZE_POOL", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
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
