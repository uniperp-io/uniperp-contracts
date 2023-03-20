const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, reportGasUsed, print, newWallet } = require("../shared/utilities")
const { toChainlinkPrice } = require("../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../shared/units")
const { initVault, getBnbConfig, getBtcConfig, getDaiConfig } = require("../core/Vault/helpers")
const { ADDRESS_ZERO } = require("@uniswap/v3-sdk")

use(solidity)

describe("RewardRouter", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3] = provider.getWallets()

  let vault
  let ulpManager
  let ulp
  let usdg
  let router
  let vaultPriceFeed
  let bnb
  let bnbPriceFeed
  let btc
  let btcPriceFeed
  let eth
  let ethPriceFeed
  let dai
  let daiPriceFeed
  let busd
  let busdPriceFeed

  let unip
  let esUnip
  let bnUnip

  let stakedUnipTracker
  let stakedUnipDistributor
  let bonusUnipTracker
  let bonusUnipDistributor
  let feeUnipTracker
  let feeUnipDistributor

  let feeUlpTracker
  let feeUlpDistributor
  let stakedUlpTracker
  let stakedUlpDistributor

  let rewardRouter

  beforeEach(async () => {
    bnb = await deployContract("Token", [])
    bnbPriceFeed = await deployContract("PriceFeed", [])

    btc = await deployContract("Token", [])
    btcPriceFeed = await deployContract("PriceFeed", [])

    eth = await deployContract("Token", [])
    ethPriceFeed = await deployContract("PriceFeed", [])

    dai = await deployContract("Token", [])
    daiPriceFeed = await deployContract("PriceFeed", [])

    busd = await deployContract("Token", [])
    busdPriceFeed = await deployContract("PriceFeed", [])

    vault = await deployContract("Vault", [])
    usdg = await deployContract("USDG", [vault.address])
    router = await deployContract("Router", [vault.address, usdg.address, bnb.address])
    vaultPriceFeed = await deployContract("VaultPriceFeed", [])
    ulp = await deployContract("ULP", [])

    await initVault(vault, router, usdg, vaultPriceFeed)
    ulpManager = await deployContract("UlpManager", [vault.address, usdg.address, ulp.address, ethers.constants.AddressZero, 24 * 60 * 60])

    await vaultPriceFeed.setTokenConfig(bnb.address, bnbPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(btc.address, btcPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(eth.address, ethPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(dai.address, daiPriceFeed.address, 8, false)

    await daiPriceFeed.setLatestAnswer(toChainlinkPrice(1))
    await vault.setTokenConfig(...getDaiConfig(dai, daiPriceFeed))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(60000))
    await vault.setTokenConfig(...getBtcConfig(btc, btcPriceFeed))

    await bnbPriceFeed.setLatestAnswer(toChainlinkPrice(300))
    await vault.setTokenConfig(...getBnbConfig(bnb, bnbPriceFeed))

    await ulp.setInPrivateTransferMode(true)
    await ulp.setMinter(ulpManager.address, true)
    await ulpManager.setInPrivateMode(true)

    unip = await deployContract("UNIP", []);
    esUnip = await deployContract("EsUNIP", []);
    bnUnip = await deployContract("MintableBaseToken", ["Bonus UNIP", "bnUNIP", 0]);

    // UNIP
    stakedUnipTracker = await deployContract("RewardTracker", ["Staked UNIP", "sUNIP"])
    stakedUnipDistributor = await deployContract("RewardDistributor", [esUnip.address, stakedUnipTracker.address])
    await stakedUnipTracker.initialize([unip.address, esUnip.address], stakedUnipDistributor.address)
    await stakedUnipDistributor.updateLastDistributionTime()

    bonusUnipTracker = await deployContract("RewardTracker", ["Staked + Bonus UNIP", "sbUNIP"])
    bonusUnipDistributor = await deployContract("BonusDistributor", [bnUnip.address, bonusUnipTracker.address])
    await bonusUnipTracker.initialize([stakedUnipTracker.address], bonusUnipDistributor.address)
    await bonusUnipDistributor.updateLastDistributionTime()

    feeUnipTracker = await deployContract("RewardTracker", ["Staked + Bonus + Fee UNIP", "sbfUNIP"])
    feeUnipDistributor = await deployContract("RewardDistributor", [eth.address, feeUnipTracker.address])
    await feeUnipTracker.initialize([bonusUnipTracker.address, bnUnip.address], feeUnipDistributor.address)
    await feeUnipDistributor.updateLastDistributionTime()

    // ULP
    feeUlpTracker = await deployContract("RewardTracker", ["Fee ULP", "fULP"])
    feeUlpDistributor = await deployContract("RewardDistributor", [eth.address, feeUlpTracker.address])
    await feeUlpTracker.initialize([ulp.address], feeUlpDistributor.address)
    await feeUlpDistributor.updateLastDistributionTime()

    stakedUlpTracker = await deployContract("RewardTracker", ["Fee + Staked ULP", "fsULP"])
    stakedUlpDistributor = await deployContract("RewardDistributor", [esUnip.address, stakedUlpTracker.address])
    await stakedUlpTracker.initialize([feeUlpTracker.address], stakedUlpDistributor.address)
    await stakedUlpDistributor.updateLastDistributionTime()

    await stakedUnipTracker.setInPrivateTransferMode(true)
    await stakedUnipTracker.setInPrivateStakingMode(true)
    await bonusUnipTracker.setInPrivateTransferMode(true)
    await bonusUnipTracker.setInPrivateStakingMode(true)
    await bonusUnipTracker.setInPrivateClaimingMode(true)
    await feeUnipTracker.setInPrivateTransferMode(true)
    await feeUnipTracker.setInPrivateStakingMode(true)

    await feeUlpTracker.setInPrivateTransferMode(true)
    await feeUlpTracker.setInPrivateStakingMode(true)
    await stakedUlpTracker.setInPrivateTransferMode(true)
    await stakedUlpTracker.setInPrivateStakingMode(true)

    rewardRouter = await deployContract("RewardRouter", [])
    await rewardRouter.initialize(
      bnb.address,
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
    )

    // allow rewardRouter to stake in stakedUnipTracker
    await stakedUnipTracker.setHandler(rewardRouter.address, true)
    // allow bonusUnipTracker to stake stakedUnipTracker
    await stakedUnipTracker.setHandler(bonusUnipTracker.address, true)
    // allow rewardRouter to stake in bonusUnipTracker
    await bonusUnipTracker.setHandler(rewardRouter.address, true)
    // allow bonusUnipTracker to stake feeUnipTracker
    await bonusUnipTracker.setHandler(feeUnipTracker.address, true)
    await bonusUnipDistributor.setBonusMultiplier(10000)
    // allow rewardRouter to stake in feeUnipTracker
    await feeUnipTracker.setHandler(rewardRouter.address, true)
    // allow feeUnipTracker to stake bnUnip
    await bnUnip.setHandler(feeUnipTracker.address, true)
    // allow rewardRouter to burn bnUnip
    await bnUnip.setMinter(rewardRouter.address, true)

    // allow rewardRouter to mint in ulpManager
    await ulpManager.setHandler(rewardRouter.address, true)
    // allow rewardRouter to stake in feeUlpTracker
    await feeUlpTracker.setHandler(rewardRouter.address, true)
    // allow stakedUlpTracker to stake feeUlpTracker
    await feeUlpTracker.setHandler(stakedUlpTracker.address, true)
    // allow rewardRouter to sake in stakedUlpTracker
    await stakedUlpTracker.setHandler(rewardRouter.address, true)
    // allow feeUlpTracker to stake ulp
    await ulp.setHandler(feeUlpTracker.address, true)

    // mint esUnip for distributors
    await esUnip.setMinter(wallet.address, true)
    await esUnip.mint(stakedUnipDistributor.address, expandDecimals(50000, 18))
    await stakedUnipDistributor.setTokensPerInterval("20667989410000000") // 0.02066798941 esUnip per second
    await esUnip.mint(stakedUlpDistributor.address, expandDecimals(50000, 18))
    await stakedUlpDistributor.setTokensPerInterval("20667989410000000") // 0.02066798941 esUnip per second

    await esUnip.setInPrivateTransferMode(true)
    await esUnip.setHandler(stakedUnipDistributor.address, true)
    await esUnip.setHandler(stakedUlpDistributor.address, true)
    await esUnip.setHandler(stakedUnipTracker.address, true)
    await esUnip.setHandler(stakedUlpTracker.address, true)
    await esUnip.setHandler(rewardRouter.address, true)

    // mint bnUnip for distributor
    await bnUnip.setMinter(wallet.address, true)
    await bnUnip.mint(bonusUnipDistributor.address, expandDecimals(1500, 18))
  })

  it("inits", async () => {
    expect(await rewardRouter.isInitialized()).eq(true)

    expect(await rewardRouter.weth()).eq(bnb.address)
    expect(await rewardRouter.unip()).eq(unip.address)
    expect(await rewardRouter.esUnip()).eq(esUnip.address)
    expect(await rewardRouter.bnUnip()).eq(bnUnip.address)

    expect(await rewardRouter.ulp()).eq(ulp.address)

    expect(await rewardRouter.stakedUnipTracker()).eq(stakedUnipTracker.address)
    expect(await rewardRouter.bonusUnipTracker()).eq(bonusUnipTracker.address)
    expect(await rewardRouter.feeUnipTracker()).eq(feeUnipTracker.address)

    expect(await rewardRouter.feeUlpTracker()).eq(feeUlpTracker.address)
    expect(await rewardRouter.stakedUlpTracker()).eq(stakedUlpTracker.address)

    expect(await rewardRouter.ulpManager()).eq(ulpManager.address)

    await expect(rewardRouter.initialize(
      bnb.address,
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
    )).to.be.revertedWith("RewardRouter: already initialized")
  })

  it("stakeUnipForAccount, stakeUnip, stakeEsUnip, unstakeUnip, unstakeEsUnip, claimEsUnip, claimFees, compound, batchCompoundForAccounts", async () => {
    await eth.mint(feeUnipDistributor.address, expandDecimals(100, 18))
    await feeUnipDistributor.setTokensPerInterval("41335970000000") // 0.00004133597 ETH per second

    await unip.setMinter(wallet.address, true)
    await unip.mint(user0.address, expandDecimals(1500, 18))
    expect(await unip.balanceOf(user0.address)).eq(expandDecimals(1500, 18))

    await unip.connect(user0).approve(stakedUnipTracker.address, expandDecimals(1000, 18))
    await expect(rewardRouter.connect(user0).stakeUnipForAccount(user1.address, expandDecimals(1000, 18)))
      .to.be.revertedWith("Governable: forbidden")

    await rewardRouter.setGov(user0.address)
    await rewardRouter.connect(user0).stakeUnipForAccount(user1.address, expandDecimals(800, 18))
    expect(await unip.balanceOf(user0.address)).eq(expandDecimals(700, 18))

    await unip.mint(user1.address, expandDecimals(200, 18))
    expect(await unip.balanceOf(user1.address)).eq(expandDecimals(200, 18))
    await unip.connect(user1).approve(stakedUnipTracker.address, expandDecimals(200, 18))
    await rewardRouter.connect(user1).stakeUnip(expandDecimals(200, 18))
    expect(await unip.balanceOf(user1.address)).eq(0)

    expect(await stakedUnipTracker.stakedAmounts(user0.address)).eq(0)
    expect(await stakedUnipTracker.depositBalances(user0.address, unip.address)).eq(0)
    expect(await stakedUnipTracker.stakedAmounts(user1.address)).eq(expandDecimals(1000, 18))
    expect(await stakedUnipTracker.depositBalances(user1.address, unip.address)).eq(expandDecimals(1000, 18))

    expect(await bonusUnipTracker.stakedAmounts(user0.address)).eq(0)
    expect(await bonusUnipTracker.depositBalances(user0.address, stakedUnipTracker.address)).eq(0)
    expect(await bonusUnipTracker.stakedAmounts(user1.address)).eq(expandDecimals(1000, 18))
    expect(await bonusUnipTracker.depositBalances(user1.address, stakedUnipTracker.address)).eq(expandDecimals(1000, 18))

    expect(await feeUnipTracker.stakedAmounts(user0.address)).eq(0)
    expect(await feeUnipTracker.depositBalances(user0.address, bonusUnipTracker.address)).eq(0)
    expect(await feeUnipTracker.stakedAmounts(user1.address)).eq(expandDecimals(1000, 18))
    expect(await feeUnipTracker.depositBalances(user1.address, bonusUnipTracker.address)).eq(expandDecimals(1000, 18))

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    expect(await stakedUnipTracker.claimable(user0.address)).eq(0)
    expect(await stakedUnipTracker.claimable(user1.address)).gt(expandDecimals(1785, 18)) // 50000 / 28 => ~1785
    expect(await stakedUnipTracker.claimable(user1.address)).lt(expandDecimals(1786, 18))

    expect(await bonusUnipTracker.claimable(user0.address)).eq(0)
    expect(await bonusUnipTracker.claimable(user1.address)).gt("2730000000000000000") // 2.73, 1000 / 365 => ~2.74
    expect(await bonusUnipTracker.claimable(user1.address)).lt("2750000000000000000") // 2.75

    expect(await feeUnipTracker.claimable(user0.address)).eq(0)
    expect(await feeUnipTracker.claimable(user1.address)).gt("3560000000000000000") // 3.56, 100 / 28 => ~3.57
    expect(await feeUnipTracker.claimable(user1.address)).lt("3580000000000000000") // 3.58

    await esUnip.setMinter(wallet.address, true)
    await esUnip.mint(user2.address, expandDecimals(500, 18))
    await rewardRouter.connect(user2).stakeEsUnip(expandDecimals(500, 18))

    expect(await stakedUnipTracker.stakedAmounts(user0.address)).eq(0)
    expect(await stakedUnipTracker.depositBalances(user0.address, unip.address)).eq(0)
    expect(await stakedUnipTracker.stakedAmounts(user1.address)).eq(expandDecimals(1000, 18))
    expect(await stakedUnipTracker.depositBalances(user1.address, unip.address)).eq(expandDecimals(1000, 18))
    expect(await stakedUnipTracker.stakedAmounts(user2.address)).eq(expandDecimals(500, 18))
    expect(await stakedUnipTracker.depositBalances(user2.address, esUnip.address)).eq(expandDecimals(500, 18))

    expect(await bonusUnipTracker.stakedAmounts(user0.address)).eq(0)
    expect(await bonusUnipTracker.depositBalances(user0.address, stakedUnipTracker.address)).eq(0)
    expect(await bonusUnipTracker.stakedAmounts(user1.address)).eq(expandDecimals(1000, 18))
    expect(await bonusUnipTracker.depositBalances(user1.address, stakedUnipTracker.address)).eq(expandDecimals(1000, 18))
    expect(await bonusUnipTracker.stakedAmounts(user2.address)).eq(expandDecimals(500, 18))
    expect(await bonusUnipTracker.depositBalances(user2.address, stakedUnipTracker.address)).eq(expandDecimals(500, 18))

    expect(await feeUnipTracker.stakedAmounts(user0.address)).eq(0)
    expect(await feeUnipTracker.depositBalances(user0.address, bonusUnipTracker.address)).eq(0)
    expect(await feeUnipTracker.stakedAmounts(user1.address)).eq(expandDecimals(1000, 18))
    expect(await feeUnipTracker.depositBalances(user1.address, bonusUnipTracker.address)).eq(expandDecimals(1000, 18))
    expect(await feeUnipTracker.stakedAmounts(user2.address)).eq(expandDecimals(500, 18))
    expect(await feeUnipTracker.depositBalances(user2.address, bonusUnipTracker.address)).eq(expandDecimals(500, 18))

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    expect(await stakedUnipTracker.claimable(user0.address)).eq(0)
    expect(await stakedUnipTracker.claimable(user1.address)).gt(expandDecimals(1785 + 1190, 18))
    expect(await stakedUnipTracker.claimable(user1.address)).lt(expandDecimals(1786 + 1191, 18))
    expect(await stakedUnipTracker.claimable(user2.address)).gt(expandDecimals(595, 18))
    expect(await stakedUnipTracker.claimable(user2.address)).lt(expandDecimals(596, 18))

    expect(await bonusUnipTracker.claimable(user0.address)).eq(0)
    expect(await bonusUnipTracker.claimable(user1.address)).gt("5470000000000000000") // 5.47, 1000 / 365 * 2 => ~5.48
    expect(await bonusUnipTracker.claimable(user1.address)).lt("5490000000000000000")
    expect(await bonusUnipTracker.claimable(user2.address)).gt("1360000000000000000") // 1.36, 500 / 365 => ~1.37
    expect(await bonusUnipTracker.claimable(user2.address)).lt("1380000000000000000")

    expect(await feeUnipTracker.claimable(user0.address)).eq(0)
    expect(await feeUnipTracker.claimable(user1.address)).gt("5940000000000000000") // 5.94, 3.57 + 100 / 28 / 3 * 2 => ~5.95
    expect(await feeUnipTracker.claimable(user1.address)).lt("5960000000000000000")
    expect(await feeUnipTracker.claimable(user2.address)).gt("1180000000000000000") // 1.18, 100 / 28 / 3 => ~1.19
    expect(await feeUnipTracker.claimable(user2.address)).lt("1200000000000000000")

    expect(await esUnip.balanceOf(user1.address)).eq(0)
    await rewardRouter.connect(user1).claimEsUnip()
    expect(await esUnip.balanceOf(user1.address)).gt(expandDecimals(1785 + 1190, 18))
    expect(await esUnip.balanceOf(user1.address)).lt(expandDecimals(1786 + 1191, 18))

    expect(await eth.balanceOf(user1.address)).eq(0)
    await rewardRouter.connect(user1).claimFees()
    expect(await eth.balanceOf(user1.address)).gt("5940000000000000000")
    expect(await eth.balanceOf(user1.address)).lt("5960000000000000000")

    expect(await esUnip.balanceOf(user2.address)).eq(0)
    await rewardRouter.connect(user2).claimEsUnip()
    expect(await esUnip.balanceOf(user2.address)).gt(expandDecimals(595, 18))
    expect(await esUnip.balanceOf(user2.address)).lt(expandDecimals(596, 18))

    expect(await eth.balanceOf(user2.address)).eq(0)
    await rewardRouter.connect(user2).claimFees()
    expect(await eth.balanceOf(user2.address)).gt("1180000000000000000")
    expect(await eth.balanceOf(user2.address)).lt("1200000000000000000")

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    const tx0 = await rewardRouter.connect(user1).compound()
    await reportGasUsed(provider, tx0, "compound gas used")

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    const tx1 = await rewardRouter.connect(user0).batchCompoundForAccounts([user1.address, user2.address])
    await reportGasUsed(provider, tx1, "batchCompoundForAccounts gas used")

    expect(await stakedUnipTracker.stakedAmounts(user1.address)).gt(expandDecimals(3643, 18))
    expect(await stakedUnipTracker.stakedAmounts(user1.address)).lt(expandDecimals(3645, 18))
    expect(await stakedUnipTracker.depositBalances(user1.address, unip.address)).eq(expandDecimals(1000, 18))
    expect(await stakedUnipTracker.depositBalances(user1.address, esUnip.address)).gt(expandDecimals(2643, 18))
    expect(await stakedUnipTracker.depositBalances(user1.address, esUnip.address)).lt(expandDecimals(2645, 18))

    expect(await bonusUnipTracker.stakedAmounts(user1.address)).gt(expandDecimals(3643, 18))
    expect(await bonusUnipTracker.stakedAmounts(user1.address)).lt(expandDecimals(3645, 18))

    expect(await feeUnipTracker.stakedAmounts(user1.address)).gt(expandDecimals(3657, 18))
    expect(await feeUnipTracker.stakedAmounts(user1.address)).lt(expandDecimals(3659, 18))
    expect(await feeUnipTracker.depositBalances(user1.address, bonusUnipTracker.address)).gt(expandDecimals(3643, 18))
    expect(await feeUnipTracker.depositBalances(user1.address, bonusUnipTracker.address)).lt(expandDecimals(3645, 18))
    expect(await feeUnipTracker.depositBalances(user1.address, bnUnip.address)).gt("14100000000000000000") // 14.1
    expect(await feeUnipTracker.depositBalances(user1.address, bnUnip.address)).lt("14300000000000000000") // 14.3

    expect(await unip.balanceOf(user1.address)).eq(0)
    await rewardRouter.connect(user1).unstakeUnip(expandDecimals(300, 18))
    expect(await unip.balanceOf(user1.address)).eq(expandDecimals(300, 18))

    expect(await stakedUnipTracker.stakedAmounts(user1.address)).gt(expandDecimals(3343, 18))
    expect(await stakedUnipTracker.stakedAmounts(user1.address)).lt(expandDecimals(3345, 18))
    expect(await stakedUnipTracker.depositBalances(user1.address, unip.address)).eq(expandDecimals(700, 18))
    expect(await stakedUnipTracker.depositBalances(user1.address, esUnip.address)).gt(expandDecimals(2643, 18))
    expect(await stakedUnipTracker.depositBalances(user1.address, esUnip.address)).lt(expandDecimals(2645, 18))

    expect(await bonusUnipTracker.stakedAmounts(user1.address)).gt(expandDecimals(3343, 18))
    expect(await bonusUnipTracker.stakedAmounts(user1.address)).lt(expandDecimals(3345, 18))

    expect(await feeUnipTracker.stakedAmounts(user1.address)).gt(expandDecimals(3357, 18))
    expect(await feeUnipTracker.stakedAmounts(user1.address)).lt(expandDecimals(3359, 18))
    expect(await feeUnipTracker.depositBalances(user1.address, bonusUnipTracker.address)).gt(expandDecimals(3343, 18))
    expect(await feeUnipTracker.depositBalances(user1.address, bonusUnipTracker.address)).lt(expandDecimals(3345, 18))
    expect(await feeUnipTracker.depositBalances(user1.address, bnUnip.address)).gt("13000000000000000000") // 13
    expect(await feeUnipTracker.depositBalances(user1.address, bnUnip.address)).lt("13100000000000000000") // 13.1

    const esUnipBalance1 = await esUnip.balanceOf(user1.address)
    const esUnipUnstakeBalance1 = await stakedUnipTracker.depositBalances(user1.address, esUnip.address)
    await rewardRouter.connect(user1).unstakeEsUnip(esUnipUnstakeBalance1)
    expect(await esUnip.balanceOf(user1.address)).eq(esUnipBalance1.add(esUnipUnstakeBalance1))

    expect(await stakedUnipTracker.stakedAmounts(user1.address)).eq(expandDecimals(700, 18))
    expect(await stakedUnipTracker.depositBalances(user1.address, unip.address)).eq(expandDecimals(700, 18))
    expect(await stakedUnipTracker.depositBalances(user1.address, esUnip.address)).eq(0)

    expect(await bonusUnipTracker.stakedAmounts(user1.address)).eq(expandDecimals(700, 18))

    expect(await feeUnipTracker.stakedAmounts(user1.address)).gt(expandDecimals(702, 18))
    expect(await feeUnipTracker.stakedAmounts(user1.address)).lt(expandDecimals(703, 18))
    expect(await feeUnipTracker.depositBalances(user1.address, bonusUnipTracker.address)).eq(expandDecimals(700, 18))
    expect(await feeUnipTracker.depositBalances(user1.address, bnUnip.address)).gt("2720000000000000000") // 2.72
    expect(await feeUnipTracker.depositBalances(user1.address, bnUnip.address)).lt("2740000000000000000") // 2.74

    await expect(rewardRouter.connect(user1).unstakeEsUnip(expandDecimals(1, 18)))
      .to.be.revertedWith("RewardTracker: _amount exceeds depositBalance")
  })

  it("mintAndStakeUlp, unstakeAndRedeemUlp, compound, batchCompoundForAccounts", async () => {
    await eth.mint(feeUlpDistributor.address, expandDecimals(100, 18))
    await feeUlpDistributor.setTokensPerInterval("41335970000000") // 0.00004133597 ETH per second

    await bnb.mint(user1.address, expandDecimals(1, 18))
    await bnb.connect(user1).approve(ulpManager.address, expandDecimals(1, 18))
    const tx0 = await rewardRouter.connect(user1).mintAndStakeUlp(
      bnb.address,
      expandDecimals(1, 18),
      expandDecimals(299, 18),
      expandDecimals(299, 18)
    )
    await reportGasUsed(provider, tx0, "mintAndStakeUlp gas used")

    expect(await feeUlpTracker.stakedAmounts(user1.address)).eq(expandDecimals(2991, 17))
    expect(await feeUlpTracker.depositBalances(user1.address, ulp.address)).eq(expandDecimals(2991, 17))

    expect(await stakedUlpTracker.stakedAmounts(user1.address)).eq(expandDecimals(2991, 17))
    expect(await stakedUlpTracker.depositBalances(user1.address, feeUlpTracker.address)).eq(expandDecimals(2991, 17))

    await bnb.mint(user1.address, expandDecimals(2, 18))
    await bnb.connect(user1).approve(ulpManager.address, expandDecimals(2, 18))
    await rewardRouter.connect(user1).mintAndStakeUlp(
      bnb.address,
      expandDecimals(2, 18),
      expandDecimals(299, 18),
      expandDecimals(299, 18)
    )

    await increaseTime(provider, 24 * 60 * 60 + 1)
    await mineBlock(provider)

    expect(await feeUlpTracker.claimable(user1.address)).gt("3560000000000000000") // 3.56, 100 / 28 => ~3.57
    expect(await feeUlpTracker.claimable(user1.address)).lt("3580000000000000000") // 3.58

    expect(await stakedUlpTracker.claimable(user1.address)).gt(expandDecimals(1785, 18)) // 50000 / 28 => ~1785
    expect(await stakedUlpTracker.claimable(user1.address)).lt(expandDecimals(1786, 18))

    await bnb.mint(user2.address, expandDecimals(1, 18))
    await bnb.connect(user2).approve(ulpManager.address, expandDecimals(1, 18))
    await rewardRouter.connect(user2).mintAndStakeUlp(
      bnb.address,
      expandDecimals(1, 18),
      expandDecimals(299, 18),
      expandDecimals(299, 18)
    )

    await expect(rewardRouter.connect(user2).unstakeAndRedeemUlp(
      bnb.address,
      expandDecimals(299, 18),
      "990000000000000000", // 0.99
      user2.address
    )).to.be.revertedWith("UlpManager: cooldown duration not yet passed")

    expect(await feeUlpTracker.stakedAmounts(user1.address)).eq("897300000000000000000") // 897.3
    expect(await stakedUlpTracker.stakedAmounts(user1.address)).eq("897300000000000000000")
    expect(await bnb.balanceOf(user1.address)).eq(0)

    const tx1 = await rewardRouter.connect(user1).unstakeAndRedeemUlp(
      bnb.address,
      expandDecimals(299, 18),
      "990000000000000000", // 0.99
      user1.address
    )
    await reportGasUsed(provider, tx1, "unstakeAndRedeemUlp gas used")

    expect(await feeUlpTracker.stakedAmounts(user1.address)).eq("598300000000000000000") // 598.3
    expect(await stakedUlpTracker.stakedAmounts(user1.address)).eq("598300000000000000000")
    expect(await bnb.balanceOf(user1.address)).eq("993676666666666666") // ~0.99

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    expect(await feeUlpTracker.claimable(user1.address)).gt("5940000000000000000") // 5.94, 3.57 + 100 / 28 / 3 * 2 => ~5.95
    expect(await feeUlpTracker.claimable(user1.address)).lt("5960000000000000000")
    expect(await feeUlpTracker.claimable(user2.address)).gt("1180000000000000000") // 1.18, 100 / 28 / 3 => ~1.19
    expect(await feeUlpTracker.claimable(user2.address)).lt("1200000000000000000")

    expect(await stakedUlpTracker.claimable(user1.address)).gt(expandDecimals(1785 + 1190, 18))
    expect(await stakedUlpTracker.claimable(user1.address)).lt(expandDecimals(1786 + 1191, 18))
    expect(await stakedUlpTracker.claimable(user2.address)).gt(expandDecimals(595, 18))
    expect(await stakedUlpTracker.claimable(user2.address)).lt(expandDecimals(596, 18))

    expect(await esUnip.balanceOf(user1.address)).eq(0)
    await rewardRouter.connect(user1).claimEsUnip()
    expect(await esUnip.balanceOf(user1.address)).gt(expandDecimals(1785 + 1190, 18))
    expect(await esUnip.balanceOf(user1.address)).lt(expandDecimals(1786 + 1191, 18))

    expect(await eth.balanceOf(user1.address)).eq(0)
    await rewardRouter.connect(user1).claimFees()
    expect(await eth.balanceOf(user1.address)).gt("5940000000000000000")
    expect(await eth.balanceOf(user1.address)).lt("5960000000000000000")

    expect(await esUnip.balanceOf(user2.address)).eq(0)
    await rewardRouter.connect(user2).claimEsUnip()
    expect(await esUnip.balanceOf(user2.address)).gt(expandDecimals(595, 18))
    expect(await esUnip.balanceOf(user2.address)).lt(expandDecimals(596, 18))

    expect(await eth.balanceOf(user2.address)).eq(0)
    await rewardRouter.connect(user2).claimFees()
    expect(await eth.balanceOf(user2.address)).gt("1180000000000000000")
    expect(await eth.balanceOf(user2.address)).lt("1200000000000000000")

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    const tx2 = await rewardRouter.connect(user1).compound()
    await reportGasUsed(provider, tx2, "compound gas used")

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    const tx3 = await rewardRouter.batchCompoundForAccounts([user1.address, user2.address])
    await reportGasUsed(provider, tx1, "batchCompoundForAccounts gas used")

    expect(await stakedUnipTracker.stakedAmounts(user1.address)).gt(expandDecimals(4165, 18))
    expect(await stakedUnipTracker.stakedAmounts(user1.address)).lt(expandDecimals(4167, 18))
    expect(await stakedUnipTracker.depositBalances(user1.address, unip.address)).eq(0)
    expect(await stakedUnipTracker.depositBalances(user1.address, esUnip.address)).gt(expandDecimals(4165, 18))
    expect(await stakedUnipTracker.depositBalances(user1.address, esUnip.address)).lt(expandDecimals(4167, 18))

    expect(await bonusUnipTracker.stakedAmounts(user1.address)).gt(expandDecimals(4165, 18))
    expect(await bonusUnipTracker.stakedAmounts(user1.address)).lt(expandDecimals(4167, 18))

    expect(await feeUnipTracker.stakedAmounts(user1.address)).gt(expandDecimals(4179, 18))
    expect(await feeUnipTracker.stakedAmounts(user1.address)).lt(expandDecimals(4180, 18))
    expect(await feeUnipTracker.depositBalances(user1.address, bonusUnipTracker.address)).gt(expandDecimals(4165, 18))
    expect(await feeUnipTracker.depositBalances(user1.address, bonusUnipTracker.address)).lt(expandDecimals(4167, 18))
    expect(await feeUnipTracker.depositBalances(user1.address, bnUnip.address)).gt("12900000000000000000") // 12.9
    expect(await feeUnipTracker.depositBalances(user1.address, bnUnip.address)).lt("13100000000000000000") // 13.1

    expect(await feeUlpTracker.stakedAmounts(user1.address)).eq("598300000000000000000") // 598.3
    expect(await stakedUlpTracker.stakedAmounts(user1.address)).eq("598300000000000000000")
    expect(await bnb.balanceOf(user1.address)).eq("993676666666666666") // ~0.99
  })

  it("mintAndStakeUlpETH, unstakeAndRedeemUlpETH", async () => {
    const receiver0 = newWallet()
    await expect(rewardRouter.connect(user0).mintAndStakeUlpETH(expandDecimals(300, 18), expandDecimals(300, 18), { value: 0 }))
      .to.be.revertedWith("RewardRouter: invalid msg.value")

    await expect(rewardRouter.connect(user0).mintAndStakeUlpETH(expandDecimals(300, 18), expandDecimals(300, 18), { value: expandDecimals(1, 18) }))
      .to.be.revertedWith("UlpManager: insufficient USDG output")

    await expect(rewardRouter.connect(user0).mintAndStakeUlpETH(expandDecimals(299, 18), expandDecimals(300, 18), { value: expandDecimals(1, 18) }))
      .to.be.revertedWith("UlpManager: insufficient ULP output")

    expect(await bnb.balanceOf(user0.address)).eq(0)
    expect(await bnb.balanceOf(vault.address)).eq(0)
    expect(await bnb.totalSupply()).eq(0)
    expect(await provider.getBalance(bnb.address)).eq(0)
    expect(await stakedUlpTracker.balanceOf(user0.address)).eq(0)

    await rewardRouter.connect(user0).mintAndStakeUlpETH(expandDecimals(299, 18), expandDecimals(299, 18), { value: expandDecimals(1, 18) })

    expect(await bnb.balanceOf(user0.address)).eq(0)
    expect(await bnb.balanceOf(vault.address)).eq(expandDecimals(1, 18))
    expect(await provider.getBalance(bnb.address)).eq(expandDecimals(1, 18))
    expect(await bnb.totalSupply()).eq(expandDecimals(1, 18))
    expect(await stakedUlpTracker.balanceOf(user0.address)).eq("299100000000000000000") // 299.1

    await expect(rewardRouter.connect(user0).unstakeAndRedeemUlpETH(expandDecimals(300, 18), expandDecimals(1, 18), receiver0.address))
      .to.be.revertedWith("RewardTracker: _amount exceeds stakedAmount")

    await expect(rewardRouter.connect(user0).unstakeAndRedeemUlpETH("299100000000000000000", expandDecimals(1, 18), receiver0.address))
      .to.be.revertedWith("UlpManager: cooldown duration not yet passed")

    await increaseTime(provider, 24 * 60 * 60 + 10)

    await expect(rewardRouter.connect(user0).unstakeAndRedeemUlpETH("299100000000000000000", expandDecimals(1, 18), receiver0.address))
      .to.be.revertedWith("UlpManager: insufficient output")

    await rewardRouter.connect(user0).unstakeAndRedeemUlpETH("299100000000000000000", "990000000000000000", receiver0.address)
    expect(await provider.getBalance(receiver0.address)).eq("994009000000000000") // 0.994009
    expect(await bnb.balanceOf(vault.address)).eq("5991000000000000") // 0.005991
    expect(await provider.getBalance(bnb.address)).eq("5991000000000000")
    expect(await bnb.totalSupply()).eq("5991000000000000")
  })
})
