const path = require("path")

const { deployContract, contractAt, sendTxn, processBatch, getFrameSigner } = require("../shared/helpers")
const { expandDecimals, bigNumberify } = require("../../test/shared/utilities")

let arbitrumFile
if (process.env.ARBITRUM_FILE) {
  arbitrumFile = path.join(process.env.PWD, process.env.ARBITRUM_FILE)
} else {
  arbitrumFile = path.join(__dirname, "../distribution-data-arbitrum.json")
}
console.log("Arbitrum file: %s", arbitrumFile)
const arbitrumData = require(arbitrumFile)

let avalancheFile
if (process.env.AVALANCHE_FILE) {
  avalancheFile = path.join(process.env.PWD, process.env.AVALANCHE_FILE)
} else {
  avalancheFile = path.join(__dirname, "../distribution-data-avalanche.json")
}
console.log("Avalanche file: %s", avalancheFile)
const avaxData = require(avalancheFile)

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('../core/tokens')[network];

const shouldSendTxn = false

const { AddressZero } = ethers.constants

async function getArbValues() {
  const batchSender = await contractAt("BatchSender", "0x1070f775e8eb466154BBa8FA0076C4Adc7FE17e8")
  const unip = await contractAt("Token", "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a")
  const data = arbitrumData
  const gasLimit = 30000000
  const totalUnip = 766
  const totalUsd = 44821

  return { batchSender, unip, data, gasLimit, totalUnip, totalUsd }
}

async function getAvaxValues() {
  const batchSender = await contractAt("BatchSender", "0xF0f929162751DD723fBa5b86A9B3C88Dc1D4957b")
  const unip = await contractAt("Token", "0x62edc0692BD897D2295872a9FFCac5425011c661")
  const data = avaxData
  const gasLimit = 5000000
  const totalUnip = 233
  const totalUsd = 13653

  return { batchSender, unip, data, gasLimit, totalUnip, totalUsd }
}

async function getValues() {
  if (network === "arbitrum") {
    return getArbValues()
  }

  if (network === "avax") {
    return getAvaxValues()
  }
}

async function main() {
  const wallet = { address: "0x5F799f365Fa8A2B60ac0429C48B153cA5a6f0Cf8" }
  const { batchSender, unip, data, totalUnip, totalUsd, gasLimit } = await getValues()

  const affiliatesData = data.referrers

  console.log("affiliates", affiliatesData.length)

  const affiliateRewardsTypeId = 1

  const affiliateAccounts = []
  const affiliateAmounts = []

  let totalAmount = bigNumberify(0)

  for (let i = 0; i < affiliatesData.length; i++) {
    const { account, rebateUsd, esunipRewardsUsd } = affiliatesData[i]

    if (account === AddressZero) { continue }

    const amount = bigNumberify(rebateUsd).mul(expandDecimals(totalUnip, 18)).div(expandDecimals(totalUsd, 30))
    affiliateAccounts.push(account)
    affiliateAmounts.push(amount)

    totalAmount = totalAmount.add(amount)
  }

  console.log("total amount", ethers.utils.formatUnits(totalAmount, 18))

  const batchSize = 150

  if (shouldSendTxn) {
    const printBatch = (currentBatch) => {
      for (let i = 0; i < currentBatch.length; i++) {
        const item = currentBatch[i]
        const account = item[0]
        const amount = item[1]
        console.log(account, ethers.utils.formatUnits(amount, 18))
      }
    }

    await sendTxn(unip.approve(batchSender.address, totalAmount, { gasLimit: 1000000 }), "unip.approve")

    await processBatch([affiliateAccounts, affiliateAmounts], batchSize, async (currentBatch) => {
      printBatch(currentBatch)

      const accounts = currentBatch.map((item) => item[0])
      const amounts = currentBatch.map((item) => item[1])

      await sendTxn(batchSender.sendAndEmit(unip.address, accounts, amounts, affiliateRewardsTypeId, { gasLimit }), "batchSender.sendAndEmit(unip, affiliate rewards)")
    })
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
