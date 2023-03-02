const { deployContract, contractAt , sendTxn, getFrameSigner } = require("../shared/helpers")

const timelock = { address: "0x59c46156ED614164eC66A3CFa5822797f533c902" }
const gmxTimelock = { address: "0x59c46156ED614164eC66A3CFa5822797f533c902" }

//contracts that need to be updated
const stakedGmxTracker = { address: "aaa" }
const bonusGmxTracker = { address: "aaa" }
const feeGmxTracker = { address: "aaa" }
const stakedGlpTracker = { address: "aaa" }
const feeGlpTracker = { address: "aaa" }
const glpManager = { address: "aaa" }
const gmxVester = { address: "aaa" }
const glpVester = { address: "aaa" }

const usdg = { address: "aaa" }
const glp = { address: "aaa" }
const gmx = { address: "aaa" }
const esGmx = { address: "aaa" }
const bnGmx = { address: "aaa" }
const vault = { address: "aaa" }
const positionManager = { address: "aaa" }
const positionRouter = { address: "aaa" }

const vaultErrorController = { address: "aaa" }
const referralStorage = { address: "aaa" }

//liquidatePosition is called through positionManager
const orderKeeper = { address: "aaa" }

async function updateRewardTrackerGov(rewardTracker, timelock, label) {
    const distributorAddress = await rewardTracker.distributor()
    const distributor = await contractAt("RewardDistributor", distributorAddress)
    await sendTxn(rewardTracker.setGov(timelock.address), `${label}.setGov`)
    await sendTxn(distributor.setGov(timelock.address), `${label}.distributor.setGov`)
}

async function main() {
    await updateRewardTrackerGov(stakedGmxTracker, timelock, "stakedGmxTracker")
    await updateRewardTrackerGov(bonusGmxTracker, timelock, "bonusGmxTracker")
    await updateRewardTrackerGov(feeGmxTracker, timelock, "feeGmxTracker")
    await updateRewardTrackerGov(stakedGlpTracker, timelock, "stakedGlpTracker")
    await updateRewardTrackerGov(feeGlpTracker, timelock, "feeGlpTracker")
  
    await sendTxn(glpManager.setGov(timelock.address), "glpManager.setGov")
    await sendTxn(gmxVester.setGov(timelock.address), "gmxVester.setGov")
    await sendTxn(glpVester.setGov(timelock.address), "glpVester.setGov")

    await sendTxn(usdg.setGov(timelock.address), "usdg.setGov")
    await sendTxn(glp.setGov(timelock.address), "glp.setGov")
    await sendTxn(esGmx.setGov(timelock.address), "esGmx.setGov")
    await sendTxn(bnGmx.setGov(timelock.address), "bnGmx.setGov")
    await sendTxn(vault.setGov(timelock.address), "vault.setGov")

    await sendTxn(positionManager.setLiquidator(orderKeeper.address), "positionManager.setLiquidator")
    await sendTxn(positionManager.setGov(timelock.address), "positionManager.setGov")
    await sendTxn(positionRouter.setGov(timelock.address), "positionRouter.setGov")

    //TODO
    await sendTxn(vaultErrorController.setGov(timelock.address), "vaultErrorController.setGov")

    //TODO set something for gmxTimelock. the initial gov of gmx is contract deployer, so this can be latter set
    await sendTxn(gmx.setGov(gmxTimelock.address), "gmx.setGov")

    //set be set latter
    await sendTxn(referralStorage.setGov(timelock.address), "referralStorage.setGov")

    //set something for gmxTimelock

    //set something for timelock

  // const vaultPriceFeed = await contractAt("VaultPriceFeed", "0x30333ce00ac3025276927672aaefd80f22e89e54")
  // const secondaryPriceFeed = await deployContract("FastPriceFeed", [5 * 60])
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
