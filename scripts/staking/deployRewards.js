const { deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

async function main() {
  const wallet = { address: "0x5F799f365Fa8A2B60ac0429C48B153cA5a6f0Cf8" }
  const { AddressZero } = ethers.constants

  const weth = { address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1" }
  const unip = await deployContract("UNIP", []);
  const esUnip = await deployContract("EsUNIP", []);
  const bnUnip = await deployContract("MintableBaseToken", ["Bonus UNIP", "bnUNIP", 0]);
  const bnAlp = { address: AddressZero }
  const alp = { address: AddressZero }

  const stakedUnipTracker = await deployContract("RewardTracker", ["Staked UNIP", "sUNIP"])
  const stakedUnipDistributor = await deployContract("RewardDistributor", [esUnip.address, stakedUnipTracker.address])
  await sendTxn(stakedUnipTracker.initialize([unip.address, esUnip.address], stakedUnipDistributor.address), "stakedUnipTracker.initialize")
  await sendTxn(stakedUnipDistributor.updateLastDistributionTime(), "stakedUnipDistributor.updateLastDistributionTime")

  const bonusUnipTracker = await deployContract("RewardTracker", ["Staked + Bonus UNIP", "sbUNIP"])
  const bonusUnipDistributor = await deployContract("BonusDistributor", [bnUnip.address, bonusUnipTracker.address])
  await sendTxn(bonusUnipTracker.initialize([stakedUnipTracker.address], bonusUnipDistributor.address), "bonusUnipTracker.initialize")
  await sendTxn(bonusUnipDistributor.updateLastDistributionTime(), "bonusUnipDistributor.updateLastDistributionTime")

  const feeUnipTracker = await deployContract("RewardTracker", ["Staked + Bonus + Fee UNIP", "sbfUNIP"])
  const feeUnipDistributor = await deployContract("RewardDistributor", [weth.address, feeUnipTracker.address])
  await sendTxn(feeUnipTracker.initialize([bonusUnipTracker.address, bnUnip.address], feeUnipDistributor.address), "feeUnipTracker.initialize")
  await sendTxn(feeUnipDistributor.updateLastDistributionTime(), "feeUnipDistributor.updateLastDistributionTime")

  const feeUlpTracker = { address: AddressZero }
  const stakedUlpTracker = { address: AddressZero }

  const stakedAlpTracker = { address: AddressZero }
  const bonusAlpTracker = { address: AddressZero }
  const feeAlpTracker = { address: AddressZero }

  const ulpManager = { address: AddressZero }
  const ulp = { address: AddressZero }

  await sendTxn(stakedUnipTracker.setInPrivateTransferMode(true), "stakedUnipTracker.setInPrivateTransferMode")
  await sendTxn(stakedUnipTracker.setInPrivateStakingMode(true), "stakedUnipTracker.setInPrivateStakingMode")
  await sendTxn(bonusUnipTracker.setInPrivateTransferMode(true), "bonusUnipTracker.setInPrivateTransferMode")
  await sendTxn(bonusUnipTracker.setInPrivateStakingMode(true), "bonusUnipTracker.setInPrivateStakingMode")
  await sendTxn(bonusUnipTracker.setInPrivateClaimingMode(true), "bonusUnipTracker.setInPrivateClaimingMode")
  await sendTxn(feeUnipTracker.setInPrivateTransferMode(true), "feeUnipTracker.setInPrivateTransferMode")
  await sendTxn(feeUnipTracker.setInPrivateStakingMode(true), "feeUnipTracker.setInPrivateStakingMode")

  const rewardRouter = await deployContract("RewardRouter", [])

  await sendTxn(rewardRouter.initialize(
    unip.address,
    esUnip.address,
    bnUnip.address,
    bnAlp.address,
    ulp.address,
    alp.address,
    stakedUnipTracker.address,
    bonusUnipTracker.address,
    feeUnipTracker.address,
    feeUlpTracker.address,
    stakedUlpTracker.address,
    stakedAlpTracker.address,
    bonusAlpTracker.address,
    feeAlpTracker.address,
    ulpManager.address
  ), "rewardRouter.initialize")

  // allow rewardRouter to stake in stakedUnipTracker
  await sendTxn(stakedUnipTracker.setHandler(rewardRouter.address, true), "stakedUnipTracker.setHandler(rewardRouter)")
  // allow bonusUnipTracker to stake stakedUnipTracker
  await sendTxn(stakedUnipTracker.setHandler(bonusUnipTracker.address, true), "stakedUnipTracker.setHandler(bonusUnipTracker)")
  // allow rewardRouter to stake in bonusUnipTracker
  await sendTxn(bonusUnipTracker.setHandler(rewardRouter.address, true), "bonusUnipTracker.setHandler(rewardRouter)")
  // allow bonusUnipTracker to stake feeUnipTracker
  await sendTxn(bonusUnipTracker.setHandler(feeUnipTracker.address, true), "bonusUnipTracker.setHandler(feeUnipTracker)")
  await sendTxn(bonusUnipDistributor.setBonusMultiplier(10000), "bonusUnipDistributor.setBonusMultiplier")
  // allow rewardRouter to stake in feeUnipTracker
  await sendTxn(feeUnipTracker.setHandler(rewardRouter.address, true), "feeUnipTracker.setHandler(rewardRouter)")
  // allow stakedUnipTracker to stake esUnip
  await sendTxn(esUnip.setHandler(stakedUnipTracker.address, true), "esUnip.setHandler(stakedUnipTracker)")
  // allow feeUnipTracker to stake bnUnip
  await sendTxn(bnUnip.setHandler(feeUnipTracker.address, true), "bnUnip.setHandler(feeUnipTracker")
  // allow rewardRouter to burn bnUnip
  await sendTxn(bnUnip.setMinter(rewardRouter.address, true), "bnUnip.setMinter(rewardRouter")

  // mint esUnip for distributors
  await sendTxn(esUnip.setMinter(wallet.address, true), "esUnip.setMinter(wallet)")
  await sendTxn(esUnip.mint(stakedUnipDistributor.address, expandDecimals(50000 * 12, 18)), "esUnip.mint(stakedUnipDistributor") // ~50,000 UNIP per month
  await sendTxn(stakedUnipDistributor.setTokensPerInterval("20667989410000000"), "stakedUnipDistributor.setTokensPerInterval") // 0.02066798941 esUnip per second

  // mint bnUnip for distributor
  await sendTxn(bnUnip.setMinter(wallet.address, true), "bnUnip.setMinter")
  await sendTxn(bnUnip.mint(bonusUnipDistributor.address, expandDecimals(15 * 1000 * 1000, 18)), "bnUnip.mint(bonusUnipDistributor)")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
