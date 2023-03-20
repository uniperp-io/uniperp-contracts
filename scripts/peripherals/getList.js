const { deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")
const holderList = require("../../data/holders/unipHolders.json")

async function main() {
  const feeUnipTracker = await contractAt("RewardTracker", "0xd2D1162512F927a7e282Ef43a362659E4F2a728F")
  const bonusUnipTracker = await contractAt("RewardTracker", "0x4d268a7d4C16ceB5a606c173Bd974984343fea13")
  const bnUnip = { address: "0x35247165119B69A40edD5304969560D0ef486921" }

  const data = []

  console.log("holderList", holderList.length)
  for (let i = 3490; i < holderList.length; i++) {
    const account = holderList[i]
    const bnUnipBalance = await feeUnipTracker.depositBalances(account, bnUnip.address)
    const pendingRewards = await bonusUnipTracker.claimable(account)
    const totalRewards = bnUnipBalance.add(pendingRewards)
    console.log(`${i+1},${account},${ethers.utils.formatUnits(bnUnipBalance, 18)},${ethers.utils.formatUnits(pendingRewards, 18)},${ethers.utils.formatUnits(totalRewards)}`)
    data.push([account, ethers.utils.formatUnits(totalRewards)])
  }

  // console.log("final data:")
  // console.log(data.map((i) => i.join(",")).join("\n"))
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
