const path = require("path")

const { contractAt, sendTxn, processBatch, getFrameSigner } = require("../shared/helpers")
const { expandDecimals, bigNumberify } = require("../../test/shared/utilities")

const ethPrice = "1550"
const avaxPrice = "18"
const unipPrice = "74"

const shouldSendTxn = false

let arbitrumFile
if (process.env.ARBITRUM_FILE) {
  arbitrumFile = path.join(process.env.PWD, process.env.ARBITRUM_FILE)
} else {
  arbitrumFile = path.join(__dirname, "../../distribution-data-arbitrum.json")
}
console.log("Arbitrum file: %s", arbitrumFile)
const arbitrumData = require(arbitrumFile)

let avalancheFile
if (process.env.AVALANCHE_FILE) {
  avalancheFile = path.join(process.env.PWD, process.env.AVALANCHE_FILE)
} else {
  avalancheFile = path.join(__dirname, "../../distribution-data-avalanche.json")
}
console.log("Avalanche file: %s", avalancheFile)
const avaxData = require(avalancheFile)

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('../core/tokens')[network];

const { AddressZero } = ethers.constants

async function getArbValues() {
  const batchSender = await contractAt("BatchSender", "0x1070f775e8eb466154BBa8FA0076C4Adc7FE17e8")
  const esUnip = await contractAt("Token", "0xf42Ae1D54fd613C9bb14810b0588FaAa09a426cA")
  const nativeTokenPrice = ethPrice
  const data = arbitrumData

  return { batchSender, esUnip, nativeTokenPrice, data }
}

