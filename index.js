require('dotenv').config();
const { JsonRpcClient } = require('@defichain/jellyfish-api-jsonrpc');
const { BigNumber } = require('@defichain/jellyfish-api-jsonrpc/node_modules/@defichain/jellyfish-json');
const { getConfig, getHighestBidSoFar, checkRequiredSettings } = require('./utils');

const getMyNewBid = (highestBidSoFar, minBid, newBidRaise, vaultId, batchIndex) => {
  if (!highestBidSoFar) return new BigNumber(minBid);
  const [highestBidAmount = ''] = highestBidSoFar.amount.split('@');
  console.log(`Eddigi legmagasabb tét (${vaultId}/${batchIndex}):`);
  console.log(highestBidSoFar);
  const highestBidNumber = new BigNumber(highestBidAmount);
  return highestBidNumber.multipliedBy(newBidRaise);
};

const placeNewBid = async (client, myWalletAddress, { vaultId, newBidRaise, minBid, maxBid, bidToken, batchIndex }) => {
  console.log(`AUKCIÓ: https://defiscan.live/vaults/${vaultId}/auctions/${batchIndex}\n`);
  const highestBidSoFar = await getHighestBidSoFar(client, vaultId, batchIndex);
  const myNewBid = getMyNewBid(highestBidSoFar, minBid, newBidRaise, vaultId, batchIndex);
  console.log(`\nÚj tét amit tenni akarunk (${vaultId}/${batchIndex}): ${myNewBid.toString()}`);

  if (highestBidSoFar?.owner === myWalletAddress || myNewBid.isGreaterThan(maxBid)) {
    console.log('Nem tesszük meg a tétet mert vagy a miénk az eddigi legnagyobb tét, vagy elértük a maximumot\n');
    return;
  }

  try {
    const bidAmount = myNewBid.decimalPlaces(8, BigNumber.ROUND_CEIL).toFixed(8);
    console.log(`EZT AKARJUK RAKNI: placeauctionbid ${vaultId} ${batchIndex} ${myWalletAddress} "${bidAmount}@${bidToken}"\n`);
    const bidParams = {
      vaultId,
      index: batchIndex,
      from: myWalletAddress,
      amount: `${bidAmount}@${bidToken}`,
    };
    const id = await client.loan.placeAuctionBid(bidParams);
    console.log(`A tétet sikeresen megtettük a következő paraméterekkel: ${JSON.stringify(bidParams)}, ${id}\n`);
  } catch (error) {
    console.error('placeAuctionBid hiba', error);
  }
};

const printResult = async (client, auctions) => {
  try {
    const auctionHistory = await client.loan.listAuctionHistory('all', { limit: 1000 });
    console.log('EREDMÉNY');
    for (let index = 0; index < auctions.length; index += 1) {
      const { vaultId, batchIndex } = auctions[index];
      const vault = auctionHistory
        .find(auction => auction.vaultId === vaultId && auction.batchIndex === batchIndex);
      console.log(JSON.stringify(vault, null, 2));
    }
  } catch (error) {
    console.error('listAuctionHistory hiba', error);
  }
};

const waitForBlock = async (apiCall) => {
  let block = null;
  while (!block) {
    try {
      block = await apiCall();
    } catch (error) {
      if (!error.message.includes('timeout of 60000ms')) {
        console.error('waitForBlock hiba', error);
      }
    }
  }
  return block;
};

const run = async () => {
  const { maxBlockNumber, blockDelta, clientEndpointUrl, myWalletAddress } = getConfig();
  checkRequiredSettings({ maxBlockNumber, blockDelta, clientEndpointUrl, myWalletAddress });
  const client = new JsonRpcClient(clientEndpointUrl);
  const auctions = [
  ];

  try {
    console.log('NE FELEJTSD EL UNLOCKOLNI A WALLETET!!!\n');
    console.log('Várunk amíg elérjük a célblokkot...\n');
    let { height: currentBlockHeight } = await waitForBlock(() => client.blockchain.waitForBlockHeight(maxBlockNumber - blockDelta, 1000000));
    console.log(`Elértük a célblokkot. A legutolsó elkészült blokk száma ${currentBlockHeight}\n`);

    while (currentBlockHeight < maxBlockNumber) {
      auctions.forEach(auction => placeNewBid(client, myWalletAddress, auction));
      console.log(' ');
      console.log('Várunk a következő blokkra...');
      const { height } = await waitForBlock(() => client.blockchain.waitForNewBlock(1000000));
      console.log(`Új blokk készült el: ${height}`);
      currentBlockHeight = height;
    }
  } catch (error) {
    console.error('wait for block hiba', error);
  }

  await printResult(client, auctions);
};

run()
  .then(() => {
    console.log('FINISHED');
  });
