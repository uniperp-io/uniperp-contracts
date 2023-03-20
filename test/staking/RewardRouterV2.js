const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, reportGasUsed, print, newWallet } = require("../shared/utilities")
const { toChainlinkPrice } = require("../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../shared/units")
const { initVault, getBnbConfig, getBtcConfig, getDaiConfig } = require("../core/Vault/helpers")

use(solidity)

describe("RewardRouterV2", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3, user4, tokenManager] = provider.getWallets()

  const vestingDuration = 365 * 24 * 60 * 60

  let timelock

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

  let unipVester
  let ulpVester

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

    timelock = await deployContract("Timelock", [
      wallet.address, // _admin
      10, // _buffer
      tokenManager.address, // _tokenManager
      tokenManager.address, // _mintReceiver
      ulpManager.address, // _ulpManager
      user0.address, // _rewardRouter
      expandDecimals(1000000, 18), // _maxTokenSupply
      10, // marginFeeBasisPoints
      100 // maxMarginFeeBasisPoints
    ])

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

    unipVester = await deployContract("Vester", [
      "Vested UNIP", // _name
      "vUNIP", // _symbol
      vestingDuration, // _vestingDuration
      esUnip.address, // _esToken
      feeUnipTracker.address, // _pairToken
      unip.address, // _claimableToken
      stakedUnipTracker.address, // _rewardTracker
    ])

    ulpVester = await deployContract("Vester", [
      "Vested ULP", // _name
      "vULP", // _symbol
      vestingDuration, // _vestingDuration
      esUnip.address, // _esToken
      stakedUlpTracker.address, // _pairToken
      unip.address, // _claimableToken
      stakedUlpTracker.address, // _rewardTracker
    ])

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

    await esUnip.setInPrivateTransferMode(true)

    rewardRouter = await deployContract("RewardRouterV2", [])
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
      ulpManager.address,
      unipVester.address,
      ulpVester.address
    )

    // allow bonusUnipTracker to stake stakedUnipTracker
    await stakedUnipTracker.setHandler(bonusUnipTracker.address, true)
    // allow bonusUnipTracker to stake feeUnipTracker
    await bonusUnipTracker.setHandler(feeUnipTracker.address, true)
    await bonusUnipDistributor.setBonusMultiplier(10000)
    // allow feeUnipTracker to stake bnUnip
    await bnUnip.setHandler(feeUnipTracker.address, true)

    // allow stakedUlpTracker to stake feeUlpTracker
    await feeUlpTracker.setHandler(stakedUlpTracker.address, true)
    // allow feeUlpTracker to stake ulp
    await ulp.setHandler(feeUlpTracker.address, true)

    // mint esUnip for distributors
    await esUnip.setMinter(wallet.address, true)
    await esUnip.mint(stakedUnipDistributor.address, expandDecimals(50000, 18))
    await stakedUnipDistributor.setTokensPerInterval("20667989410000000") // 0.02066798941 esUnip per second
    await esUnip.mint(stakedUlpDistributor.address, expandDecimals(50000, 18))
    await stakedUlpDistributor.setTokensPerInterval("20667989410000000") // 0.02066798941 esUnip per second

    // mint bnUnip for distributor
    await bnUnip.setMinter(wallet.address, true)
    await bnUnip.mint(bonusUnipDistributor.address, expandDecimals(1500, 18))

    await esUnip.setHandler(tokenManager.address, true)
    await unipVester.setHandler(wallet.address, true)

    await esUnip.setHandler(rewardRouter.address, true)
    await esUnip.setHandler(stakedUnipDistributor.address, true)
    await esUnip.setHandler(stakedUlpDistributor.address, true)
    await esUnip.setHandler(stakedUnipTracker.address, true)
    await esUnip.setHandler(stakedUlpTracker.address, true)
    await esUnip.setHandler(unipVester.address, true)
    await esUnip.setHandler(ulpVester.address, true)

    await ulpManager.setHandler(rewardRouter.address, true)
    await stakedUnipTracker.setHandler(rewardRouter.address, true)
    await bonusUnipTracker.setHandler(rewardRouter.address, true)
    await feeUnipTracker.setHandler(rewardRouter.address, true)
    await feeUlpTracker.setHandler(rewardRouter.address, true)
    await stakedUlpTracker.setHandler(rewardRouter.address, true)

    await esUnip.setHandler(rewardRouter.address, true)
    await bnUnip.setMinter(rewardRouter.address, true)
    await esUnip.setMinter(unipVester.address, true)
    await esUnip.setMinter(ulpVester.address, true)

    await unipVester.setHandler(rewardRouter.address, true)
    await ulpVester.setHandler(rewardRouter.address, true)

    await feeUnipTracker.setHandler(unipVester.address, true)
    await stakedUlpTracker.setHandler(ulpVester.address, true)

    await ulpManager.setGov(timelock.address)
    await stakedUnipTracker.setGov(timelock.address)
    await bonusUnipTracker.setGov(timelock.address)
    await feeUnipTracker.setGov(timelock.address)
    await feeUlpTracker.setGov(timelock.address)
    await stakedUlpTracker.setGov(timelock.address)
    await stakedUnipDistributor.setGov(timelock.address)
    await stakedUlpDistributor.setGov(timelock.address)
    await esUnip.setGov(timelock.address)
    await bnUnip.setGov(timelock.address)
    await unipVester.setGov(timelock.address)
    await ulpVester.setGov(timelock.address)
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

    expect(await rewardRouter.unipVester()).eq(unipVester.address)
    expect(await rewardRouter.ulpVester()).eq(ulpVester.address)

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
      ulpManager.address,
      unipVester.address,
      ulpVester.address
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

    await timelock.signalMint(esUnip.address, tokenManager.address, expandDecimals(500, 18))
    await increaseTime(provider, 20)
    await mineBlock(provider)

    await timelock.processMint(esUnip.address, tokenManager.address, expandDecimals(500, 18))
    await esUnip.connect(tokenManager).transferFrom(tokenManager.address, user2.address, expandDecimals(500, 18))
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

  it("unip: signalTransfer, acceptTransfer", async () =>{
    await unip.setMinter(wallet.address, true)
    await unip.mint(user1.address, expandDecimals(200, 18))
    expect(await unip.balanceOf(user1.address)).eq(expandDecimals(200, 18))
    await unip.connect(user1).approve(stakedUnipTracker.address, expandDecimals(200, 18))
    await rewardRouter.connect(user1).stakeUnip(expandDecimals(200, 18))
    expect(await unip.balanceOf(user1.address)).eq(0)

    await unip.mint(user2.address, expandDecimals(200, 18))
    expect(await unip.balanceOf(user2.address)).eq(expandDecimals(200, 18))
    await unip.connect(user2).approve(stakedUnipTracker.address, expandDecimals(400, 18))
    await rewardRouter.connect(user2).stakeUnip(expandDecimals(200, 18))
    expect(await unip.balanceOf(user2.address)).eq(0)

    await rewardRouter.connect(user2).signalTransfer(user1.address)

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    await rewardRouter.connect(user2).signalTransfer(user1.address)
    await rewardRouter.connect(user1).claim()

    await expect(rewardRouter.connect(user2).signalTransfer(user1.address))
      .to.be.revertedWith("RewardRouter: stakedUnipTracker.averageStakedAmounts > 0")

    await rewardRouter.connect(user2).signalTransfer(user3.address)

    await expect(rewardRouter.connect(user3).acceptTransfer(user1.address))
      .to.be.revertedWith("RewardRouter: transfer not signalled")

    await unipVester.setBonusRewards(user2.address, expandDecimals(100, 18))

    expect(await stakedUnipTracker.depositBalances(user2.address, unip.address)).eq(expandDecimals(200, 18))
    expect(await stakedUnipTracker.depositBalances(user2.address, esUnip.address)).eq(0)
    expect(await feeUnipTracker.depositBalances(user2.address, bnUnip.address)).eq(0)
    expect(await stakedUnipTracker.depositBalances(user3.address, unip.address)).eq(0)
    expect(await stakedUnipTracker.depositBalances(user3.address, esUnip.address)).eq(0)
    expect(await feeUnipTracker.depositBalances(user3.address, bnUnip.address)).eq(0)
    expect(await unipVester.transferredAverageStakedAmounts(user3.address)).eq(0)
    expect(await unipVester.transferredCumulativeRewards(user3.address)).eq(0)
    expect(await unipVester.bonusRewards(user2.address)).eq(expandDecimals(100, 18))
    expect(await unipVester.bonusRewards(user3.address)).eq(0)
    expect(await unipVester.getCombinedAverageStakedAmount(user2.address)).eq(0)
    expect(await unipVester.getCombinedAverageStakedAmount(user3.address)).eq(0)
    expect(await unipVester.getMaxVestableAmount(user2.address)).eq(expandDecimals(100, 18))
    expect(await unipVester.getMaxVestableAmount(user3.address)).eq(0)
    expect(await unipVester.getPairAmount(user2.address, expandDecimals(892, 18))).eq(0)
    expect(await unipVester.getPairAmount(user3.address, expandDecimals(892, 18))).eq(0)

    await rewardRouter.connect(user3).acceptTransfer(user2.address)

    expect(await stakedUnipTracker.depositBalances(user2.address, unip.address)).eq(0)
    expect(await stakedUnipTracker.depositBalances(user2.address, esUnip.address)).eq(0)
    expect(await feeUnipTracker.depositBalances(user2.address, bnUnip.address)).eq(0)
    expect(await stakedUnipTracker.depositBalances(user3.address, unip.address)).eq(expandDecimals(200, 18))
    expect(await stakedUnipTracker.depositBalances(user3.address, esUnip.address)).gt(expandDecimals(892, 18))
    expect(await stakedUnipTracker.depositBalances(user3.address, esUnip.address)).lt(expandDecimals(893, 18))
    expect(await feeUnipTracker.depositBalances(user3.address, bnUnip.address)).gt("547000000000000000") // 0.547
    expect(await feeUnipTracker.depositBalances(user3.address, bnUnip.address)).lt("549000000000000000") // 0.548
    expect(await unipVester.transferredAverageStakedAmounts(user3.address)).eq(expandDecimals(200, 18))
    expect(await unipVester.transferredCumulativeRewards(user3.address)).gt(expandDecimals(892, 18))
    expect(await unipVester.transferredCumulativeRewards(user3.address)).lt(expandDecimals(893, 18))
    expect(await unipVester.bonusRewards(user2.address)).eq(0)
    expect(await unipVester.bonusRewards(user3.address)).eq(expandDecimals(100, 18))
    expect(await unipVester.getCombinedAverageStakedAmount(user2.address)).eq(expandDecimals(200, 18))
    expect(await unipVester.getCombinedAverageStakedAmount(user3.address)).eq(expandDecimals(200, 18))
    expect(await unipVester.getMaxVestableAmount(user2.address)).eq(0)
    expect(await unipVester.getMaxVestableAmount(user3.address)).gt(expandDecimals(992, 18))
    expect(await unipVester.getMaxVestableAmount(user3.address)).lt(expandDecimals(993, 18))
    expect(await unipVester.getPairAmount(user2.address, expandDecimals(992, 18))).eq(0)
    expect(await unipVester.getPairAmount(user3.address, expandDecimals(992, 18))).gt(expandDecimals(199, 18))
    expect(await unipVester.getPairAmount(user3.address, expandDecimals(992, 18))).lt(expandDecimals(200, 18))

    await unip.connect(user3).approve(stakedUnipTracker.address, expandDecimals(400, 18))
    await rewardRouter.connect(user3).signalTransfer(user4.address)
    await rewardRouter.connect(user4).acceptTransfer(user3.address)

    expect(await stakedUnipTracker.depositBalances(user3.address, unip.address)).eq(0)
    expect(await stakedUnipTracker.depositBalances(user3.address, esUnip.address)).eq(0)
    expect(await feeUnipTracker.depositBalances(user3.address, bnUnip.address)).eq(0)
    expect(await stakedUnipTracker.depositBalances(user4.address, unip.address)).eq(expandDecimals(200, 18))
    expect(await stakedUnipTracker.depositBalances(user4.address, esUnip.address)).gt(expandDecimals(892, 18))
    expect(await stakedUnipTracker.depositBalances(user4.address, esUnip.address)).lt(expandDecimals(893, 18))
    expect(await feeUnipTracker.depositBalances(user4.address, bnUnip.address)).gt("547000000000000000") // 0.547
    expect(await feeUnipTracker.depositBalances(user4.address, bnUnip.address)).lt("549000000000000000") // 0.548
    expect(await unipVester.transferredAverageStakedAmounts(user4.address)).gt(expandDecimals(200, 18))
    expect(await unipVester.transferredAverageStakedAmounts(user4.address)).lt(expandDecimals(201, 18))
    expect(await unipVester.transferredCumulativeRewards(user4.address)).gt(expandDecimals(892, 18))
    expect(await unipVester.transferredCumulativeRewards(user4.address)).lt(expandDecimals(894, 18))
    expect(await unipVester.bonusRewards(user3.address)).eq(0)
    expect(await unipVester.bonusRewards(user4.address)).eq(expandDecimals(100, 18))
    expect(await stakedUnipTracker.averageStakedAmounts(user3.address)).gt(expandDecimals(1092, 18))
    expect(await stakedUnipTracker.averageStakedAmounts(user3.address)).lt(expandDecimals(1094, 18))
    expect(await unipVester.transferredAverageStakedAmounts(user3.address)).eq(0)
    expect(await unipVester.getCombinedAverageStakedAmount(user3.address)).gt(expandDecimals(1092, 18))
    expect(await unipVester.getCombinedAverageStakedAmount(user3.address)).lt(expandDecimals(1094, 18))
    expect(await unipVester.getCombinedAverageStakedAmount(user4.address)).gt(expandDecimals(200, 18))
    expect(await unipVester.getCombinedAverageStakedAmount(user4.address)).lt(expandDecimals(201, 18))
    expect(await unipVester.getMaxVestableAmount(user3.address)).eq(0)
    expect(await unipVester.getMaxVestableAmount(user4.address)).gt(expandDecimals(992, 18))
    expect(await unipVester.getMaxVestableAmount(user4.address)).lt(expandDecimals(993, 18))
    expect(await unipVester.getPairAmount(user3.address, expandDecimals(992, 18))).eq(0)
    expect(await unipVester.getPairAmount(user4.address, expandDecimals(992, 18))).gt(expandDecimals(199, 18))
    expect(await unipVester.getPairAmount(user4.address, expandDecimals(992, 18))).lt(expandDecimals(200, 18))

    await expect(rewardRouter.connect(user4).acceptTransfer(user3.address))
      .to.be.revertedWith("RewardRouter: transfer not signalled")
  })

  it("unip, ulp: signalTransfer, acceptTransfer", async () =>{
    await unip.setMinter(wallet.address, true)
    await unip.mint(unipVester.address, expandDecimals(10000, 18))
    await unip.mint(ulpVester.address, expandDecimals(10000, 18))
    await eth.mint(feeUlpDistributor.address, expandDecimals(100, 18))
    await feeUlpDistributor.setTokensPerInterval("41335970000000") // 0.00004133597 ETH per second

    await bnb.mint(user1.address, expandDecimals(1, 18))
    await bnb.connect(user1).approve(ulpManager.address, expandDecimals(1, 18))
    await rewardRouter.connect(user1).mintAndStakeUlp(
      bnb.address,
      expandDecimals(1, 18),
      expandDecimals(299, 18),
      expandDecimals(299, 18)
    )

    await bnb.mint(user2.address, expandDecimals(1, 18))
    await bnb.connect(user2).approve(ulpManager.address, expandDecimals(1, 18))
    await rewardRouter.connect(user2).mintAndStakeUlp(
      bnb.address,
      expandDecimals(1, 18),
      expandDecimals(299, 18),
      expandDecimals(299, 18)
    )

    await unip.mint(user1.address, expandDecimals(200, 18))
    expect(await unip.balanceOf(user1.address)).eq(expandDecimals(200, 18))
    await unip.connect(user1).approve(stakedUnipTracker.address, expandDecimals(200, 18))
    await rewardRouter.connect(user1).stakeUnip(expandDecimals(200, 18))
    expect(await unip.balanceOf(user1.address)).eq(0)

    await unip.mint(user2.address, expandDecimals(200, 18))
    expect(await unip.balanceOf(user2.address)).eq(expandDecimals(200, 18))
    await unip.connect(user2).approve(stakedUnipTracker.address, expandDecimals(400, 18))
    await rewardRouter.connect(user2).stakeUnip(expandDecimals(200, 18))
    expect(await unip.balanceOf(user2.address)).eq(0)

    await rewardRouter.connect(user2).signalTransfer(user1.address)

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    await rewardRouter.connect(user2).signalTransfer(user1.address)
    await rewardRouter.connect(user1).compound()

    await expect(rewardRouter.connect(user2).signalTransfer(user1.address))
      .to.be.revertedWith("RewardRouter: stakedUnipTracker.averageStakedAmounts > 0")

    await rewardRouter.connect(user2).signalTransfer(user3.address)

    await expect(rewardRouter.connect(user3).acceptTransfer(user1.address))
      .to.be.revertedWith("RewardRouter: transfer not signalled")

    await unipVester.setBonusRewards(user2.address, expandDecimals(100, 18))

    expect(await stakedUnipTracker.depositBalances(user2.address, unip.address)).eq(expandDecimals(200, 18))
    expect(await stakedUnipTracker.depositBalances(user2.address, esUnip.address)).eq(0)
    expect(await stakedUnipTracker.depositBalances(user3.address, unip.address)).eq(0)
    expect(await stakedUnipTracker.depositBalances(user3.address, esUnip.address)).eq(0)

    expect(await feeUnipTracker.depositBalances(user2.address, bnUnip.address)).eq(0)
    expect(await feeUnipTracker.depositBalances(user3.address, bnUnip.address)).eq(0)

    expect(await feeUlpTracker.depositBalances(user2.address, ulp.address)).eq("299100000000000000000") // 299.1
    expect(await feeUlpTracker.depositBalances(user3.address, ulp.address)).eq(0)

    expect(await stakedUlpTracker.depositBalances(user2.address, feeUlpTracker.address)).eq("299100000000000000000") // 299.1
    expect(await stakedUlpTracker.depositBalances(user3.address, feeUlpTracker.address)).eq(0)

    expect(await unipVester.transferredAverageStakedAmounts(user3.address)).eq(0)
    expect(await unipVester.transferredCumulativeRewards(user3.address)).eq(0)
    expect(await unipVester.bonusRewards(user2.address)).eq(expandDecimals(100, 18))
    expect(await unipVester.bonusRewards(user3.address)).eq(0)
    expect(await unipVester.getCombinedAverageStakedAmount(user2.address)).eq(0)
    expect(await unipVester.getCombinedAverageStakedAmount(user3.address)).eq(0)
    expect(await unipVester.getMaxVestableAmount(user2.address)).eq(expandDecimals(100, 18))
    expect(await unipVester.getMaxVestableAmount(user3.address)).eq(0)
    expect(await unipVester.getPairAmount(user2.address, expandDecimals(892, 18))).eq(0)
    expect(await unipVester.getPairAmount(user3.address, expandDecimals(892, 18))).eq(0)

    await rewardRouter.connect(user3).acceptTransfer(user2.address)

    expect(await stakedUnipTracker.depositBalances(user2.address, unip.address)).eq(0)
    expect(await stakedUnipTracker.depositBalances(user2.address, esUnip.address)).eq(0)
    expect(await stakedUnipTracker.depositBalances(user3.address, unip.address)).eq(expandDecimals(200, 18))
    expect(await stakedUnipTracker.depositBalances(user3.address, esUnip.address)).gt(expandDecimals(1785, 18))
    expect(await stakedUnipTracker.depositBalances(user3.address, esUnip.address)).lt(expandDecimals(1786, 18))

    expect(await feeUnipTracker.depositBalances(user2.address, bnUnip.address)).eq(0)
    expect(await feeUnipTracker.depositBalances(user3.address, bnUnip.address)).gt("547000000000000000") // 0.547
    expect(await feeUnipTracker.depositBalances(user3.address, bnUnip.address)).lt("549000000000000000") // 0.548

    expect(await feeUlpTracker.depositBalances(user2.address, ulp.address)).eq(0)
    expect(await feeUlpTracker.depositBalances(user3.address, ulp.address)).eq("299100000000000000000") // 299.1

    expect(await stakedUlpTracker.depositBalances(user2.address, feeUlpTracker.address)).eq(0)
    expect(await stakedUlpTracker.depositBalances(user3.address, feeUlpTracker.address)).eq("299100000000000000000") // 299.1

    expect(await unipVester.transferredAverageStakedAmounts(user3.address)).eq(expandDecimals(200, 18))
    expect(await unipVester.transferredCumulativeRewards(user3.address)).gt(expandDecimals(892, 18))
    expect(await unipVester.transferredCumulativeRewards(user3.address)).lt(expandDecimals(893, 18))
    expect(await unipVester.bonusRewards(user2.address)).eq(0)
    expect(await unipVester.bonusRewards(user3.address)).eq(expandDecimals(100, 18))
    expect(await unipVester.getCombinedAverageStakedAmount(user2.address)).eq(expandDecimals(200, 18))
    expect(await unipVester.getCombinedAverageStakedAmount(user3.address)).eq(expandDecimals(200, 18))
    expect(await unipVester.getMaxVestableAmount(user2.address)).eq(0)
    expect(await unipVester.getMaxVestableAmount(user3.address)).gt(expandDecimals(992, 18))
    expect(await unipVester.getMaxVestableAmount(user3.address)).lt(expandDecimals(993, 18))
    expect(await unipVester.getPairAmount(user2.address, expandDecimals(992, 18))).eq(0)
    expect(await unipVester.getPairAmount(user3.address, expandDecimals(992, 18))).gt(expandDecimals(199, 18))
    expect(await unipVester.getPairAmount(user3.address, expandDecimals(992, 18))).lt(expandDecimals(200, 18))
    expect(await unipVester.getPairAmount(user1.address, expandDecimals(892, 18))).gt(expandDecimals(199, 18))
    expect(await unipVester.getPairAmount(user1.address, expandDecimals(892, 18))).lt(expandDecimals(200, 18))

    await rewardRouter.connect(user1).compound()

    await expect(rewardRouter.connect(user3).acceptTransfer(user1.address))
      .to.be.revertedWith("RewardRouter: transfer not signalled")

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    await rewardRouter.connect(user1).claim()
    await rewardRouter.connect(user2).claim()
    await rewardRouter.connect(user3).claim()

    expect(await unipVester.getCombinedAverageStakedAmount(user1.address)).gt(expandDecimals(1092, 18))
    expect(await unipVester.getCombinedAverageStakedAmount(user1.address)).lt(expandDecimals(1094, 18))
    expect(await unipVester.getCombinedAverageStakedAmount(user3.address)).gt(expandDecimals(1092, 18))
    expect(await unipVester.getCombinedAverageStakedAmount(user3.address)).lt(expandDecimals(1094, 18))

    expect(await unipVester.getMaxVestableAmount(user2.address)).eq(0)
    expect(await unipVester.getMaxVestableAmount(user3.address)).gt(expandDecimals(1885, 18))
    expect(await unipVester.getMaxVestableAmount(user3.address)).lt(expandDecimals(1887, 18))
    expect(await unipVester.getMaxVestableAmount(user1.address)).gt(expandDecimals(1785, 18))
    expect(await unipVester.getMaxVestableAmount(user1.address)).lt(expandDecimals(1787, 18))

    expect(await unipVester.getPairAmount(user2.address, expandDecimals(992, 18))).eq(0)
    expect(await unipVester.getPairAmount(user3.address, expandDecimals(1885, 18))).gt(expandDecimals(1092, 18))
    expect(await unipVester.getPairAmount(user3.address, expandDecimals(1885, 18))).lt(expandDecimals(1094, 18))
    expect(await unipVester.getPairAmount(user1.address, expandDecimals(1785, 18))).gt(expandDecimals(1092, 18))
    expect(await unipVester.getPairAmount(user1.address, expandDecimals(1785, 18))).lt(expandDecimals(1094, 18))

    await rewardRouter.connect(user1).compound()
    await rewardRouter.connect(user3).compound()

    expect(await feeUnipTracker.balanceOf(user1.address)).gt(expandDecimals(1992, 18))
    expect(await feeUnipTracker.balanceOf(user1.address)).lt(expandDecimals(1993, 18))

    await unipVester.connect(user1).deposit(expandDecimals(1785, 18))

    expect(await feeUnipTracker.balanceOf(user1.address)).gt(expandDecimals(1991 - 1092, 18)) // 899
    expect(await feeUnipTracker.balanceOf(user1.address)).lt(expandDecimals(1993 - 1092, 18)) // 901

    expect(await feeUnipTracker.depositBalances(user1.address, bnUnip.address)).gt(expandDecimals(4, 18))
    expect(await feeUnipTracker.depositBalances(user1.address, bnUnip.address)).lt(expandDecimals(6, 18))

    await rewardRouter.connect(user1).unstakeUnip(expandDecimals(200, 18))
    await expect(rewardRouter.connect(user1).unstakeEsUnip(expandDecimals(699, 18)))
      .to.be.revertedWith("RewardTracker: burn amount exceeds balance")

    await rewardRouter.connect(user1).unstakeEsUnip(expandDecimals(599, 18))

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    expect(await feeUnipTracker.balanceOf(user1.address)).gt(expandDecimals(97, 18))
    expect(await feeUnipTracker.balanceOf(user1.address)).lt(expandDecimals(99, 18))

    expect(await esUnip.balanceOf(user1.address)).gt(expandDecimals(599, 18))
    expect(await esUnip.balanceOf(user1.address)).lt(expandDecimals(601, 18))

    expect(await unip.balanceOf(user1.address)).eq(expandDecimals(200, 18))

    await unipVester.connect(user1).withdraw()

    expect(await feeUnipTracker.balanceOf(user1.address)).gt(expandDecimals(1190, 18)) // 1190 - 98 => 1092
    expect(await feeUnipTracker.balanceOf(user1.address)).lt(expandDecimals(1191, 18))

    expect(await esUnip.balanceOf(user1.address)).gt(expandDecimals(2378, 18))
    expect(await esUnip.balanceOf(user1.address)).lt(expandDecimals(2380, 18))

    expect(await unip.balanceOf(user1.address)).gt(expandDecimals(204, 18))
    expect(await unip.balanceOf(user1.address)).lt(expandDecimals(206, 18))

    expect(await ulpVester.getMaxVestableAmount(user3.address)).gt(expandDecimals(1785, 18))
    expect(await ulpVester.getMaxVestableAmount(user3.address)).lt(expandDecimals(1787, 18))

    expect(await ulpVester.getPairAmount(user3.address, expandDecimals(1785, 18))).gt(expandDecimals(298, 18))
    expect(await ulpVester.getPairAmount(user3.address, expandDecimals(1785, 18))).lt(expandDecimals(300, 18))

    expect(await stakedUlpTracker.balanceOf(user3.address)).eq("299100000000000000000")

    expect(await esUnip.balanceOf(user3.address)).gt(expandDecimals(1785, 18))
    expect(await esUnip.balanceOf(user3.address)).lt(expandDecimals(1787, 18))

    expect(await unip.balanceOf(user3.address)).eq(0)

    await ulpVester.connect(user3).deposit(expandDecimals(1785, 18))

    expect(await stakedUlpTracker.balanceOf(user3.address)).gt(0)
    expect(await stakedUlpTracker.balanceOf(user3.address)).lt(expandDecimals(1, 18))

    expect(await esUnip.balanceOf(user3.address)).gt(0)
    expect(await esUnip.balanceOf(user3.address)).lt(expandDecimals(1, 18))

    expect(await unip.balanceOf(user3.address)).eq(0)

    await expect(rewardRouter.connect(user3).unstakeAndRedeemUlp(
      bnb.address,
      expandDecimals(1, 18),
      0,
      user3.address
    )).to.be.revertedWith("RewardTracker: burn amount exceeds balance")

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    await ulpVester.connect(user3).withdraw()

    expect(await stakedUlpTracker.balanceOf(user3.address)).eq("299100000000000000000")

    expect(await esUnip.balanceOf(user3.address)).gt(expandDecimals(1785 - 5, 18))
    expect(await esUnip.balanceOf(user3.address)).lt(expandDecimals(1787 - 5, 18))

    expect(await unip.balanceOf(user3.address)).gt(expandDecimals(4, 18))
    expect(await unip.balanceOf(user3.address)).lt(expandDecimals(6, 18))

    expect(await feeUnipTracker.balanceOf(user1.address)).gt(expandDecimals(1190, 18))
    expect(await feeUnipTracker.balanceOf(user1.address)).lt(expandDecimals(1191, 18))

    expect(await esUnip.balanceOf(user1.address)).gt(expandDecimals(2379, 18))
    expect(await esUnip.balanceOf(user1.address)).lt(expandDecimals(2381, 18))

    expect(await unip.balanceOf(user1.address)).gt(expandDecimals(204, 18))
    expect(await unip.balanceOf(user1.address)).lt(expandDecimals(206, 18))

    await unipVester.connect(user1).deposit(expandDecimals(365 * 2, 18))

    expect(await feeUnipTracker.balanceOf(user1.address)).gt(expandDecimals(743, 18)) // 1190 - 743 => 447
    expect(await feeUnipTracker.balanceOf(user1.address)).lt(expandDecimals(754, 18))

    expect(await unipVester.claimable(user1.address)).eq(0)

    await increaseTime(provider, 48 * 60 * 60)
    await mineBlock(provider)

    expect(await unipVester.claimable(user1.address)).gt("3900000000000000000") // 3.9
    expect(await unipVester.claimable(user1.address)).lt("4100000000000000000") // 4.1

    await unipVester.connect(user1).deposit(expandDecimals(365, 18))

    expect(await feeUnipTracker.balanceOf(user1.address)).gt(expandDecimals(522, 18)) // 743 - 522 => 221
    expect(await feeUnipTracker.balanceOf(user1.address)).lt(expandDecimals(524, 18))

    await increaseTime(provider, 48 * 60 * 60)
    await mineBlock(provider)

    expect(await unipVester.claimable(user1.address)).gt("9900000000000000000") // 9.9
    expect(await unipVester.claimable(user1.address)).lt("10100000000000000000") // 10.1

    expect(await unip.balanceOf(user1.address)).gt(expandDecimals(204, 18))
    expect(await unip.balanceOf(user1.address)).lt(expandDecimals(206, 18))

    await unipVester.connect(user1).claim()

    expect(await unip.balanceOf(user1.address)).gt(expandDecimals(214, 18))
    expect(await unip.balanceOf(user1.address)).lt(expandDecimals(216, 18))

    await unipVester.connect(user1).deposit(expandDecimals(365, 18))
    expect(await unipVester.balanceOf(user1.address)).gt(expandDecimals(1449, 18)) // 365 * 4 => 1460, 1460 - 10 => 1450
    expect(await unipVester.balanceOf(user1.address)).lt(expandDecimals(1451, 18))
    expect(await unipVester.getVestedAmount(user1.address)).eq(expandDecimals(1460, 18))

    expect(await feeUnipTracker.balanceOf(user1.address)).gt(expandDecimals(303, 18)) // 522 - 303 => 219
    expect(await feeUnipTracker.balanceOf(user1.address)).lt(expandDecimals(304, 18))

    await increaseTime(provider, 48 * 60 * 60)
    await mineBlock(provider)

    expect(await unipVester.claimable(user1.address)).gt("7900000000000000000") // 7.9
    expect(await unipVester.claimable(user1.address)).lt("8100000000000000000") // 8.1

    await unipVester.connect(user1).withdraw()

    expect(await feeUnipTracker.balanceOf(user1.address)).gt(expandDecimals(1190, 18))
    expect(await feeUnipTracker.balanceOf(user1.address)).lt(expandDecimals(1191, 18))

    expect(await unip.balanceOf(user1.address)).gt(expandDecimals(222, 18))
    expect(await unip.balanceOf(user1.address)).lt(expandDecimals(224, 18))

    expect(await esUnip.balanceOf(user1.address)).gt(expandDecimals(2360, 18))
    expect(await esUnip.balanceOf(user1.address)).lt(expandDecimals(2362, 18))

    await unipVester.connect(user1).deposit(expandDecimals(365, 18))

    await increaseTime(provider, 500 * 24 * 60 * 60)
    await mineBlock(provider)

    expect(await unipVester.claimable(user1.address)).eq(expandDecimals(365, 18))

    await unipVester.connect(user1).withdraw()

    expect(await unip.balanceOf(user1.address)).gt(expandDecimals(222 + 365, 18))
    expect(await unip.balanceOf(user1.address)).lt(expandDecimals(224 + 365, 18))

    expect(await esUnip.balanceOf(user1.address)).gt(expandDecimals(2360 - 365, 18))
    expect(await esUnip.balanceOf(user1.address)).lt(expandDecimals(2362 - 365, 18))

    expect(await unipVester.transferredAverageStakedAmounts(user2.address)).eq(0)
    expect(await unipVester.transferredAverageStakedAmounts(user3.address)).eq(expandDecimals(200, 18))
    expect(await stakedUnipTracker.cumulativeRewards(user2.address)).gt(expandDecimals(892, 18))
    expect(await stakedUnipTracker.cumulativeRewards(user2.address)).lt(expandDecimals(893, 18))
    expect(await stakedUnipTracker.cumulativeRewards(user3.address)).gt(expandDecimals(892, 18))
    expect(await stakedUnipTracker.cumulativeRewards(user3.address)).lt(expandDecimals(893, 18))
    expect(await unipVester.transferredCumulativeRewards(user3.address)).gt(expandDecimals(892, 18))
    expect(await unipVester.transferredCumulativeRewards(user3.address)).lt(expandDecimals(893, 18))
    expect(await unipVester.bonusRewards(user2.address)).eq(0)
    expect(await unipVester.bonusRewards(user3.address)).eq(expandDecimals(100, 18))
    expect(await unipVester.getCombinedAverageStakedAmount(user2.address)).eq(expandDecimals(200, 18))
    expect(await unipVester.getCombinedAverageStakedAmount(user3.address)).gt(expandDecimals(1092, 18))
    expect(await unipVester.getCombinedAverageStakedAmount(user3.address)).lt(expandDecimals(1093, 18))
    expect(await unipVester.getMaxVestableAmount(user2.address)).eq(0)
    expect(await unipVester.getMaxVestableAmount(user3.address)).gt(expandDecimals(1884, 18))
    expect(await unipVester.getMaxVestableAmount(user3.address)).lt(expandDecimals(1886, 18))
    expect(await unipVester.getPairAmount(user2.address, expandDecimals(992, 18))).eq(0)
    expect(await unipVester.getPairAmount(user3.address, expandDecimals(992, 18))).gt(expandDecimals(574, 18))
    expect(await unipVester.getPairAmount(user3.address, expandDecimals(992, 18))).lt(expandDecimals(575, 18))
    expect(await unipVester.getPairAmount(user1.address, expandDecimals(892, 18))).gt(expandDecimals(545, 18))
    expect(await unipVester.getPairAmount(user1.address, expandDecimals(892, 18))).lt(expandDecimals(546, 18))

    const esUnipBatchSender = await deployContract("EsUnipBatchSender", [esUnip.address])

    await timelock.signalSetHandler(esUnip.address, esUnipBatchSender.address, true)
    await timelock.signalSetHandler(unipVester.address, esUnipBatchSender.address, true)
    await timelock.signalSetHandler(ulpVester.address, esUnipBatchSender.address, true)
    await timelock.signalMint(esUnip.address, wallet.address, expandDecimals(1000, 18))

    await increaseTime(provider, 20)
    await mineBlock(provider)

    await timelock.setHandler(esUnip.address, esUnipBatchSender.address, true)
    await timelock.setHandler(unipVester.address, esUnipBatchSender.address, true)
    await timelock.setHandler(ulpVester.address, esUnipBatchSender.address, true)
    await timelock.processMint(esUnip.address, wallet.address, expandDecimals(1000, 18))

    await esUnipBatchSender.connect(wallet).send(
      unipVester.address,
      4,
      [user2.address, user3.address],
      [expandDecimals(100, 18), expandDecimals(200, 18)]
    )

    expect(await unipVester.transferredAverageStakedAmounts(user2.address)).gt(expandDecimals(37648, 18))
    expect(await unipVester.transferredAverageStakedAmounts(user2.address)).lt(expandDecimals(37649, 18))
    expect(await unipVester.transferredAverageStakedAmounts(user3.address)).gt(expandDecimals(12810, 18))
    expect(await unipVester.transferredAverageStakedAmounts(user3.address)).lt(expandDecimals(12811, 18))
    expect(await unipVester.transferredCumulativeRewards(user2.address)).eq(expandDecimals(100, 18))
    expect(await unipVester.transferredCumulativeRewards(user3.address)).gt(expandDecimals(892 + 200, 18))
    expect(await unipVester.transferredCumulativeRewards(user3.address)).lt(expandDecimals(893 + 200, 18))
    expect(await unipVester.bonusRewards(user2.address)).eq(0)
    expect(await unipVester.bonusRewards(user3.address)).eq(expandDecimals(100, 18))
    expect(await unipVester.getCombinedAverageStakedAmount(user2.address)).gt(expandDecimals(3971, 18))
    expect(await unipVester.getCombinedAverageStakedAmount(user2.address)).lt(expandDecimals(3972, 18))
    expect(await unipVester.getCombinedAverageStakedAmount(user3.address)).gt(expandDecimals(7943, 18))
    expect(await unipVester.getCombinedAverageStakedAmount(user3.address)).lt(expandDecimals(7944, 18))
    expect(await unipVester.getMaxVestableAmount(user2.address)).eq(expandDecimals(100, 18))
    expect(await unipVester.getMaxVestableAmount(user3.address)).gt(expandDecimals(1884 + 200, 18))
    expect(await unipVester.getMaxVestableAmount(user3.address)).lt(expandDecimals(1886 + 200, 18))
    expect(await unipVester.getPairAmount(user2.address, expandDecimals(100, 18))).gt(expandDecimals(3971, 18))
    expect(await unipVester.getPairAmount(user2.address, expandDecimals(100, 18))).lt(expandDecimals(3972, 18))
    expect(await unipVester.getPairAmount(user3.address, expandDecimals(1884 + 200, 18))).gt(expandDecimals(7936, 18))
    expect(await unipVester.getPairAmount(user3.address, expandDecimals(1884 + 200, 18))).lt(expandDecimals(7937, 18))

    expect(await ulpVester.transferredAverageStakedAmounts(user4.address)).eq(0)
    expect(await ulpVester.transferredCumulativeRewards(user4.address)).eq(0)
    expect(await ulpVester.bonusRewards(user4.address)).eq(0)
    expect(await ulpVester.getCombinedAverageStakedAmount(user4.address)).eq(0)
    expect(await ulpVester.getMaxVestableAmount(user4.address)).eq(0)
    expect(await ulpVester.getPairAmount(user4.address, expandDecimals(10, 18))).eq(0)

    await esUnipBatchSender.connect(wallet).send(
      ulpVester.address,
      320,
      [user4.address],
      [expandDecimals(10, 18)]
    )

    expect(await ulpVester.transferredAverageStakedAmounts(user4.address)).eq(expandDecimals(3200, 18))
    expect(await ulpVester.transferredCumulativeRewards(user4.address)).eq(expandDecimals(10, 18))
    expect(await ulpVester.bonusRewards(user4.address)).eq(0)
    expect(await ulpVester.getCombinedAverageStakedAmount(user4.address)).eq(expandDecimals(3200, 18))
    expect(await ulpVester.getMaxVestableAmount(user4.address)).eq(expandDecimals(10, 18))
    expect(await ulpVester.getPairAmount(user4.address, expandDecimals(10, 18))).eq(expandDecimals(3200, 18))

    await esUnipBatchSender.connect(wallet).send(
      ulpVester.address,
      320,
      [user4.address],
      [expandDecimals(10, 18)]
    )

    expect(await ulpVester.transferredAverageStakedAmounts(user4.address)).eq(expandDecimals(6400, 18))
    expect(await ulpVester.transferredCumulativeRewards(user4.address)).eq(expandDecimals(20, 18))
    expect(await ulpVester.bonusRewards(user4.address)).eq(0)
    expect(await ulpVester.getCombinedAverageStakedAmount(user4.address)).eq(expandDecimals(6400, 18))
    expect(await ulpVester.getMaxVestableAmount(user4.address)).eq(expandDecimals(20, 18))
    expect(await ulpVester.getPairAmount(user4.address, expandDecimals(10, 18))).eq(expandDecimals(3200, 18))
  })

  it("handleRewards", async () => {
    const timelockV2 = wallet

    // use new rewardRouter, use eth for weth
    const rewardRouterV2 = await deployContract("RewardRouterV2", [])
    await rewardRouterV2.initialize(
      eth.address,
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
    )

    await timelock.signalSetGov(ulpManager.address, timelockV2.address)
    await timelock.signalSetGov(stakedUnipTracker.address, timelockV2.address)
    await timelock.signalSetGov(bonusUnipTracker.address, timelockV2.address)
    await timelock.signalSetGov(feeUnipTracker.address, timelockV2.address)
    await timelock.signalSetGov(feeUlpTracker.address, timelockV2.address)
    await timelock.signalSetGov(stakedUlpTracker.address, timelockV2.address)
    await timelock.signalSetGov(stakedUnipDistributor.address, timelockV2.address)
    await timelock.signalSetGov(stakedUlpDistributor.address, timelockV2.address)
    await timelock.signalSetGov(esUnip.address, timelockV2.address)
    await timelock.signalSetGov(bnUnip.address, timelockV2.address)
    await timelock.signalSetGov(unipVester.address, timelockV2.address)
    await timelock.signalSetGov(ulpVester.address, timelockV2.address)

    await increaseTime(provider, 20)
    await mineBlock(provider)

    await timelock.setGov(ulpManager.address, timelockV2.address)
    await timelock.setGov(stakedUnipTracker.address, timelockV2.address)
    await timelock.setGov(bonusUnipTracker.address, timelockV2.address)
    await timelock.setGov(feeUnipTracker.address, timelockV2.address)
    await timelock.setGov(feeUlpTracker.address, timelockV2.address)
    await timelock.setGov(stakedUlpTracker.address, timelockV2.address)
    await timelock.setGov(stakedUnipDistributor.address, timelockV2.address)
    await timelock.setGov(stakedUlpDistributor.address, timelockV2.address)
    await timelock.setGov(esUnip.address, timelockV2.address)
    await timelock.setGov(bnUnip.address, timelockV2.address)
    await timelock.setGov(unipVester.address, timelockV2.address)
    await timelock.setGov(ulpVester.address, timelockV2.address)

    await esUnip.setHandler(rewardRouterV2.address, true)
    await esUnip.setHandler(stakedUnipDistributor.address, true)
    await esUnip.setHandler(stakedUlpDistributor.address, true)
    await esUnip.setHandler(stakedUnipTracker.address, true)
    await esUnip.setHandler(stakedUlpTracker.address, true)
    await esUnip.setHandler(unipVester.address, true)
    await esUnip.setHandler(ulpVester.address, true)

    await ulpManager.setHandler(rewardRouterV2.address, true)
    await stakedUnipTracker.setHandler(rewardRouterV2.address, true)
    await bonusUnipTracker.setHandler(rewardRouterV2.address, true)
    await feeUnipTracker.setHandler(rewardRouterV2.address, true)
    await feeUlpTracker.setHandler(rewardRouterV2.address, true)
    await stakedUlpTracker.setHandler(rewardRouterV2.address, true)

    await esUnip.setHandler(rewardRouterV2.address, true)
    await bnUnip.setMinter(rewardRouterV2.address, true)
    await esUnip.setMinter(unipVester.address, true)
    await esUnip.setMinter(ulpVester.address, true)

    await unipVester.setHandler(rewardRouterV2.address, true)
    await ulpVester.setHandler(rewardRouterV2.address, true)

    await feeUnipTracker.setHandler(unipVester.address, true)
    await stakedUlpTracker.setHandler(ulpVester.address, true)

    await eth.deposit({ value: expandDecimals(10, 18) })

    await unip.setMinter(wallet.address, true)
    await unip.mint(unipVester.address, expandDecimals(10000, 18))
    await unip.mint(ulpVester.address, expandDecimals(10000, 18))

    await eth.mint(feeUlpDistributor.address, expandDecimals(50, 18))
    await feeUlpDistributor.setTokensPerInterval("41335970000000") // 0.00004133597 ETH per second

    await eth.mint(feeUnipDistributor.address, expandDecimals(50, 18))
    await feeUnipDistributor.setTokensPerInterval("41335970000000") // 0.00004133597 ETH per second

    await bnb.mint(user1.address, expandDecimals(1, 18))
    await bnb.connect(user1).approve(ulpManager.address, expandDecimals(1, 18))
    await rewardRouterV2.connect(user1).mintAndStakeUlp(
      bnb.address,
      expandDecimals(1, 18),
      expandDecimals(299, 18),
      expandDecimals(299, 18)
    )

    await unip.mint(user1.address, expandDecimals(200, 18))
    expect(await unip.balanceOf(user1.address)).eq(expandDecimals(200, 18))
    await unip.connect(user1).approve(stakedUnipTracker.address, expandDecimals(200, 18))
    await rewardRouterV2.connect(user1).stakeUnip(expandDecimals(200, 18))
    expect(await unip.balanceOf(user1.address)).eq(0)

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    expect(await unip.balanceOf(user1.address)).eq(0)
    expect(await esUnip.balanceOf(user1.address)).eq(0)
    expect(await bnUnip.balanceOf(user1.address)).eq(0)
    expect(await ulp.balanceOf(user1.address)).eq(0)
    expect(await eth.balanceOf(user1.address)).eq(0)

    expect(await stakedUnipTracker.depositBalances(user1.address, unip.address)).eq(expandDecimals(200, 18))
    expect(await stakedUnipTracker.depositBalances(user1.address, esUnip.address)).eq(0)
    expect(await feeUnipTracker.depositBalances(user1.address, bnUnip.address)).eq(0)

    await rewardRouterV2.connect(user1).handleRewards(
      true, // _shouldClaimUnip
      true, // _shouldStakeUnip
      true, // _shouldClaimEsUnip
      true, // _shouldStakeEsUnip
      true, // _shouldStakeMultiplierPoints
      true, // _shouldClaimWeth
      false // _shouldConvertWethToEth
    )

    expect(await unip.balanceOf(user1.address)).eq(0)
    expect(await esUnip.balanceOf(user1.address)).eq(0)
    expect(await bnUnip.balanceOf(user1.address)).eq(0)
    expect(await ulp.balanceOf(user1.address)).eq(0)
    expect(await eth.balanceOf(user1.address)).gt(expandDecimals(7, 18))
    expect(await eth.balanceOf(user1.address)).lt(expandDecimals(8, 18))

    expect(await stakedUnipTracker.depositBalances(user1.address, unip.address)).eq(expandDecimals(200, 18))
    expect(await stakedUnipTracker.depositBalances(user1.address, esUnip.address)).gt(expandDecimals(3571, 18))
    expect(await stakedUnipTracker.depositBalances(user1.address, esUnip.address)).lt(expandDecimals(3572, 18))
    expect(await feeUnipTracker.depositBalances(user1.address, bnUnip.address)).gt("540000000000000000") // 0.54
    expect(await feeUnipTracker.depositBalances(user1.address, bnUnip.address)).lt("560000000000000000") // 0.56

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    const ethBalance0 = await provider.getBalance(user1.address)

    await rewardRouterV2.connect(user1).handleRewards(
      false, // _shouldClaimUnip
      false, // _shouldStakeUnip
      false, // _shouldClaimEsUnip
      false, // _shouldStakeEsUnip
      false, // _shouldStakeMultiplierPoints
      true, // _shouldClaimWeth
      true // _shouldConvertWethToEth
    )

    const ethBalance1 = await provider.getBalance(user1.address)

    expect(await ethBalance1.sub(ethBalance0)).gt(expandDecimals(7, 18))
    expect(await ethBalance1.sub(ethBalance0)).lt(expandDecimals(8, 18))
    expect(await unip.balanceOf(user1.address)).eq(0)
    expect(await esUnip.balanceOf(user1.address)).eq(0)
    expect(await bnUnip.balanceOf(user1.address)).eq(0)
    expect(await ulp.balanceOf(user1.address)).eq(0)
    expect(await eth.balanceOf(user1.address)).gt(expandDecimals(7, 18))
    expect(await eth.balanceOf(user1.address)).lt(expandDecimals(8, 18))

    expect(await stakedUnipTracker.depositBalances(user1.address, unip.address)).eq(expandDecimals(200, 18))
    expect(await stakedUnipTracker.depositBalances(user1.address, esUnip.address)).gt(expandDecimals(3571, 18))
    expect(await stakedUnipTracker.depositBalances(user1.address, esUnip.address)).lt(expandDecimals(3572, 18))
    expect(await feeUnipTracker.depositBalances(user1.address, bnUnip.address)).gt("540000000000000000") // 0.54
    expect(await feeUnipTracker.depositBalances(user1.address, bnUnip.address)).lt("560000000000000000") // 0.56

    await rewardRouterV2.connect(user1).handleRewards(
      false, // _shouldClaimUnip
      false, // _shouldStakeUnip
      true, // _shouldClaimEsUnip
      false, // _shouldStakeEsUnip
      false, // _shouldStakeMultiplierPoints
      false, // _shouldClaimWeth
      false // _shouldConvertWethToEth
    )

    expect(await ethBalance1.sub(ethBalance0)).gt(expandDecimals(7, 18))
    expect(await ethBalance1.sub(ethBalance0)).lt(expandDecimals(8, 18))
    expect(await unip.balanceOf(user1.address)).eq(0)
    expect(await esUnip.balanceOf(user1.address)).gt(expandDecimals(3571, 18))
    expect(await esUnip.balanceOf(user1.address)).lt(expandDecimals(3572, 18))
    expect(await bnUnip.balanceOf(user1.address)).eq(0)
    expect(await ulp.balanceOf(user1.address)).eq(0)
    expect(await eth.balanceOf(user1.address)).gt(expandDecimals(7, 18))
    expect(await eth.balanceOf(user1.address)).lt(expandDecimals(8, 18))

    expect(await stakedUnipTracker.depositBalances(user1.address, unip.address)).eq(expandDecimals(200, 18))
    expect(await stakedUnipTracker.depositBalances(user1.address, esUnip.address)).gt(expandDecimals(3571, 18))
    expect(await stakedUnipTracker.depositBalances(user1.address, esUnip.address)).lt(expandDecimals(3572, 18))
    expect(await feeUnipTracker.depositBalances(user1.address, bnUnip.address)).gt("540000000000000000") // 0.54
    expect(await feeUnipTracker.depositBalances(user1.address, bnUnip.address)).lt("560000000000000000") // 0.56

    await unipVester.connect(user1).deposit(expandDecimals(365, 18))
    await ulpVester.connect(user1).deposit(expandDecimals(365 * 2, 18))

    expect(await ethBalance1.sub(ethBalance0)).gt(expandDecimals(7, 18))
    expect(await ethBalance1.sub(ethBalance0)).lt(expandDecimals(8, 18))
    expect(await unip.balanceOf(user1.address)).eq(0)
    expect(await esUnip.balanceOf(user1.address)).gt(expandDecimals(3571 - 365 * 3, 18))
    expect(await esUnip.balanceOf(user1.address)).lt(expandDecimals(3572 - 365 * 3, 18))
    expect(await bnUnip.balanceOf(user1.address)).eq(0)
    expect(await ulp.balanceOf(user1.address)).eq(0)
    expect(await eth.balanceOf(user1.address)).gt(expandDecimals(7, 18))
    expect(await eth.balanceOf(user1.address)).lt(expandDecimals(8, 18))

    expect(await stakedUnipTracker.depositBalances(user1.address, unip.address)).eq(expandDecimals(200, 18))
    expect(await stakedUnipTracker.depositBalances(user1.address, esUnip.address)).gt(expandDecimals(3571, 18))
    expect(await stakedUnipTracker.depositBalances(user1.address, esUnip.address)).lt(expandDecimals(3572, 18))
    expect(await feeUnipTracker.depositBalances(user1.address, bnUnip.address)).gt("540000000000000000") // 0.54
    expect(await feeUnipTracker.depositBalances(user1.address, bnUnip.address)).lt("560000000000000000") // 0.56

    await increaseTime(provider, 24 * 60 * 60)
    await mineBlock(provider)

    await rewardRouterV2.connect(user1).handleRewards(
      true, // _shouldClaimUnip
      false, // _shouldStakeUnip
      false, // _shouldClaimEsUnip
      false, // _shouldStakeEsUnip
      false, // _shouldStakeMultiplierPoints
      false, // _shouldClaimWeth
      false // _shouldConvertWethToEth
    )

    expect(await ethBalance1.sub(ethBalance0)).gt(expandDecimals(7, 18))
    expect(await ethBalance1.sub(ethBalance0)).lt(expandDecimals(8, 18))
    expect(await unip.balanceOf(user1.address)).gt("2900000000000000000") // 2.9
    expect(await unip.balanceOf(user1.address)).lt("3100000000000000000") // 3.1
    expect(await esUnip.balanceOf(user1.address)).gt(expandDecimals(3571 - 365 * 3, 18))
    expect(await esUnip.balanceOf(user1.address)).lt(expandDecimals(3572 - 365 * 3, 18))
    expect(await bnUnip.balanceOf(user1.address)).eq(0)
    expect(await ulp.balanceOf(user1.address)).eq(0)
    expect(await eth.balanceOf(user1.address)).gt(expandDecimals(7, 18))
    expect(await eth.balanceOf(user1.address)).lt(expandDecimals(8, 18))

    expect(await stakedUnipTracker.depositBalances(user1.address, unip.address)).eq(expandDecimals(200, 18))
    expect(await stakedUnipTracker.depositBalances(user1.address, esUnip.address)).gt(expandDecimals(3571, 18))
    expect(await stakedUnipTracker.depositBalances(user1.address, esUnip.address)).lt(expandDecimals(3572, 18))
    expect(await feeUnipTracker.depositBalances(user1.address, bnUnip.address)).gt("540000000000000000") // 0.54
    expect(await feeUnipTracker.depositBalances(user1.address, bnUnip.address)).lt("560000000000000000") // 0.56
  })

  it("StakedUlp", async () => {
    await eth.mint(feeUlpDistributor.address, expandDecimals(100, 18))
    await feeUlpDistributor.setTokensPerInterval("41335970000000") // 0.00004133597 ETH per second

    await bnb.mint(user1.address, expandDecimals(1, 18))
    await bnb.connect(user1).approve(ulpManager.address, expandDecimals(1, 18))
    await rewardRouter.connect(user1).mintAndStakeUlp(
      bnb.address,
      expandDecimals(1, 18),
      expandDecimals(299, 18),
      expandDecimals(299, 18)
    )

    expect(await feeUlpTracker.stakedAmounts(user1.address)).eq(expandDecimals(2991, 17))
    expect(await feeUlpTracker.depositBalances(user1.address, ulp.address)).eq(expandDecimals(2991, 17))

    expect(await stakedUlpTracker.stakedAmounts(user1.address)).eq(expandDecimals(2991, 17))
    expect(await stakedUlpTracker.depositBalances(user1.address, feeUlpTracker.address)).eq(expandDecimals(2991, 17))

    const stakedUlp = await deployContract("StakedUlp", [ulp.address, ulpManager.address, stakedUlpTracker.address, feeUlpTracker.address])

    await expect(stakedUlp.connect(user2).transferFrom(user1.address, user3.address, expandDecimals(2991, 17)))
      .to.be.revertedWith("StakedUlp: transfer amount exceeds allowance")

    await stakedUlp.connect(user1).approve(user2.address, expandDecimals(2991, 17))

    await expect(stakedUlp.connect(user2).transferFrom(user1.address, user3.address, expandDecimals(2991, 17)))
      .to.be.revertedWith("StakedUlp: cooldown duration not yet passed")

    await increaseTime(provider, 24 * 60 * 60 + 10)
    await mineBlock(provider)

    await expect(stakedUlp.connect(user2).transferFrom(user1.address, user3.address, expandDecimals(2991, 17)))
      .to.be.revertedWith("RewardTracker: forbidden")

    await timelock.signalSetHandler(stakedUlpTracker.address, stakedUlp.address, true)
    await increaseTime(provider, 20)
    await mineBlock(provider)
    await timelock.setHandler(stakedUlpTracker.address, stakedUlp.address, true)

    await expect(stakedUlp.connect(user2).transferFrom(user1.address, user3.address, expandDecimals(2991, 17)))
      .to.be.revertedWith("RewardTracker: forbidden")

    await timelock.signalSetHandler(feeUlpTracker.address, stakedUlp.address, true)
    await increaseTime(provider, 20)
    await mineBlock(provider)
    await timelock.setHandler(feeUlpTracker.address, stakedUlp.address, true)

    expect(await feeUlpTracker.stakedAmounts(user1.address)).eq(expandDecimals(2991, 17))
    expect(await feeUlpTracker.depositBalances(user1.address, ulp.address)).eq(expandDecimals(2991, 17))

    expect(await stakedUlpTracker.stakedAmounts(user1.address)).eq(expandDecimals(2991, 17))
    expect(await stakedUlpTracker.depositBalances(user1.address, feeUlpTracker.address)).eq(expandDecimals(2991, 17))

    expect(await feeUlpTracker.stakedAmounts(user3.address)).eq(0)
    expect(await feeUlpTracker.depositBalances(user3.address, ulp.address)).eq(0)

    expect(await stakedUlpTracker.stakedAmounts(user3.address)).eq(0)
    expect(await stakedUlpTracker.depositBalances(user3.address, feeUlpTracker.address)).eq(0)

    await stakedUlp.connect(user2).transferFrom(user1.address, user3. address, expandDecimals(2991, 17))

    expect(await feeUlpTracker.stakedAmounts(user1.address)).eq(0)
    expect(await feeUlpTracker.depositBalances(user1.address, ulp.address)).eq(0)

    expect(await stakedUlpTracker.stakedAmounts(user1.address)).eq(0)
    expect(await stakedUlpTracker.depositBalances(user1.address, feeUlpTracker.address)).eq(0)

    expect(await feeUlpTracker.stakedAmounts(user3.address)).eq(expandDecimals(2991, 17))
    expect(await feeUlpTracker.depositBalances(user3.address, ulp.address)).eq(expandDecimals(2991, 17))

    expect(await stakedUlpTracker.stakedAmounts(user3.address)).eq(expandDecimals(2991, 17))
    expect(await stakedUlpTracker.depositBalances(user3.address, feeUlpTracker.address)).eq(expandDecimals(2991, 17))

    await expect(stakedUlp.connect(user2).transferFrom(user3.address, user1.address, expandDecimals(3000, 17)))
      .to.be.revertedWith("StakedUlp: transfer amount exceeds allowance")

    await stakedUlp.connect(user3).approve(user2.address, expandDecimals(3000, 17))

    await expect(stakedUlp.connect(user2).transferFrom(user3.address, user1.address, expandDecimals(3000, 17)))
      .to.be.revertedWith("RewardTracker: _amount exceeds stakedAmount")

    await stakedUlp.connect(user2).transferFrom(user3.address, user1.address, expandDecimals(1000, 17))

    expect(await feeUlpTracker.stakedAmounts(user1.address)).eq(expandDecimals(1000, 17))
    expect(await feeUlpTracker.depositBalances(user1.address, ulp.address)).eq(expandDecimals(1000, 17))

    expect(await stakedUlpTracker.stakedAmounts(user1.address)).eq(expandDecimals(1000, 17))
    expect(await stakedUlpTracker.depositBalances(user1.address, feeUlpTracker.address)).eq(expandDecimals(1000, 17))

    expect(await feeUlpTracker.stakedAmounts(user3.address)).eq(expandDecimals(1991, 17))
    expect(await feeUlpTracker.depositBalances(user3.address, ulp.address)).eq(expandDecimals(1991, 17))

    expect(await stakedUlpTracker.stakedAmounts(user3.address)).eq(expandDecimals(1991, 17))
    expect(await stakedUlpTracker.depositBalances(user3.address, feeUlpTracker.address)).eq(expandDecimals(1991, 17))

    await stakedUlp.connect(user3).transfer(user1.address, expandDecimals(1500, 17))

    expect(await feeUlpTracker.stakedAmounts(user1.address)).eq(expandDecimals(2500, 17))
    expect(await feeUlpTracker.depositBalances(user1.address, ulp.address)).eq(expandDecimals(2500, 17))

    expect(await stakedUlpTracker.stakedAmounts(user1.address)).eq(expandDecimals(2500, 17))
    expect(await stakedUlpTracker.depositBalances(user1.address, feeUlpTracker.address)).eq(expandDecimals(2500, 17))

    expect(await feeUlpTracker.stakedAmounts(user3.address)).eq(expandDecimals(491, 17))
    expect(await feeUlpTracker.depositBalances(user3.address, ulp.address)).eq(expandDecimals(491, 17))

    expect(await stakedUlpTracker.stakedAmounts(user3.address)).eq(expandDecimals(491, 17))
    expect(await stakedUlpTracker.depositBalances(user3.address, feeUlpTracker.address)).eq(expandDecimals(491, 17))

    await expect(stakedUlp.connect(user3).transfer(user1.address, expandDecimals(492, 17)))
      .to.be.revertedWith("RewardTracker: _amount exceeds stakedAmount")

    expect(await bnb.balanceOf(user1.address)).eq(0)

    await rewardRouter.connect(user1).unstakeAndRedeemUlp(
      bnb.address,
      expandDecimals(2500, 17),
      "830000000000000000", // 0.83
      user1.address
    )

    expect(await bnb.balanceOf(user1.address)).eq("830833333333333333")

    await usdg.addVault(ulpManager.address)

    expect(await bnb.balanceOf(user3.address)).eq("0")

    await rewardRouter.connect(user3).unstakeAndRedeemUlp(
      bnb.address,
      expandDecimals(491, 17),
      "160000000000000000", // 0.16
      user3.address
    )

    expect(await bnb.balanceOf(user3.address)).eq("163175666666666666")
  })

  it("FeeUlp", async () => {
    await eth.mint(feeUlpDistributor.address, expandDecimals(100, 18))
    await feeUlpDistributor.setTokensPerInterval("41335970000000") // 0.00004133597 ETH per second

    await bnb.mint(user1.address, expandDecimals(1, 18))
    await bnb.connect(user1).approve(ulpManager.address, expandDecimals(1, 18))
    await rewardRouter.connect(user1).mintAndStakeUlp(
      bnb.address,
      expandDecimals(1, 18),
      expandDecimals(299, 18),
      expandDecimals(299, 18)
    )

    expect(await feeUlpTracker.stakedAmounts(user1.address)).eq(expandDecimals(2991, 17))
    expect(await feeUlpTracker.depositBalances(user1.address, ulp.address)).eq(expandDecimals(2991, 17))

    expect(await stakedUlpTracker.stakedAmounts(user1.address)).eq(expandDecimals(2991, 17))
    expect(await stakedUlpTracker.depositBalances(user1.address, feeUlpTracker.address)).eq(expandDecimals(2991, 17))

    const ulpBalance = await deployContract("UlpBalance", [ulpManager.address, stakedUlpTracker.address])

    await expect(ulpBalance.connect(user2).transferFrom(user1.address, user3.address, expandDecimals(2991, 17)))
      .to.be.revertedWith("UlpBalance: transfer amount exceeds allowance")

    await ulpBalance.connect(user1).approve(user2.address, expandDecimals(2991, 17))

    await expect(ulpBalance.connect(user2).transferFrom(user1.address, user3.address, expandDecimals(2991, 17)))
      .to.be.revertedWith("UlpBalance: cooldown duration not yet passed")

    await increaseTime(provider, 24 * 60 * 60 + 10)
    await mineBlock(provider)

    await expect(ulpBalance.connect(user2).transferFrom(user1.address, user3.address, expandDecimals(2991, 17)))
      .to.be.revertedWith("RewardTracker: transfer amount exceeds allowance")

    await timelock.signalSetHandler(stakedUlpTracker.address, ulpBalance.address, true)
    await increaseTime(provider, 20)
    await mineBlock(provider)
    await timelock.setHandler(stakedUlpTracker.address, ulpBalance.address, true)

    expect(await feeUlpTracker.stakedAmounts(user1.address)).eq(expandDecimals(2991, 17))
    expect(await feeUlpTracker.depositBalances(user1.address, ulp.address)).eq(expandDecimals(2991, 17))

    expect(await stakedUlpTracker.stakedAmounts(user1.address)).eq(expandDecimals(2991, 17))
    expect(await stakedUlpTracker.depositBalances(user1.address, feeUlpTracker.address)).eq(expandDecimals(2991, 17))
    expect(await stakedUlpTracker.balanceOf(user1.address)).eq(expandDecimals(2991, 17))

    expect(await feeUlpTracker.stakedAmounts(user3.address)).eq(0)
    expect(await feeUlpTracker.depositBalances(user3.address, ulp.address)).eq(0)

    expect(await stakedUlpTracker.stakedAmounts(user3.address)).eq(0)
    expect(await stakedUlpTracker.depositBalances(user3.address, feeUlpTracker.address)).eq(0)
    expect(await stakedUlpTracker.balanceOf(user3.address)).eq(0)

    await ulpBalance.connect(user2).transferFrom(user1.address, user3.address, expandDecimals(2991, 17))

    expect(await feeUlpTracker.stakedAmounts(user1.address)).eq(expandDecimals(2991, 17))
    expect(await feeUlpTracker.depositBalances(user1.address, ulp.address)).eq(expandDecimals(2991, 17))

    expect(await stakedUlpTracker.stakedAmounts(user1.address)).eq(expandDecimals(2991, 17))
    expect(await stakedUlpTracker.depositBalances(user1.address, feeUlpTracker.address)).eq(expandDecimals(2991, 17))
    expect(await stakedUlpTracker.balanceOf(user1.address)).eq(0)

    expect(await feeUlpTracker.stakedAmounts(user3.address)).eq(0)
    expect(await feeUlpTracker.depositBalances(user3.address, ulp.address)).eq(0)

    expect(await stakedUlpTracker.stakedAmounts(user3.address)).eq(0)
    expect(await stakedUlpTracker.depositBalances(user3.address, feeUlpTracker.address)).eq(0)
    expect(await stakedUlpTracker.balanceOf(user3.address)).eq(expandDecimals(2991, 17))

    await expect(rewardRouter.connect(user1).unstakeAndRedeemUlp(
      bnb.address,
      expandDecimals(2991, 17),
      "0",
      user1.address
    )).to.be.revertedWith("RewardTracker: burn amount exceeds balance")

    await ulpBalance.connect(user3).approve(user2.address, expandDecimals(3000, 17))

    await expect(ulpBalance.connect(user2).transferFrom(user3.address, user1.address, expandDecimals(2992, 17)))
      .to.be.revertedWith("RewardTracker: transfer amount exceeds balance")

    await ulpBalance.connect(user2).transferFrom(user3.address, user1.address, expandDecimals(2991, 17))

    expect(await bnb.balanceOf(user1.address)).eq(0)

    await rewardRouter.connect(user1).unstakeAndRedeemUlp(
      bnb.address,
      expandDecimals(2991, 17),
      "0",
      user1.address
    )

    expect(await bnb.balanceOf(user1.address)).eq("994009000000000000")
  })
})
