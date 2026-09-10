// Fixture setup only: preserve total quantity/recipient while respecting the production cap.
async function mintInBatches(contract, method, args) {
 const prefix=args.slice(0,-1);let left=BigInt(args.at(-1));
 while(left>0n){const n=left>25n?25n:left;await(await contract[method](...prefix,n)).wait();left-=n;}
}
module.exports={mintInBatches};
