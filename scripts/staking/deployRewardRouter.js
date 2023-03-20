const { deployContract, contractAt, sendTxn, readTmpAddresses } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('../core/tokens')[network];

async function main() {
  const {
    nativeToken
  } = tokens

  const weth = await contractAt("Token", nativeToken.address)
  const unip = await contractAt("UNIP", "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a")
  const esUnip = await contractAt("EsUNIP", "0xf42Ae1D54fd613C9bb14810b0588FaAa09a426cA")
  const bnUnip = await contractAt("MintableBaseToken", "0x35247165119B69A40edD5304969560D0ef486921")

  const stakedUnipTracker = await contractAt("RewardTracker", "0x908C4D94D34924765f1eDc22A1DD098397c59dD4")
  const bonusUnipTracker = await contractAt("RewardTracker", "0x4d268a7d4C16ceB5a606c173Bd974984343fea13")
  const feeUnipTracker = await contractAt("RewardTracker", "0xd2D1162512F927a7e282Ef43a362659E4F2a728F")

  const feeUlpTracker = await contractAt("RewardTracker", "0x4e971a87900b931fF39d1Aad67697F49835400b6")
  const stakedUlpTracker = await contractAt("RewardTracker", "0x1aDDD80E6039594eE970E5872D247bf0414C8903")

  const ulp = await contractAt("ULP", "0x4277f8F2c384827B5273592FF7CeBd9f2C1ac258")
  const ulpManager = await contractAt("UlpManager", "0x321F653eED006AD1C29D174e17d96351BDe22649")

  console.log("ulpManager", ulpManager.address)

  const rewardRouter = await deployContract("RewardRouter", [])

  await sendTxn(rewardRouter.initialize(
    weth.address,
    unip.address,
    esUnip.address,
    bnUnip.address,
    ulp.address,
    stakedUnipTracker.address,
    bonusUnipTracker.address,
    feeUnipTracker.address,
    feeUlpTracker.address,
    stakedUlpTracker.address,
    ulpManager.address
  ), "rewardRouter.initialize")

  // allow rewardRouter to stake in stakedUnipTracker
  await sendTxn(stakedUnipTracker.setHandler(rewardRouter.address, true), "stakedUnipTracker.setHandler(rewardRouter)")
  // allow rewardRouter to stake in bonusUnipTracker
  await sendTxn(bonusUnipTracker.setHandler(rewardRouter.address, true), "bonusUnipTracker.setHandler(rewardRouter)")
  // allow rewardRouter to stake in feeUnipTracker
  await sendTxn(feeUnipTracker.setHandler(rewardRouter.address, true), "feeUnipTracker.setHandler(rewardRouter)")
  // allow rewardRouter to burn bnUnip
  await sendTxn(bnUnip.setMinter(rewardRouter.address, true), "bnUnip.setMinter(rewardRouter)")

  // allow rewardRouter to mint in ulpManager
  await sendTxn(ulpManager.setHandler(rewardRouter.address, true), "ulpManager.setHandler(rewardRouter)")
  // allow rewardRouter to stake in feeUlpTracker
  await sendTxn(feeUlpTracker.setHandler(rewardRouter.address, true), "feeUlpTracker.setHandler(rewardRouter)")
  // allow rewardRouter to stake in stakedUlpTracker
  await sendTxn(stakedUlpTracker.setHandler(rewardRouter.address, true), "stakedUlpTracker.setHandler(rewardRouter)")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
