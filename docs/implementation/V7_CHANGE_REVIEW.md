# Raport de revizuire — modificări locale V7

## Starea livrării

Branch local: `work/v7-final-decisions`, pornit din `v7-mint-escrow` la `a831b89`.
Proprietarul a autorizat commit-ul local al acestui set. Push-ul, merge-ul în main
și deployment-ul mainnet nu sunt autorizate. Hash-ul commit-ului este comunicat
separat după creare.
PR #5 din cererea anterioară este separat și nu a fost modificat în acest flux.

**Implementate: deciziile 1, 4, 7 și 8.**
**Deciziile 2, 3, 5 și 6 nu sunt prezentate ca implementate:** votul cu o singură
acțiune necesită criptare și decriptare verificabilă suplimentare. Cerința expresă
a proprietarului a fost oprirea înainte de înlocuirea cu un mecanism mai slab.
Arhitectura propusă și condițiile de acceptanță sunt documentate; codul legacy
commit/reveal și claim nu a fost înlocuit și rămâne un blocaj de lansare.

## Fișiere și schimbări

| Fișier | Schimbare |
| --- | --- |
| `contracts/GenesisHorses.sol` | Capuri și contoare independente 2.000/111/111; mint-ul public exclusiv prin sale; eliminarea mint-ului legacy în ETH care ocolea bucket-urile; capacitatea arsă nu se reemite. |
| `contracts/HOFGenesisSale.sol` | Refund către deținătorul curent verificat de Genesis; eliminarea condiției bazate pe plata inițială a caller-ului; `paidBy` devine registru istoric brut; adăugarea `refundedTo` și `totalRefunded`; burn și transfer atomic sub `nonReentrant`. |
| `contracts/HOFCommunitySeason.sol` | Excluderea nonholderilor aflați la egalitate între ei, continuând selecția către următoarele scoruri; ownership verificat la determinare; `castingTieBreak` returnează adresa zero dacă niciunul nu deține NFT. |
| `contracts/HOFSeasonRewards.sol` | Procesarea podiumului incomplet; premii fixe; rollover separat pe sezon și cumulat pentru Chapter 2; rezervă susținută de balanța tokenului; respingerea beneficiarilor duplicați și a plăților repetate. |
| `contracts/mocks/CallbackUSDC.sol` | Token adversarial exclusiv pentru teste: callback de reentrancy și transfer eșuat controlabil. |
| `test/V7CommunityCastingTieBreak.test.js` | Fixture-uri adaptate capurilor 111/111, păstrând exemplele #34 și #121 și intenția testelor. |
| `test/V7Refund.test.js` | Verificarea noii semantici istorice a `paidBy` și a registrelor de refund. |
| `test/V7FinalRefund.test.js` | Refund A→B, limite exacte de timp, sold-out, ownership, duplicate, burn definitiv, rollback, acces și reentrancy. |
| `test/V7FinalSupply.test.js` | Supply complet 2.222, capuri independente, acces, rollback și interdicția reemiterii capacității arse. |
| `test/V7FinalRollover.test.js` | 0/1/2/3 câștigători, sloturi goale, șase sezoane, plăți duplicate, reentrancy, rollback și rollover nefinanțat respins. |
| `test/V7FinalTieBreak.test.js` | Teste cu Genesis, curse și scoring reale: sărirea nonholderilor la egalitate, ownership actual, Token ID minim, păstrarea punctelor și integrarea unui podium gol cu treasury-ul real. |
| `README.md` | Starea reală a branch-ului, instrucțiuni de verificare, schimbări ABI/contabilitate și funcții încă neimplementate. |
| `docs/implementation/V7_OPEN_QUESTIONS.md` | Addendum cu cele opt decizii, separarea regulilor rezolvate de implementările blocate și clarificările restante. Fișierul lipsea de pe branch-ul de bază. |
| `docs/implementation/V7_SECRET_VOTING_ARCHITECTURE.md` | Limita hash-urilor existente, arhitectura recomandată, surse primare, presupuneri de încredere, decriptare/proof verificabile, ancore temporale și teste obligatorii pentru integrarea viitoare. |
| `docs/implementation/V7_CHANGE_REVIEW.md` | Raportul modificărilor aprobate pentru commit local; push separat. |

