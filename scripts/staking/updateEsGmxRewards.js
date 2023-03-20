const { contractAt, signers, updateTokensPerInterval } = require("../shared/helpers")
const { expandDecimals, bigNumberify } = require("../../test/shared/utilities")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');

const shouldSendTxn = true

const monthlyEsUnipForUlpOnArb = expandDecimals(toInt("0"), 18)
const monthlyEsUnipForUlpOnAvax = expandDecimals(toInt("0"), 18)

async function getStakedAmounts() {
  const arbStakedUnipTracker = await contractAt("RewardTracker", "0x908C4D94D34924765f1eDc22A1DD098397c59dD4", signers.arbitrum)
  const arbStakedUnipAndEsUnip =await arbStakedUnipTracker.totalSupply()

  const avaxStakedUnipTracker = await contractAt("RewardTracker", "0x908C4D94D34924765f1eDc22A1DD098397c59dD4", signers.avax)
  const avaxStakedUnipAndEsUnip =await avaxStakedUnipTracker.totalSupply()

  return {
    arbStakedUnipAndEsUnip,
    avaxStakedUnipAndEsUnip
  }
}

async function getArbValues() {
  const unipRewardTracker = await contractAt("RewardTracker", "0x908C4D94D34924765f1eDc22A1DD098397c59dD4")
  const ulpRewardTracker = await contractAt("RewardTracker", "0x1aDDD80E6039594eE970E5872D247bf0414C8903")
  const tokenDecimals = 18
  const monthlyEsUnipForUlp = monthlyEsUnipForUlpOnArb

  return { tokenDecimals, unipRewardTracker, ulpRewardTracker, monthlyEsUnipForUlp }
}

async function getAvaxValues() {
  const unipRewardTracker = await contractAt("RewardTracker", "0x2bD10f8E93B3669b6d42E74eEedC65dd1B0a1342")
  const ulpRewardTracker = await contractAt("RewardTracker", "0x9e295B5B976a184B14aD8cd72413aD846C299660")
  const tokenDecimals = 18
  const monthlyEsUnipForUlp = monthlyEsUnipForUlpOnAvax

  return { tokenDecimals, unipRewardTracker, ulpRewardTracker, monthlyEsUnipForUlp }
}

function getValues() {
  if (network === "arbitrum") {
    return getArbValues()
  }

  if (network === "avax") {
    return getAvaxValues()
  }
}

function toInt(value) {
  return parseInt(value.replaceAll(",", ""))
}

async function main() {
  const { arbStakedUnipAndEsUnip, avaxStakedUnipAndEsUnip } = await getStakedAmounts()
  const { tokenDecimals, unipRewardTracker, ulpRewardTracker, monthlyEsUnipForUlp } = await getValues()

  const stakedAmounts = {
    arbitrum: {
      total: arbStakedUnipAndEsUnip
    },
    avax: {
      total: avaxStakedUnipAndEsUnip
    }
  }

  let totalStaked = bigNumberify(0)

  for (const net in stakedAmounts) {
    totalStaked = totalStaked.add(stakedAmounts[net].total)
  }

  const totalEsUnipRewards = expandDecimals(25000, tokenDecimals)
  const secondsPerMonth = 28 * 24 * 60 * 60

  const unipRewardDistributor = await contractAt("RewardDistributor", await unipRewardTracker.distributor())

  const unipCurrentTokensPerInterval = await unipRewardDistributor.tokensPerInterval()
  const unipNextTokensPerInterval = totalEsUnipRewards.mul(stakedAmounts[network].total).div(totalStaked).div(secondsPerMonth)
  const unipDelta = unipNextTokensPerInterval.sub(unipCurrentTokensPerInterval).mul(10000).div(unipCurrentTokensPerInterval)

  console.log("unipCurrentTokensPerInterval", unipCurrentTokensPerInterval.toString())
  console.log("unipNextTokensPerInterval", unipNextTokensPerInterval.toString(), `${unipDelta.toNumber() / 100.00}%`)

  const ulpRewardDistributor = await contractAt("RewardDistributor", await ulpRewardTracker.distributor())

  const ulpCurrentTokensPerInterval = await ulpRewardDistributor.tokensPerInterval()
  const ulpNextTokensPerInterval = monthlyEsUnipForUlp.div(secondsPerMonth)

  console.log("ulpCurrentTokensPerInterval", ulpCurrentTokensPerInterval.toString())
  console.log("ulpNextTokensPerInterval", ulpNextTokensPerInterval.toString())

  if (shouldSendTxn) {
    await updateTokensPerInterval(unipRewardDistributor, unipNextTokensPerInterval, "unipRewardDistributor")
    await updateTokensPerInterval(ulpRewardDistributor, ulpNextTokensPerInterval, "ulpRewardDistributor")
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
