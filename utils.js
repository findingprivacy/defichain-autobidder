import SimpleNodeLogger from 'simple-node-logger';

export const logError = (logger, message, error) => {
  logger.error(message);
  console.log(message, error);
  process.exit();
};

export const logInfo = (logger, message) => {
  logger.info(message);
  console.log(message);
};

export const getConfig = () => {
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
    NUM_OF_AUCTIONS,
    COOL_DOWN,
    MIN_MARGIN,
  } = process.env;

  const logger = SimpleNodeLogger.createSimpleFileLogger({
    logFilePath: `${VAULT_ID}-${Date.now()}.log`,
    timestampFormat: 'YYYY-MM-DD HH:mm:ss.SSS',
  });

  return {
    maxBlockNumber: parseInt(MAX_BLOCK_NUMBER, 10),
    blockDelta: parseInt(BLOCK_DELTA, 10),
    apiTimeout: parseInt(API_TIMEOUT, 10),
    batchIndex: parseInt(BATCH_INDEX, 10),
    numOfAuctions: parseInt(NUM_OF_AUCTIONS, 10),
    coolDown: parseInt(COOL_DOWN, 10),
    newBidRaise: NEW_BID_RAISE,
    vaultId: VAULT_ID,
    clientEndpointUrl: CLIENT_ENDPOINT_URL,
    myWalletAddress: MY_WALLET_ADDRESS,
    minBid: MIN_BID,
    maxBid: MAX_BID,
    bidToken: BID_TOKEN,
    minMargin: MIN_MARGIN,
    logger,
  };
};

export const getHighestBidSoFar = async (client, logger, vaultId, batchIndex) => {
  try {
    const vault = await client.loan.getVault(vaultId);
    return vault.batches[batchIndex]?.highestBid;
  } catch (error) {
    logError(logger, 'getVault hiba', error);
    throw new Error(error);
  }
};

// eslint-disable-next-line no-promise-executor-return
export const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

export const checkRequiredSettings = (config) => {
  Object.entries(config).forEach(([key, value]) => {
    if (!value) throw new Error(`Missing config value: ${key}`);
  });
};
