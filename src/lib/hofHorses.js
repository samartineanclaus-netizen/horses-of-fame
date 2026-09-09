const records = require('../data/hofHorses.json');

const hofHorses = Object.freeze(records.map(record => Object.freeze({...record})));
const horsesByNumber = new Map(hofHorses.map(horse => [horse.number, horse]));

function getHofHorse(number) {
  if (!['number','string','bigint'].includes(typeof number)) throw new Error('Unknown HOF horse number');
  const value = Number(number);
  const horse=horsesByNumber.get(value);
  if (!Number.isInteger(value) || !horse) throw new Error('Unknown HOF horse number');
  return horse;
}
function formatHofNumber(number) {
  return `#${String(getHofHorse(number).number).padStart(4, '0')}`;
}
function hofHorseAlt(number) {
  const horse = getHofHorse(number);
  return `${horse.name} — ${horse.breed}, HOF ${formatHofNumber(number)}`;
}

module.exports = {hofHorses,getHofHorse,formatHofNumber,hofHorseAlt};
