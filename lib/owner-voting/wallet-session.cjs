// Recheck the actual wallet after asynchronous encryption/admission, immediately
// before requesting a transaction. Never requests a second signature or account.
async function assertWalletSession(ethereum, wallet, chainId, isCurrent) {
  if (!isCurrent()) throw Error('Wallet changed. Reconnect.');
  const [accounts, chain] = await Promise.all([
    ethereum.request({method:'eth_accounts'}),
    ethereum.request({method:'eth_chainId'})
  ]);
  if (!isCurrent() || !accounts[0] || accounts[0].toLowerCase() !== wallet.toLowerCase() || BigInt(chain) !== BigInt(chainId)) {
    throw Error('Wallet or network changed. Reconnect.');
  }
}
module.exports = {assertWalletSession};
