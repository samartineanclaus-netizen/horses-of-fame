function remainingSeconds(closesAt, chainTimestamp, observedAt, now) {
  return Math.max(0, Math.ceil(closesAt - chainTimestamp - Math.max(0, now-observedAt)/1000));
}
function formatCountdown(seconds) {
  const n=Math.max(0,Math.floor(seconds));
  return [Math.floor(n/3600),Math.floor(n%3600/60),n%60].map(v=>String(v).padStart(2,'0')).join(':');
}
module.exports={remainingSeconds,formatCountdown};
