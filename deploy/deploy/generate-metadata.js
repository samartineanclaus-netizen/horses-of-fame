const fs = require("fs");
const path = require("path");

const MAX_SUPPLY = 2222;

const OUTPUT_DIR = path.join(
  process.cwd(),
  "public",
  "metadata"
);

function getTraits(tokenId) {
  if (tokenId <= 22) {
    return { rarity: "Hall of Fame", votingPower: 0 };
  }

  if (tokenId <= 212) {
    return { rarity: "Legendary", votingPower: 5 };
  }

  if (tokenId <= 452) {
    return { rarity: "Epic", votingPower: 4 };
  }

  if (tokenId <= 772) {
    return { rarity: "Rare", votingPower: 3 };
  }

  if (tokenId <= 1252) {
    return { rarity: "Uncommon", votingPower: 2 };
  }

  return { rarity: "Common", votingPower: 1 };
}

function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  for (let tokenId = 1; tokenId <= MAX_SUPPLY; tokenId++) {
    const { rarity, votingPower } = getTraits(tokenId);

    const metadata = {
      name: `Horses of Fame - Genesis #${tokenId}`,
      description:
        "Horses of Fame Genesis NFT on Robinhood Chain.",
      image: `https://hof-site.vercel.app/nft/${tokenId}.png`,
      attributes: [
        {
          trait_type: "Rarity",
          value: rarity
        },
        {
          trait_type: "Voting Power",
          value: votingPower
        },
        {
          trait_type: "Chapter",
          value: "Genesis"
        }
      ]
    };

    fs.writeFileSync(
      path.join(OUTPUT_DIR, `${tokenId}.json`),
      JSON.stringify(metadata, null, 2)
    );
  }

  console.log(`Generated ${MAX_SUPPLY} metadata files.`);
  console.log(`Output: ${OUTPUT_DIR}`);
}

main();
