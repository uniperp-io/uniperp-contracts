const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, reportGasUsed, print } = require("../shared/utilities")
const { toChainlinkPrice } = require("../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../shared/units")

use(solidity)

describe("BonusDistributor", function () {
  const provider = waffle.provider
  const [wallet, rewardRouter, user0, user1, user2, user3] = provider.getWallets()
  let unip
  let esUnip
  let bnUnip
  let stakedUnipTracker
  let stakedUnipDistributor
  let bonusUnipTracker
  let bonusUnipDistributor

  beforeEach(async () => {
    unip = await deployContract("UNIP", []);
    esUnip = await deployContract("EsUNIP", []);
    bnUnip = await deployContract("MintableBaseToken", ["Bonus UNIP", "bnUNIP", 0]);

    stakedUnipTracker = await deployContract("RewardTracker", ["Staked UNIP", "stUNIP"])
    stakedUnipDistributor = await deployContract("RewardDistributor", [esUnip.address, stakedUnipTracker.address])
    await stakedUnipDistributor.updateLastDistributionTime()

    bonusUnipTracker = await deployContract("RewardTracker", ["Staked + Bonus UNIP", "sbUNIP"])
    bonusUnipDistributor = await deployContract("BonusDistributor", [bnUnip.address, bonusUnipTracker.address])
    await bonusUnipDistributor.updateLastDistributionTime()

    await stakedUnipTracker.initialize([unip.address, esUnip.address], stakedUnipDistributor.address)
    await bonusUnipTracker.initialize([stakedUnipTracker.address], bonusUnipDistributor.address)

    await stakedUnipTracker.setInPrivateTransferMode(true)
    await stakedUnipTracker.setInPrivateStakingMode(true)
    await bonusUnipTracker.setInPrivateTransferMode(true)
    await bonusUnipTracker.setInPrivateStakingMode(true)

    await stakedUnipTracker.setHandler(rewardRouter.address, true)
    await stakedUnipTracker.setHandler(bonusUnipTracker.address, true)
    await bonusUnipTracker.setHandler(rewardRouter.address, true)
    await bonusUnipDistributor.setBonusMultiplier(10000)
  })

  it("distributes bonus", async () => {
    await esUnip.setMinter(wallet.address, true)
    await esUnip.mint(stakedUnipDistributor.address, expandDecimals(50000, 18))
    await bnUnip.setMinter(wallet.address, true)
    await bnUnip.mint(bonusUnipDistributor.address, expandDecimals(1500, 18))
    await stakedUnipDistributor.setTokensPerInterval("20667989410000000") // 0.02066798941 esUnip per second
    await unip.setMinter(wallet.address, true)
    await unip.mint(user0.address, expandDecimals(1000, 18))

    await unip.connect(user0).approve(stakedUnipTracker.address, expandDecimals(1001, 18))
    await expect(stakedUnipTracker.connect(rewardRouter).stakeForAccount(user0.address, user0.address, unip.address, expandDecimals(1001, 18)))
      .to.be.revertedWith("BaseToken: transfer amount exceeds balance")
    await stakedUnipTracker.connect(rewardRouter).stakeForAccount(user0.address, user0.address, unip.address, expandDecimals(1000, 18))
    await expect(bonusUnipTracker.connect(rewardRouter).stakeForAccount(user0.address, user0.address, stakedUnipTracker.address, expandDecimals(1001, 18)))
      .to.be.revertedWith("RewardTracker: transfer amount exceeds balance")
    await bonusUnipTracker.connect(rewardRouter).stakeForAccount(user0.address, user0.address, stakedUnipTracker.address, expandDecimals(1000, 18))

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    expect(await stakedUnipTracker.claimable(user0.address)).gt(expandDecimals(1785, 18)) // 50000 / 28 => ~1785
    expect(await stakedUnipTracker.claimable(user0.address)).lt(expandDecimals(1786, 18))
    expect(await bonusUnipTracker.claimable(user0.address)).gt("2730000000000000000") // 2.73, 1000 / 365 => ~2.74
    expect(await bonusUnipTracker.claimable(user0.address)).lt("2750000000000000000") // 2.75

    await esUnip.mint(user1.address, expandDecimals(500, 18))
    await esUnip.connect(user1).approve(stakedUnipTracker.address, expandDecimals(500, 18))
    await stakedUnipTracker.connect(rewardRouter).stakeForAccount(user1.address, user1.address, esUnip.address, expandDecimals(500, 18))
    await bonusUnipTracker.connect(rewardRouter).stakeForAccount(user1.address, user1.address, stakedUnipTracker.address, expandDecimals(500, 18))

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    expect(await stakedUnipTracker.claimable(user0.address)).gt(expandDecimals(1785 + 1190, 18))
    expect(await stakedUnipTracker.claimable(user0.address)).lt(expandDecimals(1786 + 1191, 18))

    expect(await stakedUnipTracker.claimable(user1.address)).gt(expandDecimals(595, 18))
    expect(await stakedUnipTracker.claimable(user1.address)).lt(expandDecimals(596, 18))

    expect(await bonusUnipTracker.claimable(user0.address)).gt("5470000000000000000") // 5.47, 1000 / 365 * 2 => ~5.48
    expect(await bonusUnipTracker.claimable(user0.address)).lt("5490000000000000000") // 5.49

    expect(await bonusUnipTracker.claimable(user1.address)).gt("1360000000000000000") // 1.36, 500 / 365 => ~1.37
    expect(await bonusUnipTracker.claimable(user1.address)).lt("1380000000000000000") // 1.38
  })
})
