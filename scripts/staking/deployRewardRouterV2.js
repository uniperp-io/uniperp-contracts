const { deployContract, contractAt, sendTxn, writeTmpAddresses } = require("../shared/helpers")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('../core/tokens')[network];

async function main() {
  const { nativeToken } = tokens

  const vestingDuration = 365 * 24 * 60 * 60

  const ulpManager = await contractAt("UlpManager", "0xe1ae4d4b06A5Fe1fc288f6B4CD72f9F8323B107F")
  const ulp = await contractAt("ULP", "0x01234181085565ed162a948b6a5e88758CD7c7b8")

  const unip = await contractAt("UNIP", "0x62edc0692BD897D2295872a9FFCac5425011c661");
  const esUnip = await contractAt("EsUNIP", "0xFf1489227BbAAC61a9209A08929E4c2a526DdD17");
  const bnUnip = await deployContract("MintableBaseToken", ["Bonus UNIP", "bnUNIP", 0]);

  await sendTxn(esUnip.setInPrivateTransferMode(true), "esUnip.setInPrivateTransferMode")
  await sendTxn(ulp.setInPrivateTransferMode(true), "ulp.setInPrivateTransferMode")

  const stakedUnipTracker = await deployContract("RewardTracker", ["Staked UNIP", "sUNIP"])
  const stakedUnipDistributor = await deployContract("RewardDistributor", [esUnip.address, stakedUnipTracker.address])
  await sendTxn(stakedUnipTracker.initialize([unip.address, esUnip.address], stakedUnipDistributor.address), "stakedUnipTracker.initialize")
  await sendTxn(stakedUnipDistributor.updateLastDistributionTime(), "stakedUnipDistributor.updateLastDistributionTime")

  const bonusUnipTracker = await deployContract("RewardTracker", ["Staked + Bonus UNIP", "sbUNIP"])
  const bonusUnipDistributor = await deployContract("BonusDistributor", [bnUnip.address, bonusUnipTracker.address])
  await sendTxn(bonusUnipTracker.initialize([stakedUnipTracker.address], bonusUnipDistributor.address), "bonusUnipTracker.initialize")
  await sendTxn(bonusUnipDistributor.updateLastDistributionTime(), "bonusUnipDistributor.updateLastDistributionTime")

  const feeUnipTracker = await deployContract("RewardTracker", ["Staked + Bonus + Fee UNIP", "sbfUNIP"])
  const feeUnipDistributor = await deployContract("RewardDistributor", [nativeToken.address, feeUnipTracker.address])
  await sendTxn(feeUnipTracker.initialize([bonusUnipTracker.address, bnUnip.address], feeUnipDistributor.address), "feeUnipTracker.initialize")
  await sendTxn(feeUnipDistributor.updateLastDistributionTime(), "feeUnipDistributor.updateLastDistributionTime")

  const feeUlpTracker = await deployContract("RewardTracker", ["Fee ULP", "fULP"])
  const feeUlpDistributor = await deployContract("RewardDistributor", [nativeToken.address, feeUlpTracker.address])
  await sendTxn(feeUlpTracker.initialize([ulp.address], feeUlpDistributor.address), "feeUlpTracker.initialize")
  await sendTxn(feeUlpDistributor.updateLastDistributionTime(), "feeUlpDistributor.updateLastDistributionTime")

  const stakedUlpTracker = await deployContract("RewardTracker", ["Fee + Staked ULP", "fsULP"])
  const stakedUlpDistributor = await deployContract("RewardDistributor", [esUnip.address, stakedUlpTracker.address])
  await sendTxn(stakedUlpTracker.initialize([feeUlpTracker.address], stakedUlpDistributor.address), "stakedUlpTracker.initialize")
  await sendTxn(stakedUlpDistributor.updateLastDistributionTime(), "stakedUlpDistributor.updateLastDistributionTime")

  await sendTxn(stakedUnipTracker.setInPrivateTransferMode(true), "stakedUnipTracker.setInPrivateTransferMode")
  await sendTxn(stakedUnipTracker.setInPrivateStakingMode(true), "stakedUnipTracker.setInPrivateStakingMode")
  await sendTxn(bonusUnipTracker.setInPrivateTransferMode(true), "bonusUnipTracker.setInPrivateTransferMode")
  await sendTxn(bonusUnipTracker.setInPrivateStakingMode(true), "bonusUnipTracker.setInPrivateStakingMode")
  await sendTxn(bonusUnipTracker.setInPrivateClaimingMode(true), "bonusUnipTracker.setInPrivateClaimingMode")
  await sendTxn(feeUnipTracker.setInPrivateTransferMode(true), "feeUnipTracker.setInPrivateTransferMode")
  await sendTxn(feeUnipTracker.setInPrivateStakingMode(true), "feeUnipTracker.setInPrivateStakingMode")

  await sendTxn(feeUlpTracker.setInPrivateTransferMode(true), "feeUlpTracker.setInPrivateTransferMode")
  await sendTxn(feeUlpTracker.setInPrivateStakingMode(true), "feeUlpTracker.setInPrivateStakingMode")
  await sendTxn(stakedUlpTracker.setInPrivateTransferMode(true), "stakedUlpTracker.setInPrivateTransferMode")
  await sendTxn(stakedUlpTracker.setInPrivateStakingMode(true), "stakedUlpTracker.setInPrivateStakingMode")

  const unipVester = await deployContract("Vester", [
    "Vested UNIP", // _name
    "vUNIP", // _symbol
    vestingDuration, // _vestingDuration
    esUnip.address, // _esToken
    feeUnipTracker.address, // _pairToken
    unip.address, // _claimableToken
    stakedUnipTracker.address, // _rewardTracker
  ])

  const ulpVester = await deployContract("Vester", [
    "Vested ULP", // _name
    "vULP", // _symbol
    vestingDuration, // _vestingDuration
    esUnip.address, // _esToken
    stakedUlpTracker.address, // _pairToken
    unip.address, // _claimableToken
    stakedUlpTracker.address, // _rewardTracker
  ])

  const rewardRouter = await deployContract("RewardRouterV2", [])
  await sendTxn(rewardRouter.initialize(
    nativeToken.address,
    unip.address,
    esUnip.address,
    bnUnip.address,
    ulp.address,
    stakedUnipTracker.address,
    bonusUnipTracker.address,
    feeUnipTracker.address,
    feeUlpTracker.address,
    stakedUlpTracker.address,
    ulpManager.address,
    unipVester.address,
    ulpVester.address
  ), "rewardRouter.initialize")

  await sendTxn(ulpManager.setHandler(rewardRouter.address), "ulpManager.setHandler(rewardRouter)")

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

  // allow stakedUlpTracker to stake feeUlpTracker
  await sendTxn(feeUlpTracker.setHandler(stakedUlpTracker.address, true), "feeUlpTracker.setHandler(stakedUlpTracker)")
  // allow feeUlpTracker to stake ulp
  await sendTxn(ulp.setHandler(feeUlpTracker.address, true), "ulp.setHandler(feeUlpTracker)")

  // allow rewardRouter to stake in feeUlpTracker
  await sendTxn(feeUlpTracker.setHandler(rewardRouter.address, true), "feeUlpTracker.setHandler(rewardRouter)")
  // allow rewardRouter to stake in stakedUlpTracker
  await sendTxn(stakedUlpTracker.setHandler(rewardRouter.address, true), "stakedUlpTracker.setHandler(rewardRouter)")

  await sendTxn(esUnip.setHandler(rewardRouter.address, true), "esUnip.setHandler(rewardRouter)")
  await sendTxn(esUnip.setHandler(stakedUnipDistributor.address, true), "esUnip.setHandler(stakedUnipDistributor)")
  await sendTxn(esUnip.setHandler(stakedUlpDistributor.address, true), "esUnip.setHandler(stakedUlpDistributor)")
  await sendTxn(esUnip.setHandler(stakedUlpTracker.address, true), "esUnip.setHandler(stakedUlpTracker)")
  await sendTxn(esUnip.setHandler(unipVester.address, true), "esUnip.setHandler(unipVester)")
  await sendTxn(esUnip.setHandler(ulpVester.address, true), "esUnip.setHandler(ulpVester)")

  await sendTxn(esUnip.setMinter(unipVester.address, true), "esUnip.setMinter(unipVester)")
  await sendTxn(esUnip.setMinter(ulpVester.address, true), "esUnip.setMinter(ulpVester)")

  await sendTxn(unipVester.setHandler(rewardRouter.address, true), "unipVester.setHandler(rewardRouter)")
  await sendTxn(ulpVester.setHandler(rewardRouter.address, true), "ulpVester.setHandler(rewardRouter)")

  await sendTxn(feeUnipTracker.setHandler(unipVester.address, true), "feeUnipTracker.setHandler(unipVester)")
  await sendTxn(stakedUlpTracker.setHandler(ulpVester.address, true), "stakedUlpTracker.setHandler(ulpVester)")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
