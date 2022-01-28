import 'dotenv/config';
import { JsonRpcClient } from '@defichain/jellyfish-api-jsonrpc';
import { BigNumber } from '@defichain/jellyfish-api-jsonrpc/node_modules/@defichain/jellyfish-json';
import SimpleNodeLogger from 'simple-node-logger';

const logError = (logger, message, error) => {
  logger.error(message, error);
  console.log(message, error);
};

const logInfo = (logger, message) => {
  logger.info(message);
  console.log(message);
};

const getConfig = () => {
  const {
    CLIENT_ENDPOINT_URL,
    MAX_BLOCK_NUMBER,
    BLOCK_DELTA,
    API_TIMEOUT,
    BATCH_INDEX,
    VAULT_ID,
    MY_WALLET_ADDRESS,
    MIN_BID,
    MAX_BID,
    BID_TOKEN,
    NEW_BID_RAISE,
  } = process.env;

  const maxBlockNumber = parseInt(MAX_BLOCK_NUMBER, 10);
  const blockDelta = parseInt(BLOCK_DELTA, 10);
  const apiTimeout = parseInt(API_TIMEOUT, 10);
  const batchIndex = parseInt(BATCH_INDEX, 10);
  const newBidRaise = parseInt(NEW_BID_RAISE, 10);

  const logger = SimpleNodeLogger.createSimpleFileLogger({
    logFilePath: `${VAULT_ID}-${Date.now()}.log`,
    timestampFormat: 'YYYY-MM-DD HH:mm:ss.SSS',
  });

  return {
    maxBlockNumber,
    blockDelta,
    apiTimeout,
    batchIndex,
    newBidRaise,
    vaultId: VAULT_ID,
    clientEndpointUrl: CLIENT_ENDPOINT_URL,
    myWalletAddress: MY_WALLET_ADDRESS,
    minBid: MIN_BID,
    maxBid: MAX_BID,
    bidToken: BID_TOKEN,
    logger,
  };
};

const getHighestBidSoFar = async (client, logger, vaultId, batchIndex) => {
  try {
    const vault = await client.loan.getVault(vaultId);
    return vault.batches[batchIndex]?.highestBid;
  } catch (error) {
    logError(logger, 'getVault hiba', error);
    throw new Error(error);
  }
};

const getMyNewBid = (highestBidSoFar, minBid, newBidRaise) => {
  if (!highestBidSoFar) return new BigNumber(minBid);
  const [highestBidAmount = ''] = highestBidSoFar.amount.split('@');
  const highestBidNumber = new BigNumber(highestBidAmount);
  return highestBidNumber.multipliedBy(newBidRaise);
};

const placeNewBid = async (client, logger) => {
  const { batchIndex, vaultId, newBidRaise, minBid, maxBid, myWalletAddress, bidToken } = getConfig();
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
