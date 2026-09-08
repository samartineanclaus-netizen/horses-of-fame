const { expect } = require("chai");
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const path = require("node:path");

// Original V7 MASTER blob from main at c4e5546e39c67833a45c0ef9b3019b9ea0e0d1ca.
// Do not update this pin to make a document edit pass. Rule changes require the
// project owner's explicit approval; implementation must follow the master.
const APPROVED_V7_BLOB = "ae37e100ae9248bc08d9810317de34e692cca78b";

describe("V7 master document integrity", function () {
  it("keeps the approved V7 master byte-for-byte unchanged", function () {
    const file = path.resolve(__dirname, "../docs/tokenomics/HOF_TOKENOMICS_V7_MASTER.md");
    const bytes = readFileSync(file);
    const blobHash = createHash("sha1")
      .update(`blob ${bytes.length}\0`)
      .update(bytes)
      .digest("hex");
    expect(blobHash, "V7 master changed; correct the implementation, not the rules")
      .to.equal(APPROVED_V7_BLOB);
  });
});
