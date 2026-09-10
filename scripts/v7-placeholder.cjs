const metadata = require('../public/genesis/unrevealed.json');
const TESTNET_CHAIN_ID = 46630n;
const MINT_WINDOW_SECONDS = 604800n;
function publicURL(value) {
  if (typeof value !== 'string' || /[<>{}\s]|%3c|%3e|placeholder|your[_-]|verified-testnet-site-domain/i.test(value)) throw Error('Real public placeholder URL required');
  let url;
  try { url = new URL(value); } catch { throw Error('Invalid placeholder URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !url.hostname.includes('.') || /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.)|\.(localhost|local|invalid|test|example)$|^example\.(com|net|org)$/i.test(url.hostname)) throw Error('Public HTTPS URL required');
  if (url.pathname !== '/genesis/unrevealed.json') throw Error('Expected full canonical Genesis JSON URL');
  return url;
}
async function validatePlaceholder(uri, chainId, fetcher = globalThis.fetch) {
  // This asset is never approved for any production chain.
  if (BigInt(chainId) !== TESTNET_CHAIN_ID) throw Error('TESTNET metadata forbidden outside Robinhood Testnet');
  const url = publicURL(uri);
  const get = async (target) => {
    const response = await fetcher(target, {redirect: 'error', signal: AbortSignal.timeout(10000)});
    if (response.status !== 200) throw Error('Placeholder resource must return HTTP 200');
    return response;
  };
  const response = await get(url.href);
  const body = await response.text();
  if (Buffer.byteLength(body) > 16384) throw Error('Placeholder JSON too large');
  let data;
  try { data = JSON.parse(body); } catch { throw Error('Invalid placeholder JSON'); }
  if (!data || Array.isArray(data) || Object.keys(data).sort().join(',') !== 'description,image,name' || Object.keys(metadata).some(key => data[key] !== metadata[key])) throw Error('Expected canonical unrevealed metadata without traits, rarity, VP or horse identity');
  const imageURL = new URL(data.image, url).href;
  const image = await get(imageURL);
  if (!/^image\/webp(?:;|$)/i.test(image.headers.get('content-type') || '')) throw Error('Expected WebP image');
  const bytes = new Uint8Array(await image.arrayBuffer());
  if (bytes.length < 12 || Buffer.from(bytes.subarray(0,4)).toString() !== 'RIFF' || Buffer.from(bytes.subarray(8,12)).toString() !== 'WEBP') throw Error('Invalid WebP image');
  return {uri:url.href,image:imageURL};
}
module.exports = {validatePlaceholder, publicURL, MINT_WINDOW_SECONDS};
