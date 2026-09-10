async function preparePrizeScan(board, batchSize=25) {
 await board.beginPrizeScan();
 const epoch=await board.prizeScanEpoch();
 while(await board.prizeScanCursor()<await board.prizeScanEnd())
  await board.processPrizeHolders(epoch,await board.prizeScanCursor(),batchSize);
 while(await board.prizeScoreCursor()<251n)
  await board.processPrizeScores(epoch,await board.prizeScoreCursor(),batchSize);
}
module.exports={preparePrizeScan};
