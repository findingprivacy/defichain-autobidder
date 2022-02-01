import 'dotenv/config';
import { JsonRpcClient } from '@defichain/jellyfish-api-jsonrpc';
import { BigNumber } from '@defichain/jellyfish-api-jsonrpc/node_modules/@defichain/jellyfish-json';
import { getConfig, logInfo, logError, getHighestBidSoFar, checkRequiredSettings } from './utils';

const getMyNewBid = (highestBidSoFar, minBid, newBidRaise) => {
  if (!highestBidSoFar) return new BigNumber(minBid);
  const [highestBidAmount = ''] = highestBidSoFar.amount.split('@');
  const highestBidNumber = new BigNumber(highestBidAmount);
  return highestBidNumber.multipliedBy(newBidRaise);
};

const placeNewBid = async (client, logger) => {
  const { batchIndex, vaultId, newBidRaise, minBid, maxBid, myWalletAddress, bidToken } = getConfig();
  checkRequiredSettings({ vaultId, newBidRaise, minBid, maxBid, myWalletAddress, bidToken });
  const highestBidSoFar = getHighestBidSoFar(client, logger, vaultId, batchIndex);
  logInfo(logger, `Eddigi legmagasabb tét: ${highestBidSoFar}`);
  const myNewBid = getMyNewBid(highestBidSoFar, minBid, newBidRaise);
  logInfo(logger, `Új tét amit rakni akarunk: ${myNewBid.toString()}`);

  if (highestBidSoFar.owner === myWalletAddress || myNewBid.isGreaterThan(maxBid)) {
    logInfo(logger, 'Nem tesszük meg a tétet mert vagy a miénk az eddigi legnagyobb tét, vagy elértük a maximumot');
    return;
  }

  try {
    const bidParams = {
      vaultId,
      index: batchIndex,
      from: myWalletAddress,
      amount: `${myNewBid.decimalPlaces(8, BigNumber.ROUND_CEIL).toFixed(8)}@${bidToken}`,
    };
    await client.loan.placeAuctionBid(bidParams);
    logInfo(logger, `A tétet sikeresen megtettük a következő paraméterekkel: ${JSON.stringify(bidParams)}`);
  } catch (error) {
    logError(logger, 'placeAuctionBid hiba', error);
  }
};

const printResult = async (client, logger, vaultId, batchIndex) => {
  try {
    const auctionHistory = await client.loan.listAuctionHistory('all', { limit: 20000 });
    const vault = auctionHistory
      .find(auction => auction.vaultId === vaultId && auction.batchIndex === batchIndex);
    logInfo(logger, 'EREDMÉNY');
    logInfo(logger, JSON.stringify(vault, null, 2));
  } catch (error) {
    logError(logger, 'listAuctionHistory hiba', error);
  }
};

const run = async () => {
  const { maxBlockNumber, blockDelta, apiTimeout, batchIndex, vaultId, clientEndpointUrl, logger } = getConfig();
  checkRequiredSettings({ maxBlockNumber, blockDelta, apiTimeout, vaultId, clientEndpointUrl });
  const client = new JsonRpcClient(clientEndpointUrl);

  try {
    logInfo(logger, 'Várunk amíg elérjuk a célblokkot...');
    let { height: currentBlockHeight } = await client.blockchain.waitForBlockHeight(maxBlockNumber - blockDelta, apiTimeout);
    logInfo(logger, `Elértük a célblokkot. A legutolsó elkészült blokk száma ${currentBlockHeight}`);

    while (currentBlockHeight < maxBlockNumber) {
      await placeNewBid(client, logger);
      const { height } = await client.blockchain.waitForNewBlock(apiTimeout);
      currentBlockHeight = height;
    }
  } catch (error) {
    logError(logger, 'wait for block hiba', error);
  }

  await printResult(client, logger, vaultId, batchIndex);
};

console.log('STARTED');
run()
  .then(() => {
    console.log('FINISHED');
  });
