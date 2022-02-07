import 'dotenv/config';
import { JsonRpcClient } from '@defichain/jellyfish-api-jsonrpc';
import { BigNumber } from '@defichain/jellyfish-api-jsonrpc/node_modules/@defichain/jellyfish-json';
import { getConfig, getHighestBidSoFar, checkRequiredSettings } from './utils';

const getMyNewBid = (highestBidSoFar, minBid, newBidRaise) => {
  if (!highestBidSoFar) return new BigNumber(minBid);
  const [highestBidAmount = ''] = highestBidSoFar.amount.split('@');
  console.log(`Eddigi legmagasabb tét: ${highestBidAmount}`);
  const highestBidNumber = new BigNumber(highestBidAmount);
  return highestBidNumber.multipliedBy(newBidRaise);
};

const placeNewBid = async (client) => {
  const { batchIndex, vaultId, newBidRaise, minBid, maxBid, myWalletAddress, bidToken } = getConfig();
  checkRequiredSettings({ vaultId, newBidRaise, minBid, maxBid, myWalletAddress, bidToken });
  const highestBidSoFar = await getHighestBidSoFar(client, vaultId, batchIndex);
  const myNewBid = getMyNewBid(highestBidSoFar, minBid, newBidRaise);
  console.log(`Új tét amit rakni akarunk: ${myNewBid.toString()}`);

  if (highestBidSoFar?.owner === myWalletAddress || myNewBid.isGreaterThan(maxBid)) {
    console.log('Nem tesszük meg a tétet mert vagy a miénk az eddigi legnagyobb tét, vagy elértük a maximumot');
    return;
  }

  try {
    const bidParams = {
      vaultId,
      index: batchIndex,
      from: myWalletAddress,
      amount: `${myNewBid.decimalPlaces(8, BigNumber.ROUND_CEIL).toFixed(8)}@${bidToken}`,
    };
    const id = await client.loan.placeAuctionBid(bidParams);
    console.log(`A tétet sikeresen megtettük a következő paraméterekkel: ${JSON.stringify(bidParams)}, ${id}`);
  } catch (error) {
    console.error('placeAuctionBid hiba', error);
  }
};

const printResult = async (client, vaultId, batchIndex) => {
  try {
    const auctionHistory = await client.loan.listAuctionHistory('all', { limit: 1000 });
    const vault = auctionHistory
      .find(auction => auction.vaultId === vaultId && auction.batchIndex === batchIndex);
    console.log('EREDMÉNY');
    console.log(JSON.stringify(vault, null, 2));
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
  const { maxBlockNumber, blockDelta, batchIndex, vaultId, clientEndpointUrl } = getConfig();
  checkRequiredSettings({ maxBlockNumber, blockDelta, vaultId, clientEndpointUrl });
  const client = new JsonRpcClient(clientEndpointUrl);

  try {
    console.log(`AUKCIÓ: https://defiscan.live/vaults/${vaultId}/auctions/${batchIndex}`);
    console.log('NE FELEJTSD EL UNLOCKOLNI A WALLETET!!!');
    console.log(' ');
    console.log('Várunk amíg elérjük a célblokkot...');
    let { height: currentBlockHeight } = await waitForBlock(() => client.blockchain.waitForBlockHeight(maxBlockNumber - blockDelta, 1000000));
    console.log( `Elértük a célblokkot. A legutolsó elkészült blokk száma ${currentBlockHeight}`);

    while (currentBlockHeight < maxBlockNumber) {
      await placeNewBid(client);
      console.log(' ');
      console.log('Várunk a következő blokkra...');
      const { height } = await waitForBlock(() => client.blockchain.waitForNewBlock(1000000));
      console.log(`Új blokk készült el: ${height}`);
      currentBlockHeight = height;
    }
  } catch (error) {
    console.error('wait for block hiba', error);
  }

  await printResult(client, vaultId, batchIndex);
};

run()
  .then(() => {
    console.log('FINISHED');
  });
