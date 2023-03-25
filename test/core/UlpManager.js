const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, reportGasUsed, newWallet } = require("../shared/utilities")
const { toChainlinkPrice } = require("../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../shared/units")
const { initVault, getBnbConfig, getBtcConfig, getDaiConfig } = require("./Vault/helpers")

use(solidity)

describe("UlpManager", function () {
  const provider = waffle.provider
  const [wallet, rewardRouter, user0, user1, user2, user3] = provider.getWallets()
  let vault
  let vaultUtils
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
  let distributor0
  let yieldTracker0
  let reader
  let shortsTracker

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

    const xxRes = await initVault(vault, router, usdg, vaultPriceFeed)
    vault = xxRes.vault
    vaultUtils = xxRes.vaultUtils
  
    shortsTracker = await deployContract("ShortsTracker", [vault.address])
    await shortsTracker.setIsGlobalShortDataReady(true)

    ulpManager = await deployContract("UlpManager", [
      vault.address,
      usdg.address,
      ulp.address,
      shortsTracker.address,
      24 * 60 * 60
    ])
    await ulpManager.setShortsTrackerAveragePriceWeight(10000)

    distributor0 = await deployContract("TimeDistributor", [])
    yieldTracker0 = await deployContract("YieldTracker", [usdg.address])

    await yieldTracker0.setDistributor(distributor0.address)
    await distributor0.setDistribution([yieldTracker0.address], [1000], [bnb.address])

    await bnb.mint(distributor0.address, 5000)
    await usdg.setYieldTrackers([yieldTracker0.address])

    reader = await deployContract("Reader", [])

    await vaultPriceFeed.setTokenConfig(bnb.address, bnbPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(btc.address, btcPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(eth.address, ethPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(dai.address, daiPriceFeed.address, 8, false)

    await vaultUtils.setIsTradable(bnb.address, true)
    await vaultUtils.setIsTradable(btc.address, true)
    await vaultUtils.setIsTradable(eth.address, true)
    await vaultUtils.setIsTradable(dai.address, true)

    await vault.setSyntheticStableToken(dai.address)

    await daiPriceFeed.setLatestAnswer(toChainlinkPrice(1))
    await vault.setTokenConfig(...getDaiConfig(dai, daiPriceFeed))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(60000))
    await vault.setTokenConfig(...getBtcConfig(btc, btcPriceFeed))

    await bnbPriceFeed.setLatestAnswer(toChainlinkPrice(300))
    await vault.setTokenConfig(...getBnbConfig(bnb, bnbPriceFeed))

    await ulp.setInPrivateTransferMode(true)
    await ulp.setMinter(ulpManager.address, true)

    await vault.setInManagerMode(true)
  })

  it("inits", async () => {
    expect(await ulpManager.gov()).eq(wallet.address)
    expect(await ulpManager.vault()).eq(vault.address)
    expect(await ulpManager.usdg()).eq(usdg.address)
    expect(await ulpManager.ulp()).eq(ulp.address)
    expect(await ulpManager.cooldownDuration()).eq(24 * 60 * 60)
  })

  it("setGov", async () => {
    await expect(ulpManager.connect(user0).setGov(user1.address))
      .to.be.revertedWith("Governable: forbidden")

    expect(await ulpManager.gov()).eq(wallet.address)

    await ulpManager.setGov(user0.address)
    expect(await ulpManager.gov()).eq(user0.address)

    await ulpManager.connect(user0).setGov(user1.address)
    expect(await ulpManager.gov()).eq(user1.address)
  })

  it("setHandler", async () => {
    await expect(ulpManager.connect(user0).setHandler(user1.address, true))
      .to.be.revertedWith("Governable: forbidden")

    expect(await ulpManager.gov()).eq(wallet.address)
    await ulpManager.setGov(user0.address)
    expect(await ulpManager.gov()).eq(user0.address)

    expect(await ulpManager.isHandler(user1.address)).eq(false)
    await ulpManager.connect(user0).setHandler(user1.address, true)
    expect(await ulpManager.isHandler(user1.address)).eq(true)
  })

  it("setCooldownDuration", async () => {
    await expect(ulpManager.connect(user0).setCooldownDuration(1000))
      .to.be.revertedWith("Governable: forbidden")

    await ulpManager.setGov(user0.address)

    await expect(ulpManager.connect(user0).setCooldownDuration(48 * 60 * 60 + 1))
      .to.be.revertedWith("UlpManager: invalid _cooldownDuration")

    expect(await ulpManager.cooldownDuration()).eq(24 * 60 * 60)
    await ulpManager.connect(user0).setCooldownDuration(48 * 60 * 60)
    expect(await ulpManager.cooldownDuration()).eq(48 * 60 * 60)
  })

  it("setAumAdjustment", async () => {
    await expect(ulpManager.connect(user0).setAumAdjustment(29, 17))
      .to.be.revertedWith("Governable: forbidden")

    await ulpManager.setGov(user0.address)

    expect(await ulpManager.aumAddition()).eq(0)
    expect(await ulpManager.aumDeduction()).eq(0)
    expect(await ulpManager.getAum(true)).eq(0)
    await ulpManager.connect(user0).setAumAdjustment(29, 17)
    expect(await ulpManager.aumAddition()).eq(29)
    expect(await ulpManager.aumDeduction()).eq(17)
    expect(await ulpManager.getAum(true)).eq(12)
  })

  it("setShortsTrackerAveragePriceWeight", async () => {
    await expect(ulpManager.connect(user0).setShortsTrackerAveragePriceWeight(5000))
      .to.be.revertedWith("Governable: forbidden")

    expect(await ulpManager.shortsTrackerAveragePriceWeight()).eq(10000)
    expect(await ulpManager.gov()).eq(wallet.address)
    await ulpManager.connect(wallet).setShortsTrackerAveragePriceWeight(5000)
    expect(await ulpManager.shortsTrackerAveragePriceWeight()).eq(5000)
  })

  it("setShortsTracker", async () => {
    await expect(ulpManager.connect(user0).setShortsTracker(user2.address))
      .to.be.revertedWith("Governable: forbidden")

    expect(await ulpManager.shortsTracker()).eq(shortsTracker.address)
    expect(await ulpManager.gov()).eq(wallet.address)
    await ulpManager.connect(wallet).setShortsTracker(user2.address)
    expect(await ulpManager.shortsTracker()).eq(user2.address)
  })

  it("addLiquidity, removeLiquidity", async () => {
    await dai.mint(user0.address, expandDecimals(100, 18))
    await dai.connect(user0).approve(ulpManager.address, expandDecimals(100, 18))

    await expect(ulpManager.connect(user0).addLiquidity(
      dai.address,
      expandDecimals(100, 18),
      expandDecimals(101, 18),
      expandDecimals(101, 18)
    )).to.be.revertedWith("Vault: forbidden")

    await vault.setManager(ulpManager.address, true)

    await expect(ulpManager.connect(user0).addLiquidity(
      dai.address,
      expandDecimals(100, 18),
      expandDecimals(101, 18),
      expandDecimals(101, 18)
    )).to.be.revertedWith("UlpManager: insufficient USDG output")

    await bnbPriceFeed.setLatestAnswer(toChainlinkPrice(300))
    await bnbPriceFeed.setLatestAnswer(toChainlinkPrice(300))
    await bnbPriceFeed.setLatestAnswer(toChainlinkPrice(400))

    expect(await dai.balanceOf(user0.address)).eq(expandDecimals(100, 18))
    expect(await dai.balanceOf(vault.address)).eq(0)
    expect(await usdg.balanceOf(ulpManager.address)).eq(0)
    expect(await ulp.balanceOf(user0.address)).eq(0)
    expect(await ulpManager.lastAddedAt(user0.address)).eq(0)
    expect(await ulpManager.getAumInUsdg(true)).eq(0)

    const tx0 = await ulpManager.connect(user0).addLiquidity(
      dai.address,
      expandDecimals(100, 18),
      expandDecimals(99, 18),
      expandDecimals(99, 18)
    )
    await reportGasUsed(provider, tx0, "addLiquidity gas used")

    let blockTime = await getBlockTime(provider)

    expect(await dai.balanceOf(user0.address)).eq(0)
    expect(await dai.balanceOf(vault.address)).eq(expandDecimals(100, 18))
    expect(await usdg.balanceOf(ulpManager.address)).eq("99700000000000000000") // 99.7
    expect(await ulp.balanceOf(user0.address)).eq("99700000000000000000")
    expect(await ulp.totalSupply()).eq("99700000000000000000")
    expect(await ulpManager.lastAddedAt(user0.address)).eq(blockTime)
    expect(await ulpManager.getAumInUsdg(true)).eq("99700000000000000000")
    expect(await ulpManager.getAumInUsdg(false)).eq("99700000000000000000")

    await bnb.mint(user1.address, expandDecimals(1, 18))
    await bnb.connect(user1).approve(ulpManager.address, expandDecimals(1, 18))

    await ulpManager.connect(user1).addLiquidity(
      bnb.address,
      expandDecimals(1, 18),
      expandDecimals(299, 18),
      expandDecimals(299, 18)
    )
    blockTime = await getBlockTime(provider)

    expect(await usdg.balanceOf(ulpManager.address)).eq("398800000000000000000") // 398.8
    expect(await ulp.balanceOf(user0.address)).eq("99700000000000000000") // 99.7
    expect(await ulp.balanceOf(user1.address)).eq("299100000000000000000") // 299.1
    expect(await ulp.totalSupply()).eq("398800000000000000000")
    expect(await ulpManager.lastAddedAt(user1.address)).eq(blockTime)
    expect(await ulpManager.getAumInUsdg(true)).eq("498500000000000000000")
    expect(await ulpManager.getAumInUsdg(false)).eq("398800000000000000000")

    await expect(ulp.connect(user1).transfer(user2.address, expandDecimals(1, 18)))
      .to.be.revertedWith("BaseToken: msg.sender not whitelisted")

    await bnbPriceFeed.setLatestAnswer(toChainlinkPrice(400))
    await bnbPriceFeed.setLatestAnswer(toChainlinkPrice(400))
    await bnbPriceFeed.setLatestAnswer(toChainlinkPrice(500))

    expect(await ulpManager.getAumInUsdg(true)).eq("598200000000000000000") // 598.2
    expect(await ulpManager.getAumInUsdg(false)).eq("498500000000000000000") // 498.5

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(60000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(60000))
    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(60000))

    await btc.mint(user2.address, "1000000") // 0.01 BTC, $500
    await btc.connect(user2).approve(ulpManager.address, expandDecimals(1, 18))

    await expect(ulpManager.connect(user2).addLiquidity(
      btc.address,
      "1000000",
      expandDecimals(599, 18),
      expandDecimals(399, 18)
    )).to.be.revertedWith("UlpManager: insufficient USDG output")

    await expect(ulpManager.connect(user2).addLiquidity(
      btc.address,
      "1000000",
      expandDecimals(598, 18),
      expandDecimals(399, 18)
    )).to.be.revertedWith("UlpManager: insufficient ULP output")

    await ulpManager.connect(user2).addLiquidity(
      btc.address,
      "1000000",
      expandDecimals(598, 18),
      expandDecimals(398, 18)
    )

    blockTime = await getBlockTime(provider)

    expect(await usdg.balanceOf(ulpManager.address)).eq("997000000000000000000") // 997
    expect(await ulp.balanceOf(user0.address)).eq("99700000000000000000") // 99.7
    expect(await ulp.balanceOf(user1.address)).eq("299100000000000000000") // 299.1
    expect(await ulp.balanceOf(user2.address)).eq("398800000000000000000") // 398.8
    expect(await ulp.totalSupply()).eq("797600000000000000000") // 797.6
    expect(await ulpManager.lastAddedAt(user2.address)).eq(blockTime)
    expect(await ulpManager.getAumInUsdg(true)).eq("1196400000000000000000") // 1196.4
    expect(await ulpManager.getAumInUsdg(false)).eq("1096700000000000000000") // 1096.7

    await expect(ulpManager.connect(user0).removeLiquidity(
      dai.address,
      "99700000000000000000",
      expandDecimals(123, 18),
      user0.address
    )).to.be.revertedWith("UlpManager: cooldown duration not yet passed")

    await increaseTime(provider, 24 * 60 * 60 + 1)
    await mineBlock(provider)

    await expect(ulpManager.connect(user0).removeLiquidity(
      dai.address,
      expandDecimals(73, 18),
      expandDecimals(100, 18),
      user0.address
    )).to.be.revertedWith("Vault: poolAmount exceeded")

    expect(await dai.balanceOf(user0.address)).eq(0)
    expect(await ulp.balanceOf(user0.address)).eq("99700000000000000000") // 99.7

    await ulpManager.connect(user0).removeLiquidity(
      dai.address,
      expandDecimals(72, 18),
      expandDecimals(98, 18),
      user0.address
    )

    expect(await dai.balanceOf(user0.address)).eq("98703000000000000000") // 98.703, 72 * 1096.7 / 797.6 => 99
    expect(await bnb.balanceOf(user0.address)).eq(0)
    expect(await ulp.balanceOf(user0.address)).eq("27700000000000000000") // 27.7

    await ulpManager.connect(user0).removeLiquidity(
      bnb.address,
      "27700000000000000000", // 27.7, 27.7 * 1096.7 / 797.6 => 38.0875
      "75900000000000000", // 0.0759 BNB => 37.95 USD
      user0.address
    )

    expect(await dai.balanceOf(user0.address)).eq("98703000000000000000")
    expect(await bnb.balanceOf(user0.address)).eq("75946475000000000") // 0.075946475
    expect(await ulp.balanceOf(user0.address)).eq(0)

    expect(await ulp.totalSupply()).eq("697900000000000000000") // 697.9
    expect(await ulpManager.getAumInUsdg(true)).eq("1059312500000000000000") // 1059.3125
    expect(await ulpManager.getAumInUsdg(false)).eq("967230000000000000000") // 967.23

    expect(await bnb.balanceOf(user1.address)).eq(0)
    expect(await ulp.balanceOf(user1.address)).eq("299100000000000000000")

    await ulpManager.connect(user1).removeLiquidity(
      bnb.address,
      "299100000000000000000", // 299.1, 299.1 * 967.23 / 697.9 => 414.527142857
      "826500000000000000", // 0.8265 BNB => 413.25
      user1.address
    )

    expect(await bnb.balanceOf(user1.address)).eq("826567122857142856") // 0.826567122857142856
    expect(await ulp.balanceOf(user1.address)).eq(0)

    expect(await ulp.totalSupply()).eq("398800000000000000000") // 398.8
    expect(await ulpManager.getAumInUsdg(true)).eq("644785357142857143000") // 644.785357142857143
    expect(await ulpManager.getAumInUsdg(false)).eq("635608285714285714400") // 635.6082857142857144

    expect(await btc.balanceOf(user2.address)).eq(0)
    expect(await ulp.balanceOf(user2.address)).eq("398800000000000000000") // 398.8

    expect(await vault.poolAmounts(dai.address)).eq("700000000000000000") // 0.7
    expect(await vault.poolAmounts(bnb.address)).eq("91770714285714286") // 0.091770714285714286
    expect(await vault.poolAmounts(btc.address)).eq("997000") // 0.00997

    await expect(ulpManager.connect(user2).removeLiquidity(
      btc.address,
      expandDecimals(375, 18),
      "990000", // 0.0099
      user2.address
    )).to.be.revertedWith("USDG: forbidden")

    await usdg.addVault(ulpManager.address)

    const tx1 = await ulpManager.connect(user2).removeLiquidity(
      btc.address,
      expandDecimals(375, 18),
      "990000", // 0.0099
      user2.address
    )
    await reportGasUsed(provider, tx1, "removeLiquidity gas used")

    expect(await btc.balanceOf(user2.address)).eq("993137")
    expect(await ulp.balanceOf(user2.address)).eq("23800000000000000000") // 23.8
  })

  it("addLiquidityForAccount, removeLiquidityForAccount", async () => {
    await vault.setManager(ulpManager.address, true)
    await ulpManager.setInPrivateMode(true)
    await ulpManager.setHandler(rewardRouter.address, true)

    await dai.mint(user3.address, expandDecimals(100, 18))
    await dai.connect(user3).approve(ulpManager.address, expandDecimals(100, 18))

    await expect(ulpManager.connect(user0).addLiquidityForAccount(
      user3.address,
      user0.address,
      dai.address,
      expandDecimals(100, 18),
      expandDecimals(101, 18),
      expandDecimals(101, 18)
    )).to.be.revertedWith("UlpManager: forbidden")

    await expect(ulpManager.connect(rewardRouter).addLiquidityForAccount(
      user3.address,
      user0.address,
      dai.address,
      expandDecimals(100, 18),
      expandDecimals(101, 18),
      expandDecimals(101, 18)
    )).to.be.revertedWith("UlpManager: insufficient USDG output")

    expect(await dai.balanceOf(user3.address)).eq(expandDecimals(100, 18))
    expect(await dai.balanceOf(user0.address)).eq(0)
    expect(await dai.balanceOf(vault.address)).eq(0)
    expect(await usdg.balanceOf(ulpManager.address)).eq(0)
    expect(await ulp.balanceOf(user0.address)).eq(0)
    expect(await ulpManager.lastAddedAt(user0.address)).eq(0)
    expect(await ulpManager.getAumInUsdg(true)).eq(0)

    await ulpManager.connect(rewardRouter).addLiquidityForAccount(
      user3.address,
      user0.address,
      dai.address,
      expandDecimals(100, 18),
      expandDecimals(99, 18),
      expandDecimals(99, 18)
    )

    let blockTime = await getBlockTime(provider)

    expect(await dai.balanceOf(user3.address)).eq(0)
    expect(await dai.balanceOf(user0.address)).eq(0)
    expect(await dai.balanceOf(vault.address)).eq(expandDecimals(100, 18))
    expect(await usdg.balanceOf(ulpManager.address)).eq("99700000000000000000") // 99.7
    expect(await ulp.balanceOf(user0.address)).eq("99700000000000000000")
    expect(await ulp.totalSupply()).eq("99700000000000000000")
    expect(await ulpManager.lastAddedAt(user0.address)).eq(blockTime)
    expect(await ulpManager.getAumInUsdg(true)).eq("99700000000000000000")

    await bnb.mint(user1.address, expandDecimals(1, 18))
    await bnb.connect(user1).approve(ulpManager.address, expandDecimals(1, 18))

    await increaseTime(provider, 24 * 60 * 60 + 1)
    await mineBlock(provider)

    await ulpManager.connect(rewardRouter).addLiquidityForAccount(
      user1.address,
      user1.address,
      bnb.address,
      expandDecimals(1, 18),
      expandDecimals(299, 18),
      expandDecimals(299, 18)
    )
    blockTime = await getBlockTime(provider)

    expect(await usdg.balanceOf(ulpManager.address)).eq("398800000000000000000") // 398.8
    expect(await ulp.balanceOf(user0.address)).eq("99700000000000000000")
    expect(await ulp.balanceOf(user1.address)).eq("299100000000000000000")
    expect(await ulp.totalSupply()).eq("398800000000000000000")
    expect(await ulpManager.lastAddedAt(user1.address)).eq(blockTime)
    expect(await ulpManager.getAumInUsdg(true)).eq("398800000000000000000")

    await expect(ulpManager.connect(user1).removeLiquidityForAccount(
      user1.address,
      bnb.address,
      "99700000000000000000",
      expandDecimals(290, 18),
      user1.address
    )).to.be.revertedWith("UlpManager: forbidden")

    await expect(ulpManager.connect(rewardRouter).removeLiquidityForAccount(
      user1.address,
      bnb.address,
      "99700000000000000000",
      expandDecimals(290, 18),
      user1.address
    )).to.be.revertedWith("UlpManager: cooldown duration not yet passed")

    await ulpManager.connect(rewardRouter).removeLiquidityForAccount(
      user0.address,
      dai.address,
      "79760000000000000000", // 79.76
      "79000000000000000000", // 79
      user0.address
    )

    expect(await dai.balanceOf(user0.address)).eq("79520720000000000000")
    expect(await bnb.balanceOf(user0.address)).eq(0)
    expect(await ulp.balanceOf(user0.address)).eq("19940000000000000000") // 19.94
  })

  context("Different avg price in Vault and ShortsTracker", async () => {
    beforeEach(async () => {
      await vaultPriceFeed.setPriceSampleSpace(1)

      await dai.mint(vault.address, expandDecimals(100000, 18))
      await vault.directPoolDeposit(dai.address)

      let aum = await ulpManager.getAum(true)
      expect(aum, "aum 0").to.equal(toUsd(100000))

      await btcPriceFeed.setLatestAnswer(toChainlinkPrice(60000))
      await dai.mint(user0.address, expandDecimals(1000, 18))
      await dai.connect(user0).approve(router.address, expandDecimals(1000, 18))
      // vault globalShortSizes(BTC) will be 2000 and globalShortAveragePrices(BTC) will be 60000
      await router.connect(user0).increasePosition([dai.address], btc.address, expandDecimals(1000, 18), 0, toUsd(2000), false, toUsd(60000))

      // set different average price to ShortsTracker
      await shortsTracker.setIsGlobalShortDataReady(false)
      await shortsTracker.setInitData([btc.address], [toUsd(61000)])
      await shortsTracker.setIsGlobalShortDataReady(false)
    })

    it("UlpManager ignores ShortsTracker if flag is off", async () => {
      expect(await shortsTracker.isGlobalShortDataReady()).to.be.false

      expect(await vault.globalShortSizes(btc.address), "size 0").to.equal(toUsd(2000))
      expect(await vault.globalShortAveragePrices(btc.address), "avg price 0").to.equal(toUsd(60000))

      await btcPriceFeed.setLatestAnswer(toChainlinkPrice(54000))
      expect((await vaultUtils.getGlobalShortDelta(btc.address))[1], "delta 0").to.equal(toUsd(200))
      
      //TODO Removed
      //expect((await shortsTracker.getGlobalShortDelta(btc.address))[1], "delta 1").to.equal("229508196721311475409836065573770")

      // aum should be $100,000 pool - $200 shorts pnl = 99,800
      expect(await ulpManager.getAum(true), "aum 1").to.equal(toUsd(99800))
    })

    it("UlpManager switches gradually to ShortsTracker average price", async () => {
      expect(await vault.globalShortSizes(btc.address), "size 0").to.equal(toUsd(2000))
      expect(await vault.globalShortAveragePrices(btc.address), "avg price 0").to.equal(toUsd(60000))

      await ulpManager.setShortsTrackerAveragePriceWeight(0)
      expect(await shortsTracker.globalShortAveragePrices(btc.address), "avg price 1").to.equal(toUsd(61000))

      await btcPriceFeed.setLatestAnswer(toChainlinkPrice(54000))

      await shortsTracker.setIsGlobalShortDataReady(true)
      // with flag enabled it should be the same because shortsTrackerAveragePriceWeight is 0
      expect(await ulpManager.getAum(true), "aum 2").to.equal(toUsd(99800))

      // according to ShortsTracker data pnl is ~$229.51
      // gradually configure UlpManager to use ShortsTracker for aum calculation
      await ulpManager.setShortsTrackerAveragePriceWeight(1000) // 10% for ShortsTracker, 90% for Vault
      // 100,000 - (200 * 90% + 229.51 * 10%) = 99,797.05
      expect(await ulpManager.getAum(true), "aum 3").to.equal("99797004991680532445923460898502496")

      await ulpManager.setShortsTrackerAveragePriceWeight(5000) // 50% for ShortsTracker, 50% for Vault
      // 100,000 - (200 * 50% + 229.51 * 50%) = 99,785.25
      expect(await ulpManager.getAum(true), "aum 4").to.equal("99785123966942148760330578512396695")

      await ulpManager.setShortsTrackerAveragePriceWeight(10000) // 100% for ShortsTracker
      // 100,000 - (200 * 0 + 229.51 * 100%) = 99,770.49
      expect(await ulpManager.getAum(true), "aum 5").to.equal("99770491803278688524590163934426230")
    })

    it("UlpManager switches back to Vault average price after flag is turned off", async () => {
      await btcPriceFeed.setLatestAnswer(toChainlinkPrice(54000))
      await ulpManager.setShortsTrackerAveragePriceWeight(10000)

      // flag is disabled, aum is calculated with Vault values
      expect(await ulpManager.getAum(true), "aum 0").to.equal(toUsd(99800))

      // enable ShortsTracker
      await shortsTracker.setIsGlobalShortDataReady(true)
      expect(await ulpManager.getAum(true), "aum 1").to.equal("99770491803278688524590163934426230")

      // back to vault
      await shortsTracker.setIsGlobalShortDataReady(false)
      expect(await ulpManager.getAum(true), "aum 2").to.equal(toUsd(99800))
    })
  })
})