## Verificări efectuate

- Bază: **85 teste existente trecute**.
- După modificări: **107 teste trecute**, raport final complet, zero eșecuri.
- `npm run compile`: trecut.
- `npm test`: trecut, inclusiv regresia existentă pentru cele 60 de curse.
- `git diff --check`: trecut.
- V7 Master: păstrat byte-for-byte, blob `ae37e100ae9248bc08d9810317de34e692cca78b`;
  testul de integritate original trece fără schimbarea valorii așteptate.
- Next.js build/test: **neaplicabil acestui branch**; nu are `src`, Next.js sau script
  de build. Nu s-a importat aplicația din alt branch și nu se pretinde validarea ei.
- GitHub Actions: nu au fost pornite pentru acest set deoarece nu există push.

### Rezultate de securitate în aria modificată

- Un NFT transferat poate fi rambursat de noul deținător, nu de fostul deținător.
- NFT-ul ars nu mai poate fi transferat și nu poate genera al doilea refund.
- ID-uri duplicate, NFT-uri din alocare și ownership greșit anulează tranzacția
  completă, inclusiv arderile anterioare din aceeași cerere.
- Transferul USDC eșuat anulează burn-ul și contoarele; callback-ul nu poate
  reintra în refund sau în plățile de premii.
- Mint la timestamp-ul deadline este respins; refund-ul la deadline funcționează
  numai pentru o vânzare eșuată. Sold-out nu activează refund după deadline.
- Podiumurile duplicate, sezoanele nefinalizate și callerii neautorizați sunt
  respinși; niciun sezon nu se procesează de două ori.
- Banii raportați rămân în treasury; sumele deja raportate nu finanțează alte
  plăți Community. Nu a fost adăugat un transfer discreționar către Team/Project.

Aceste teste nu reprezintă audit independent sau verificare a unei decriptări
criptografice încă neimplementate. Finalizarea/scoring-ul legacy și costurile
la participare maximă rămân blocaje descrise în documentație.

## Puncte care necesită decizie înainte de completarea întregului flux

1. Modelul de criptare/decriptare colectivă și infrastructura acceptată. Se recomandă
   evaluarea unei soluții threshold cu dovadă de validitate a ciphertext-ului,
   dovadă de decriptare și rezultat complet verificabil on-chain. Nici providerul,
   nici verifier-ul nu au fost selectate sau implementate pe ascuns.
2. Implementarea verificabilă a publicării integrale a rezultatului și a actualizării
   automate a ambelor leaderboard-uri. Regula de eșec este acum aprobată: fără
   rezultat complet și valid, cursa rămâne nefinalizată și nu actualizează niciun
   leaderboard. Nu există override administrativ arbitrar.

## Clarificări aprobate pentru acest commit

- Chapter gap: **minimum 30 zile exacte** de la Race Reveal-ul ultimei curse din
  ultimul sezon anterior: `chapterStart >= previousChapterEnd + 30 days`.
  Startul ulterior este permis; nu există limită maximă suplimentară.
- Votul cu o singură acțiune, fără reveal/claim pentru voter, rămâne cerința finală;
  noua criptografie rămâne BLOCKER și nu se implementează acum.
- Rollover-ul rămâne earmarked pentru Prize Pool/Community rewards în Chapter 2,
  fără transfer discreționar către Team/Project. Contabilitatea separată se păstrează.
- Tie-break-ul și refund-ul implementate au fost confirmate explicit.
- Master și hash-ul de integritate rămân intacte; amendamentele se păstrează în
  addendum până la stabilirea versionării oficiale V7.1.

Scope-ul tie-break-ului este consemnat explicit: nu am introdus o regulă generală
prin care orice wallet fără NFT pierde orice premiu, indiferent de puncte.

Commit-ul local pentru fișierele din tabel este autorizat. Push-ul așteaptă
confirmare separată. Criptografia și scoring-ul legacy nu au fost modificate
prin aceste clarificări documentare.
