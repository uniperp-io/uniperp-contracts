const { deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

async function main() {
  const wallet = { address: "0x5F799f365Fa8A2B60ac0429C48B153cA5a6f0Cf8" }

  const account = "0x9f169c2189A2d975C18965DE985936361b4a9De9"

  const unip = await contractAt("UNIP", "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a");
  const bnUnip = await contractAt("MintableBaseToken", "0x35247165119B69A40edD5304969560D0ef486921");
  const stakedUnipTracker = await contractAt("RewardTracker", "0x908C4D94D34924765f1eDc22A1DD098397c59dD4")
  const bonusUnipTracker = await contractAt("RewardTracker", "0x4d268a7d4C16ceB5a606c173Bd974984343fea13")
  const feeUnipTracker = await contractAt("RewardTracker", "0xd2D1162512F927a7e282Ef43a362659E4F2a728F")

  console.log("stakedUnipTracker.claimable", (await stakedUnipTracker.claimable(account)).toString())
  console.log("bonusUnipTracker.claimable", (await bonusUnipTracker.claimable(account)).toString())
  console.log("feeUnipTracker.claimable", (await feeUnipTracker.claimable(account)).toString())
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
