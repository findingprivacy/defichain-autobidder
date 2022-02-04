import 'dotenv/config';
import { JsonRpcClient } from '@defichain/jellyfish-api-jsonrpc';
import { BigNumber } from '@defichain/jellyfish-api-jsonrpc/node_modules/@defichain/jellyfish-json';
import { getConfig, logInfo, logError, getHighestBidSoFar, checkRequiredSettings } from './utils';

const getMyNewBid = (logger, highestBidSoFar, minBid, newBidRaise) => {
  if (!highestBidSoFar) return new BigNumber(minBid);
  const [highestBidAmount = ''] = highestBidSoFar.amount.split('@');
  logInfo(logger, `Eddigi legmagasabb tét: ${highestBidAmount}`);
  const highestBidNumber = new BigNumber(highestBidAmount);
  return highestBidNumber.multipliedBy(newBidRaise);
};

const placeNewBid = async (client, logger) => {
  const { batchIndex, vaultId, newBidRaise, minBid, maxBid, myWalletAddress, bidToken } = getConfig();
  checkRequiredSettings({ vaultId, newBidRaise, minBid, maxBid, myWalletAddress, bidToken });
  const highestBidSoFar = await getHighestBidSoFar(client, logger, vaultId, batchIndex);
  const myNewBid = getMyNewBid(logger, highestBidSoFar, minBid, newBidRaise);
  logInfo(logger, `Új tét amit rakni akarunk: ${myNewBid.toString()}`);

  if (highestBidSoFar?.owner === myWalletAddress || myNewBid.isGreaterThan(maxBid)) {
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
    const id = await client.loan.placeAuctionBid(bidParams);
    logInfo(logger, `A tétet sikeresen megtettük a következő paraméterekkel: ${JSON.stringify(bidParams)}, ${id}`);
  } catch (error) {
    logError(logger, 'placeAuctionBid hiba', error);
  }
};

const printResult = async (client, logger, vaultId, batchIndex) => {
  try {
    const auctionHistory = await client.loan.listAuctionHistory('all', { limit: 1000 });
    const vault = auctionHistory
      .find(auction => auction.vaultId === vaultId && auction.batchIndex === batchIndex);
    logInfo(logger, 'EREDMÉNY');
    logInfo(logger, JSON.stringify(vault, null, 2));
  } catch (error) {
    logError(logger, 'listAuctionHistory hiba', error);
  }
};

const waitForBlock = async (apiCall) => {
  let block = null;
  while (!block) {
    try {
      block = await apiCall();
    } catch (error) {
      if (!error.message.includes('timeout of 60000ms')) {
        logError(logger, 'waitForBlock hiba', error);
      }
    }
  }
  return block;
};

const run = async () => {
  const { maxBlockNumber, blockDelta, apiTimeout, batchIndex, vaultId, clientEndpointUrl, logger } = getConfig();
  checkRequiredSettings({ maxBlockNumber, blockDelta, apiTimeout, vaultId, clientEndpointUrl });
  const client = new JsonRpcClient(clientEndpointUrl);

  try {
    logInfo(logger, `AUKCIÓ: https://defiscan.live/vaults/${vaultId}/auctions/${batchIndex}`);
    logInfo(logger, 'NE FELEJTSD EL UNLOCKOLNI A WALLETET!!!');
    logInfo(' ');
    logInfo(logger, 'Várunk amíg elérjük a célblokkot...');
    let { height: currentBlockHeight } = await waitForBlock(() => client.blockchain.waitForBlockHeight(maxBlockNumber - blockDelta, apiTimeout));
    logInfo(logger, `Elértük a célblokkot. A legutolsó elkészült blokk száma ${currentBlockHeight}`);

    while (currentBlockHeight < maxBlockNumber) {
      await placeNewBid(client, logger);
      logInfo(' ');
      logInfo(logger, 'Várunk a következő blokkra...');
      const { height } = await waitForBlock(() => client.blockchain.waitForNewBlock(apiTimeout));
      logInfo(logger, `Új blokk készült el: ${height}`);
      currentBlockHeight = height;
    }
  } catch (error) {
    logError(logger, 'wait for block hiba', error);
  }

  await printResult(client, logger, vaultId, batchIndex);
};

run()
  .then(() => {
    console.log('FINISHED');
  });
