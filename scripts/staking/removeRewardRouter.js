const { deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

async function main() {
  const rewardRouter = await contractAt("RewardRouter", "0xEa7fCb85802713Cb03291311C66d6012b23402ea")
  const bnUnip = await contractAt("MintableBaseToken", "0x35247165119B69A40edD5304969560D0ef486921")
  const ulpManager = await contractAt("UlpManager", "0x91425Ac4431d068980d497924DD540Ae274f3270")

  const stakedUnipTracker = await contractAt("RewardTracker", "0x908C4D94D34924765f1eDc22A1DD098397c59dD4")
  const bonusUnipTracker = await contractAt("RewardTracker", "0x4d268a7d4C16ceB5a606c173Bd974984343fea13")
  const feeUnipTracker = await contractAt("RewardTracker", "0xd2D1162512F927a7e282Ef43a362659E4F2a728F")

  const feeUlpTracker = await contractAt("RewardTracker", "0x4e971a87900b931fF39d1Aad67697F49835400b6")
  const stakedUlpTracker = await contractAt("RewardTracker", "0x1aDDD80E6039594eE970E5872D247bf0414C8903")

  // allow rewardRouter to stake in stakedUnipTracker
  await sendTxn(stakedUnipTracker.setHandler(rewardRouter.address, false), "stakedUnipTracker.setHandler(rewardRouter)")
  // allow rewardRouter to stake in bonusUnipTracker
  await sendTxn(bonusUnipTracker.setHandler(rewardRouter.address, false), "bonusUnipTracker.setHandler(rewardRouter)")
  // allow rewardRouter to stake in feeUnipTracker
  await sendTxn(feeUnipTracker.setHandler(rewardRouter.address, false), "feeUnipTracker.setHandler(rewardRouter)")
  // allow rewardRouter to burn bnUnip
  await sendTxn(bnUnip.setMinter(rewardRouter.address, false), "bnUnip.setMinter(rewardRouter)")

  // allow rewardRouter to mint in ulpManager
  await sendTxn(ulpManager.setHandler(rewardRouter.address, false), "ulpManager.setHandler(rewardRouter)")
  // allow rewardRouter to stake in feeUlpTracker
  await sendTxn(feeUlpTracker.setHandler(rewardRouter.address, false), "feeUlpTracker.setHandler(rewardRouter)")
  // allow rewardRouter to stake in stakedUlpTracker
  await sendTxn(stakedUlpTracker.setHandler(rewardRouter.address, false), "stakedUlpTracker.setHandler(rewardRouter)")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
