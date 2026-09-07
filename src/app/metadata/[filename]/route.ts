import { NextResponse } from "next/server";

const MAX_SUPPLY = 2222;

function getTraits(id: number) {
  if (id <= 22) return { rarity: "Hall of Fame", votingPower: 0 };
  if (id <= 212) return { rarity: "Legendary", votingPower: 5 };
  if (id <= 452) return { rarity: "Epic", votingPower: 4 };
  if (id <= 772) return { rarity: "Rare", votingPower: 3 };
  if (id <= 1252) return { rarity: "Uncommon", votingPower: 2 };

  return { rarity: "Common", votingPower: 1 };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ filename: string }> }
) {
  const { filename } = await context.params;

  if (!filename.endsWith(".json")) {
    return NextResponse.json(
      { error: "Invalid metadata filename" },
      { status: 404 }
    );
  }

  const tokenId = Number(filename.replace(".json", ""));

  if (
    !Number.isInteger(tokenId) ||
    tokenId < 1 ||
    tokenId > MAX_SUPPLY
  ) {
    return NextResponse.json(
      { error: "Invalid Genesis token ID" },
      { status: 404 }
    );
  }

  const { rarity, votingPower } = getTraits(tokenId);

  return NextResponse.json({
    name: `Horses of Fame - Genesis #${tokenId}`,
    description: "Horses of Fame Genesis NFT on Robinhood Chain.",
    image: `https://hof-site.vercel.app/nft/${tokenId}.png`,
    attributes: [
      {
        trait_type: "Rarity",
        value: rarity,
      },
      {
        trait_type: "Voting Power",
        value: votingPower,
      },
      {
        trait_type: "Chapter",
        value: "Genesis",
      },
    ],
  });
}
