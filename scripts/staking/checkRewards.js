const { deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

async function getDistributor(rewardTracker) {
  const distributorAddress = await rewardTracker.distributor()
  return await contractAt("RewardDistributor", distributorAddress)
}

async function printDistributorBalance(token, distributor, label) {
  const balance = await token.balanceOf(distributor.address)
  const pendingRewards = await distributor.pendingRewards()
  console.log(
    label,
    ethers.utils.formatUnits(balance, 18),
    ethers.utils.formatUnits(pendingRewards, 18),
    balance.gte(pendingRewards) ? "sufficient-balance" : "insufficient-balance",
    ethers.utils.formatUnits(balance.sub(pendingRewards), 18)
  )
}

async function main() {
  const unip = await contractAt("UNIP", "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a")
  const esUnip = await contractAt("EsUNIP", "0xf42Ae1D54fd613C9bb14810b0588FaAa09a426cA")
  const bnUnip = await contractAt("MintableBaseToken", "0x35247165119B69A40edD5304969560D0ef486921")
  const weth = await contractAt("Token", "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1")

  const stakedUnipTracker = await contractAt("RewardTracker", "0x908C4D94D34924765f1eDc22A1DD098397c59dD4")
  const stakedUnipDistributor = await getDistributor(stakedUnipTracker)

  const bonusUnipTracker = await contractAt("RewardTracker", "0x4d268a7d4C16ceB5a606c173Bd974984343fea13")
  const bonusUnipDistributor = await getDistributor(bonusUnipTracker)

  const feeUnipTracker = await contractAt("RewardTracker", "0xd2D1162512F927a7e282Ef43a362659E4F2a728F")
  const feeUnipDistributor = await getDistributor(feeUnipTracker)

  const stakedUlpTracker = await contractAt("RewardTracker", "0x1aDDD80E6039594eE970E5872D247bf0414C8903")
  const stakedUlpDistributor = await getDistributor(stakedUlpTracker)

  const feeUlpTracker = await contractAt("RewardTracker", "0x4e971a87900b931fF39d1Aad67697F49835400b6")
  const feeUlpDistributor = await getDistributor(feeUlpTracker)

  await printDistributorBalance(esUnip, stakedUnipDistributor, "esUnip in stakedUnipDistributor:")
  await printDistributorBalance(bnUnip, bonusUnipDistributor, "bnUnip in bonusUnipDistributor:")
  await printDistributorBalance(weth, feeUnipDistributor, "weth in feeUnipDistributor:")
  await printDistributorBalance(esUnip, stakedUlpDistributor, "esUnip in stakedUlpDistributor:")
  await printDistributorBalance(weth, feeUlpDistributor, "esUnip in feeUlpDistributor:")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
