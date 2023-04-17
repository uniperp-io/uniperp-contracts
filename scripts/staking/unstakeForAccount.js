const { deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

async function main() {
  const wallet = { address: "0x5F799f365Fa8A2B60ac0429C48B153cA5a6f0Cf8" }

  const account = "0x6eA748d14f28778495A3fBa3550a6CdfBbE555f9"
  const unstakeAmount = "79170000000000000000"

  const rewardRouter = await contractAt("RewardRouter", "0x1b8911995ee36F4F95311D1D9C1845fA18c56Ec6")
  const unip = await contractAt("UNIP", "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a");
  const bnUnip = await contractAt("MintableBaseToken", "0x35247165119B69A40edD5304969560D0ef486921");
  const stakedUnipTracker = await contractAt("RewardTracker", "0x908C4D94D34924765f1eDc22A1DD098397c59dD4")
  const bonusUnipTracker = await contractAt("RewardTracker", "0x4d268a7d4C16ceB5a606c173Bd974984343fea13")
  const feeUnipTracker = await contractAt("RewardTracker", "0xd2D1162512F927a7e282Ef43a362659E4F2a728F")

  // const gasLimit = 30000000

  // await sendTxn(feeUnipTracker.setHandler(wallet.address, true, { gasLimit }), "feeUnipTracker.setHandler")
  // await sendTxn(bonusUnipTracker.setHandler(wallet.address, true, { gasLimit }), "bonusUnipTracker.setHandler")
  // await sendTxn(stakedUnipTracker.setHandler(wallet.address, true, { gasLimit }), "stakedUnipTracker.setHandler")

  const stakedAmount = await stakedUnipTracker.stakedAmounts(account)
  console.log(`${account} staked: ${stakedAmount.toString()}`)
  console.log(`unstakeAmount: ${unstakeAmount.toString()}`)

  await sendTxn(feeUnipTracker.unstakeForAccount(account, bonusUnipTracker.address, unstakeAmount, account), "feeUnipTracker.unstakeForAccount")
  await sendTxn(bonusUnipTracker.unstakeForAccount(account, stakedUnipTracker.address, unstakeAmount, account), "bonusUnipTracker.unstakeForAccount")
  await sendTxn(stakedUnipTracker.unstakeForAccount(account, unip.address, unstakeAmount, account), "stakedUnipTracker.unstakeForAccount")

  await sendTxn(bonusUnipTracker.claimForAccount(account, account), "bonusUnipTracker.claimForAccount")

  const bnUnipAmount = await bnUnip.balanceOf(account)
  console.log(`bnUnipAmount: ${bnUnipAmount.toString()}`)

  await sendTxn(feeUnipTracker.stakeForAccount(account, account, bnUnip.address, bnUnipAmount), "feeUnipTracker.stakeForAccount")

  const stakedBnUnip = await feeUnipTracker.depositBalances(account, bnUnip.address)
  console.log(`stakedBnUnip: ${stakedBnUnip.toString()}`)

  const reductionAmount = stakedBnUnip.mul(unstakeAmount).div(stakedAmount)
  console.log(`reductionAmount: ${reductionAmount.toString()}`)
  await sendTxn(feeUnipTracker.unstakeForAccount(account, bnUnip.address, reductionAmount, account), "feeUnipTracker.unstakeForAccount")
  await sendTxn(bnUnip.burn(account, reductionAmount), "bnUnip.burn")

  const unipAmount = await unip.balanceOf(account)
  console.log(`unipAmount: ${unipAmount.toString()}`)

  await sendTxn(unip.burn(account, unstakeAmount), "unip.burn")
  const nextUnipAmount = await unip.balanceOf(account)
  console.log(`nextUnipAmount: ${nextUnipAmount.toString()}`)

  const nextStakedAmount = await stakedUnipTracker.stakedAmounts(account)
  console.log(`nextStakedAmount: ${nextStakedAmount.toString()}`)

  const nextStakedBnUnip = await feeUnipTracker.depositBalances(account, bnUnip.address)
  console.log(`nextStakedBnUnip: ${nextStakedBnUnip.toString()}`)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
