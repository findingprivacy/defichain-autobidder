import 'dotenv/config';
import { JsonRpcClient } from '@defichain/jellyfish-api-jsonrpc';
import { BigNumber } from '@defichain/jellyfish-api-jsonrpc/node_modules/@defichain/jellyfish-json';
import { getConfig, getHighestBidSoFar, wait, checkRequiredSettings } from './utils';

const getPriceInDUSD = async (client, amount, symbol) => {
  try {
    if (symbol === 'DFI') {
      const poolPair = await client.poolpair.getPoolPair('DUSD-DFI');
      const [rate] = Object.entries(poolPair).map(([, pair]) => pair['reserveA/reserveB']);
      return rate.multipliedBy(amount);
    }
    const poolPair = await client.poolpair.getPoolPair(`${symbol}-DUSD`);
    const [rate] = Object.entries(poolPair).map(([, pair]) => pair['reserveB/reserveA']);
    return rate.multipliedBy(amount);
  } catch (error) {
    if (error.message.includes('Pool not found')) {
      const [firstPair, secondPair] = await Promise.all([
        client.poolpair.getPoolPair(`${symbol}-DFI`),
        client.poolpair.getPoolPair('DUSD-DFI'),
      ]);
      const [firstRate] = Object.entries(firstPair).map(([, pair]) => pair['reserveB/reserveA']);
      const [secondRate] = Object.entries(secondPair).map(([, pair]) => pair['reserveA/reserveB']);
      return firstRate.multipliedBy(amount).multipliedBy(secondRate);
    }
    console.log(error);
    return null;
  }
};

const getStartingBid = async (client, logger, { vaultId, index, loan }) => {
  const highestBidSoFar = await getHighestBidSoFar(client, logger, vaultId, index);
  const [amount, symbol] = loan.split('@');

  if (!highestBidSoFar) {
    const loanNum = await getPriceInDUSD(client, amount, symbol);
    return loanNum.multipliedBy('1.05');
  }

  const highestBidSoFarNum = await getPriceInDUSD(client, highestBidSoFar, symbol);
  return highestBidSoFarNum.multipliedBy('1.01');
};

const getRewardPrice = async (client, collaterals) => {
  const pricePromises = collaterals.map((collateral) => {
    const [amount, symbol] = collateral.split('@');
    return getPriceInDUSD(client, amount, symbol);
  });
  const prices = await Promise.all(pricePromises);
  return prices.reduce((sum, price) => sum.plus(price), new BigNumber(0));
};

const getAvailableAuctions = async (client, numOfAuctions) => {
  const availableAuctions = await client.loan.listAuctions({ limit: numOfAuctions });
  return availableAuctions.reduce((acc, { vaultId, batches }) => {
    const transformedBatches = batches.map(batch => ({ ...batch, vaultId }));
    return [...acc, ...transformedBatches];
  }, []);
};

const sortyByMargin = ({ margin: first }, { margin: second }) => {
  if (first.isGreaterThan(second)) return -1;
  if (second.isGreaterThan(first)) return 1;
  return 0;
};

const run = async () => {
  const { clientEndpointUrl, logger, numOfAuctions, coolDown, minMargin } = getConfig();
  checkRequiredSettings({ clientEndpointUrl, numOfAuctions, coolDown, minMargin });
  const client = new JsonRpcClient(clientEndpointUrl);
  const auctions = await getAvailableAuctions(client, numOfAuctions);

  const result = [];
  for (let index = 0; index < auctions.length; index += 1) {
    const auction = auctions[index];
    const startingBid = await getStartingBid(client, logger, auction);
    const reward = await getRewardPrice(client, auction.collaterals);
    const url = `https://defiscan.live/vaults/${auction.vaultId}/auctions/${auction.index}`;
    const diff = reward.minus(startingBid);
    const margin = diff.dividedBy(startingBid).multipliedBy(100);
    wait(coolDown);
    if (margin.isGreaterThanOrEqualTo(minMargin)) {
      result.push({ url, minBid: startingBid, reward, diff, margin });
    }
  }
  result.sort(sortyByMargin);
  result.reverse();
  const finelResult = result.map(({ url, minBid, reward, diff, margin }) => ({
    url,
    minBid: `${minBid.toPrecision(10)} DUSD`,
    reward: `${reward.toPrecision(10)} DUSD`,
    diff: `${diff.toPrecision(7)} DUSD`,
    margin: `${margin.toPrecision(5)}%`,
  }));
  finelResult.forEach(auction => console.log(auction));
};

console.log('STARTED');
console.log(' ');
run()
  .then(() => {
    console.log(' ');
    console.log('FINISHED');
  });