async function getAvaxValues() {
  const batchSender = await contractAt("BatchSender", "0xF0f929162751DD723fBa5b86A9B3C88Dc1D4957b")
  const esUnip = await contractAt("Token", "0xFf1489227BbAAC61a9209A08929E4c2a526DdD17")
  const nativeTokenPrice = avaxPrice
  const data = avaxData

  return { batchSender, esUnip, nativeTokenPrice, data }
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
  const { batchSender, esUnip, nativeTokenPrice, data } = await getValues()
  const { nativeToken } = tokens
  const nativeTokenContract = await contractAt("Token", nativeToken.address)

  const affiliatesData = data.referrers
  const discountsData = data.referrals

  console.log("affiliates", affiliatesData.length)
  console.log("trader discounts", discountsData.length)

  const affiliateRewardsTypeId = 1
  const traderDiscountsTypeId = 2

  let totalAffiliateAmount = bigNumberify(0)
  let totalAffiliateUsd = bigNumberify(0)
  let allAffiliateUsd = bigNumberify(0)
  let totalDiscountAmount = bigNumberify(0)
  let totalDiscountUsd = bigNumberify(0)
  let allDiscountUsd = bigNumberify(0)
  let totalEsUnipAmount = bigNumberify(0)
  const affiliateAccounts = []
  const affiliateAmounts = []
  const discountAccounts = []
  const discountAmounts = []
  const esUnipAccounts = []
  const esUnipAmounts = []

  for (let i = 0; i < affiliatesData.length; i++) {
    const { account, rebateUsd, esunipRewardsUsd } = affiliatesData[i]
    allAffiliateUsd = allAffiliateUsd.add(rebateUsd)

    if (account === AddressZero) { continue }

    const amount = bigNumberify(rebateUsd).mul(expandDecimals(1, 18)).div(expandDecimals(nativeTokenPrice, 30))
    affiliateAccounts.push(account)
    affiliateAmounts.push(amount)
    totalAffiliateAmount = totalAffiliateAmount.add(amount)
    totalAffiliateUsd = totalAffiliateUsd.add(rebateUsd)

    if (esunipRewardsUsd) {
      const esUnipAmount = bigNumberify(esunipRewardsUsd).mul(expandDecimals(1, 18)).div(expandDecimals(unipPrice, 30))
      esUnipAccounts.push(account)
      esUnipAmounts.push(esUnipAmount)
      totalEsUnipAmount = totalEsUnipAmount.add(esUnipAmount)
    }
  }

  for (let i = 0; i < discountsData.length; i++) {
    const { account, discountUsd } = discountsData[i]
    allDiscountUsd = allDiscountUsd.add(discountUsd)
    if (account === AddressZero) { continue }

    const amount = bigNumberify(discountUsd).mul(expandDecimals(1, 18)).div(expandDecimals(nativeTokenPrice, 30))
    discountAccounts.push(account)
    discountAmounts.push(amount)
    totalDiscountAmount = totalDiscountAmount.add(amount)
    totalDiscountUsd = totalDiscountUsd.add(discountUsd)
  }

  affiliatesData.sort((a, b) => {
    if (bigNumberify(a.rebateUsd).gt(b.rebateUsd)) {
      return -1;
    }
    if (bigNumberify(a.rebateUsd).lt(b.rebateUsd)) {
      return 1;
    }

    return 0;
  })

  console.log("top affiliate", affiliatesData[0].account, affiliatesData[0].rebateUsd)

  const totalNativeAmount = totalAffiliateAmount.add(totalDiscountAmount)
  console.log(`total affiliate rewards (${nativeToken.name})`, ethers.utils.formatUnits(totalAffiliateAmount, 18))
  console.log("total affiliate rewards (USD)", ethers.utils.formatUnits(totalAffiliateUsd, 30))
  console.log("all affiliate rewards (USD)", ethers.utils.formatUnits(allAffiliateUsd, 30))
  console.log(`total trader rebates (${nativeToken.name})`, ethers.utils.formatUnits(totalDiscountAmount, 18))
  console.log("total trader rebates (USD)", ethers.utils.formatUnits(totalDiscountUsd, 30))
  console.log("all trader rebates (USD)", ethers.utils.formatUnits(allDiscountUsd, 30))
  console.log(`total ${nativeToken.name}`, ethers.utils.formatUnits(totalNativeAmount, 18))
  console.log(`total USD`, ethers.utils.formatUnits(totalAffiliateUsd.add(totalDiscountUsd), 30))
  console.log(`total esUnip`, ethers.utils.formatUnits(totalEsUnipAmount, 18))

  const batchSize = 150

  if (shouldSendTxn) {
    const signer = await getFrameSigner()
    const nativeTokenForSigner = await contractAt("Token", nativeToken.address, signer)
    await sendTxn(nativeTokenForSigner.transfer(wallet.address, totalNativeAmount), "nativeTokenForSigner.transfer")

    const printBatch = (currentBatch) => {
      for (let i = 0; i < currentBatch.length; i++) {
        const item = currentBatch[i]
        const account = item[0]
        const amount = item[1]
        console.log(account, ethers.utils.formatUnits(amount, 18))
      }
    }

    await sendTxn(nativeTokenContract.approve(batchSender.address, totalNativeAmount), "nativeToken.approve")

    await processBatch([affiliateAccounts, affiliateAmounts], batchSize, async (currentBatch) => {
      printBatch(currentBatch)

      const accounts = currentBatch.map((item) => item[0])
      const amounts = currentBatch.map((item) => item[1])

      await sendTxn(batchSender.sendAndEmit(nativeToken.address, accounts, amounts, affiliateRewardsTypeId), "batchSender.sendAndEmit(nativeToken, affiliate rewards)")
    })

    await processBatch([discountAccounts, discountAmounts], batchSize, async (currentBatch) => {
      printBatch(currentBatch)

      const accounts = currentBatch.map((item) => item[0])
      const amounts = currentBatch.map((item) => item[1])

      await sendTxn(batchSender.sendAndEmit(nativeToken.address, accounts, amounts, traderDiscountsTypeId), "batchSender.sendAndEmit(nativeToken, trader rebates)")
    })

    await sendTxn(esUnip.approve(batchSender.address, totalEsUnipAmount), "esUnip.approve")

    await processBatch([esUnipAccounts, esUnipAmounts], batchSize, async (currentBatch) => {
      printBatch(currentBatch)

      const accounts = currentBatch.map((item) => item[0])
      const amounts = currentBatch.map((item) => item[1])

      await sendTxn(batchSender.sendAndEmit(esUnip.address, accounts, amounts, affiliateRewardsTypeId), "batchSender.sendAndEmit(nativeToken, esUnip affiliate rewards)")
    })
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
