const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { expandDecimals, bigNumberify, getBlockTime, increaseTime, mineBlock, reportGasUsed } = require("../shared/utilities")
const { toChainlinkPrice } = require("../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../shared/units")
const { initVault, getBnbConfig, getBtcConfig, getDaiConfig, getEurConfig, getJpyConfig, validateVaultBalance } = require("./Vault/helpers")
const { deployFixture } = require("../../utils/fixture")
const { prepareOracleParam, getOracleBlock, getSigners } = require("../shared/prepareOracleParams")

use(solidity)

describe("SyntheticPositionManager", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3] = provider.getWallets()
  let vault
  let vaultUtils
  let vaultPriceFeed
  let positionManager
  let usdg
  let router
  let bnb
  let bnbPriceFeed
  let btc
  let btcPriceFeed
  let dai
  let daiPriceFeed
  let eur
  let eurPriceFeed
  let jpy
  let jpyPriceFeed
  let distributor0
  let yieldTracker0
  let orderBook
  let deployTimelock

  let ulpManager
  let ulp

  let oracle
  let oracleStore

  beforeEach(async () => {
    bnb = await deployContract("Token", [])
    bnbPriceFeed = await deployContract("PriceFeed", [])

    btc = await deployContract("Token", [])
    btcPriceFeed = await deployContract("PriceFeed", [])

    dai = await deployContract("Token", [])
    daiPriceFeed = await deployContract("PriceFeed", [])

    eur = await deployContract("Token", [])
    eurPriceFeed = await deployContract("PriceFeed", [])

    jpy = await deployContract("Token", [])
    jpyPriceFeed = await deployContract("PriceFeed", [])

    vault = await deployContract("Vault", [])
    await vault.setIsLeverageEnabled(false)
    usdg = await deployContract("USDG", [vault.address])
    router = await deployContract("Router", [vault.address, usdg.address, bnb.address])
    vaultPriceFeed = await deployContract("VaultPriceFeed", [])

    const initVaultResult = await initVault(vault, router, usdg, vaultPriceFeed)
    vaultUtils = initVaultResult.vaultUtils

    distributor0 = await deployContract("TimeDistributor", [])
    yieldTracker0 = await deployContract("YieldTracker", [usdg.address])

    await yieldTracker0.setDistributor(distributor0.address)
    await distributor0.setDistribution([yieldTracker0.address], [1000], [bnb.address])

    await bnb.mint(distributor0.address, 5000)
    await usdg.setYieldTrackers([yieldTracker0.address])

    await vaultPriceFeed.setTokenConfig(bnb.address, bnbPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(btc.address, btcPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(dai.address, daiPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(eur.address, eurPriceFeed.address, 8, false)
    await vaultPriceFeed.setTokenConfig(jpy.address, jpyPriceFeed.address, 8, false)

    await vault.setSyntheticStableToken(dai.address)
    await vault.setUsdcSharesForSyntheticAsset(2000)
    await vaultUtils.setIsTradable(bnb.address, true)
    await vaultUtils.setIsTradable(btc.address, true)
    await vaultUtils.setIsTradable(dai.address, true)
    await vaultUtils.setIsTradable(eur.address, true)
    await vaultUtils.setIsTradable(jpy.address, true)

    orderBook = await deployContract("OrderBook", [])
    const minExecutionFee = 500000;
    await orderBook.initialize(
      router.address,
      vault.address,
      bnb.address,
      usdg.address,
      minExecutionFee,
      expandDecimals(5, 30) // minPurchseTokenAmountUsd
    );
    await router.addPlugin(orderBook.address)
    await router.connect(user0).approvePlugin(orderBook.address)
    await vault.setOrderBook(orderBook.address)

    ulp = await deployContract("ULP", [])

    const shortsTracker = await deployContract("ShortsTracker", [vault.address])
    await shortsTracker.setIsGlobalShortDataReady(true)

    ulpManager = await deployContract("UlpManager", [
      vault.address,
      usdg.address,
      ulp.address,
      shortsTracker.address,
      24 * 60 * 60
    ])
    await ulpManager.setShortsTrackerAveragePriceWeight(10000)

    oracle = await deployContract("Oracle", [])
    oracleStore = await deployContract("OracleStore", [])
    await oracle.setOracleStore(oracleStore.address)

    const fixture = await deployFixture();
    //const { oracleSalt, signerIndexes } = fixture.props;
    const oracleSigners = await getSigners(fixture)
    for (let i = 0; i < oracleSigners.length; i++) {
      const tmpSigner = oracleSigners[i]
      //console.log(tmpSigner.address)
      await oracleStore.addSigner(tmpSigner.address)
    }
    await oracle.setPriceFeed(vaultPriceFeed.address)
    
    positionManager = await deployContract("PositionManager", [
      vault.address,
      router.address,
      shortsTracker.address,
      bnb.address,
      50,
      orderBook.address,
      oracle.address
    ])
    await shortsTracker.setHandler(positionManager.address, true)
    await oracle.setPositionManager(positionManager.address, true)
    await orderBook.setPositionManager(positionManager.address, true)

    const tokenNeedToSetGlobalSizeLimitAddrArr = [dai.address, btc.address, bnb.address, eur.address, jpy.address]
    const longSizes = [expandDecimals(10001, 30), expandDecimals(10002, 30), expandDecimals(10003, 30), expandDecimals(8004, 30), expandDecimals(10005, 30)]
    const shortSizes = [expandDecimals(9000, 30), expandDecimals(8000, 30), expandDecimals(7000, 30), expandDecimals(7500, 30), expandDecimals(3500, 30)]
    await positionManager.setMaxGlobalSizes(tokenNeedToSetGlobalSizeLimitAddrArr, longSizes, shortSizes)

    await daiPriceFeed.setLatestAnswer(toChainlinkPrice(1))
    await vault.setTokenConfig(...getDaiConfig(dai, daiPriceFeed))

    await btcPriceFeed.setLatestAnswer(toChainlinkPrice(60000))
    await vault.setTokenConfig(...getBtcConfig(btc, btcPriceFeed))

    await bnbPriceFeed.setLatestAnswer(toChainlinkPrice(300))
    await vault.setTokenConfig(...getBnbConfig(bnb, bnbPriceFeed))

    await eurPriceFeed.setLatestAnswer(toChainlinkPrice(1.072))
    await vault.setTokenConfig(...getEurConfig(eur, eurPriceFeed))

    await jpyPriceFeed.setLatestAnswer(toChainlinkPrice(0.0076))
    await vault.setTokenConfig(...getJpyConfig(jpy, jpyPriceFeed))

    await bnb.mint(user1.address, expandDecimals(1000, 18))
    await bnb.connect(user1).approve(router.address, expandDecimals(1000, 18))
    await router.connect(user1).swap([bnb.address, usdg.address], expandDecimals(1000, 18), expandDecimals(29000, 18), user1.address)

    await dai.mint(user1.address, expandDecimals(500000, 18))
    await dai.connect(user1).approve(router.address, expandDecimals(300000, 18))
    await router.connect(user1).swap([dai.address, usdg.address], expandDecimals(10000, 18), expandDecimals(9000, 18), user1.address)

    await btc.mint(user1.address, expandDecimals(10, 8))
    await btc.connect(user1).approve(router.address, expandDecimals(10, 8))
    await router.connect(user1).swap([btc.address, usdg.address], expandDecimals(10, 8), expandDecimals(59000, 18), user1.address)

    deployTimelock = async () => {
      return await deployContract("Timelock", [
        wallet.address, // _admin
        5 * 24 * 60 * 60, // _buffer
        ethers.constants.AddressZero, // _tokenManager
        ethers.constants.AddressZero, // _mintReceiver
        ethers.constants.AddressZero, // _ulpManager
        ethers.constants.AddressZero, // _rewardRouter
        expandDecimals(1000, 18), // _maxTokenSupply
        10, // _marginFeeBasisPoints
        100 // _maxMarginFeeBasisPoints
      ])
    }
  })

  it("Synthetic_increasePositionV2", async () => {
    await expect(vault.connect(user1).increasePositionV2(user0.address, dai.address, eur.address, toUsd(100), true, oracle.address))
    .to.be.revertedWith("incNotOb")

    const timelock = await deployTimelock()
    await vault.setGov(timelock.address)
    await timelock.setContractHandler(positionManager.address, true)
    await timelock.setShouldToggleIsLeverageEnabled(true)
    await positionManager.setInLegacyMode(true)
    await router.addPlugin(positionManager.address)
    await router.connect(user0).approvePlugin(positionManager.address)

    const executionFee = expandDecimals(1, 17) // 0.1 WETH
    await dai.mint(user0.address, expandDecimals(20000, 18))
    await dai.connect(user0).approve(router.address, expandDecimals(20000, 18))
    await bnb.mint(user0.address, expandDecimals(1000, 18))
    await bnb.connect(user0).approve(router.address, expandDecimals(1000, 18))

    const createIncreaseOrder = (amountIn = expandDecimals(1000, 18), sizeDelta = toUsd(2000), isLong = true) => {
      const path = [bnb.address, ]
      const collateralToken = bnb.address
      return orderBook.connect(user0).createIncreaseOrder(
        path,
        amountIn,
        eur.address, // indexToken
        0, // minOut
        sizeDelta,
        collateralToken,
        isLong,
        toUsd(1.07), // triggerPrice
        false, // triggerAboveThreshold
        executionFee,
        false, // shouldWrap
        {value: executionFee}
      );
    }
    await positionManager.setOrderKeeper(user1.address, true)

    const amountIn = expandDecimals(100, 18)
    const sizeDelta = toUsd(100)
    await createIncreaseOrder(amountIn, sizeDelta, true)
    let orderIndex = (await orderBook.increaseOrdersIndex(user0.address)) - 1

    let feedTokens = [bnb.address, eur.address];
    let precisions = [26, 22];
    let minPrices = [Math.trunc(300 *10**4), Math.trunc(1.068 *10**8)];
    let maxPrices = [Math.trunc(300 *10**4), Math.trunc(1.069 *10**8)];
    let priceFeedTokens = [];
    let oracleParam = await prepareOracleParam(feedTokens, precisions, minPrices, maxPrices, priceFeedTokens, await getOracleBlock(provider))
    expect(oracleParam).to.not.be.null;

    await expect(positionManager.connect(user1).executeIncreaseOrder(user0.address, orderIndex, user1.address, oracleParam)).to.be.revertedWith("synUsdc")
  })

  it("Synthetic_executeIncreaseOrder", async () => {
    const timelock = await deployTimelock()
    await vault.setGov(timelock.address)
    await timelock.setContractHandler(positionManager.address, true)
    await timelock.setShouldToggleIsLeverageEnabled(true)
    await positionManager.setInLegacyMode(true)
    await router.addPlugin(positionManager.address)
    await router.connect(user0).approvePlugin(positionManager.address)

    const executionFee = expandDecimals(1, 17) // 0.1 WETH
    await dai.mint(user0.address, expandDecimals(20000, 18))
    await dai.connect(user0).approve(router.address, expandDecimals(20000, 18))

    const createIncreaseOrder = (amountIn = expandDecimals(1000, 18), sizeDelta = toUsd(2000), isLong = true) => {
      const path = [dai.address, ]
      const collateralToken = dai.address
      return orderBook.connect(user0).createIncreaseOrder(
        path,
        amountIn,
        eur.address, // indexToken
        0, // minOut
        sizeDelta,
        collateralToken,
        isLong,
        toUsd(1.07), // triggerPrice
        false, // triggerAboveThreshold
        executionFee,
        false, // shouldWrap
        {value: executionFee}
      );
    }
    let feedTokens = [dai.address, eur.address];
    let precisions = [26, 22];
    let minPrices = [Math.trunc(1 *10**4), Math.trunc(1.068 *10**8)];
    let maxPrices = [Math.trunc(1 *10**4), Math.trunc(1.069 *10**8)];
    let priceFeedTokens = [];

    await positionManager.setOrderKeeper(user1.address, true)

    const beforeDaiPoolAmounts = await vault.poolAmounts(dai.address)

    const beforeFeeReserves = await vault.feeReserves(dai.address)
    console.log("before feeReserves:", beforeFeeReserves)

    const beforeGuaranteedUsd = await vault.guaranteedUsd(eur.address)
    console.log("before GuaranteedUsd: ", beforeGuaranteedUsd)

    const amountIn = expandDecimals(100, 18)
    const sizeDelta = toUsd(100)
    await createIncreaseOrder(amountIn, sizeDelta, true)
    let orderIndex = (await orderBook.increaseOrdersIndex(user0.address)) - 1

    let oracleParam = await prepareOracleParam(feedTokens, precisions, minPrices, maxPrices, priceFeedTokens, await getOracleBlock(provider))
    expect(oracleParam).to.not.be.null;

    await timelock.setIsSyntheticTradeEnabled(vault.address, false)
    await expect(positionManager.connect(user1).executeIncreaseOrder(user0.address, orderIndex, user1.address, oracleParam)).to.be.revertedWith("synClosed")
    await timelock.setIsSyntheticTradeEnabled(vault.address, true)

    await vaultUtils.setIsTradable(dai.address, false)
    await expect(positionManager.connect(user1).executeIncreaseOrder(user0.address, orderIndex, user1.address, oracleParam)).to.be.revertedWith("notTrade1")
    await vaultUtils.setIsTradable(dai.address, true)

    await vaultUtils.setIsTradable(eur.address, false)
    await expect(positionManager.connect(user1).executeIncreaseOrder(user0.address, orderIndex, user1.address, oracleParam)).to.be.revertedWith("notTrade2")
    await vaultUtils.setIsTradable(eur.address, true)

    console.log("begin to run executeIncreaseOrder")
    await positionManager.connect(user1).executeIncreaseOrder(user0.address, orderIndex, user1.address, oracleParam)

    let afterFeeAmount = await vault.feeReserves(dai.address)
    const feeAmount = afterFeeAmount.sub(beforeFeeReserves)
    const expectReservedAmounts = await vault.usdToTokenMax(dai.address, sizeDelta);
    expect(await vault.reservedAmounts(dai.address)).eq(expectReservedAmounts)
    expect(await vault.poolAmounts(dai.address)).eq(amountIn.add(beforeDaiPoolAmounts).sub(feeAmount))
    expect(await vault.syntheticCollateralAmounts(eur.address)).eq(amountIn.sub(feeAmount))

    const afterGuaranteedUsd = await vault.guaranteedUsd(eur.address)
    console.log("after GuaranteedUsd: ", afterGuaranteedUsd)

    const maxPrice = await vault.getMaxPrice(dai.address)
    console.log("maxPrice: ", maxPrice)
    const decimals = await vault.tokenDecimals(dai.address);
    console.log("decimals: ", decimals)
    const feeUsd = maxPrice.mul(feeAmount).div(expandDecimals(1, decimals))
    console.log("feeUsd: ", feeUsd)

    const collateralDeltaUsd = await vault.tokenToUsdMin(dai.address, amountIn);
    console.log("collateralDeltaUsd: ", collateralDeltaUsd)
    console.log("sizeDelta: ", sizeDelta)
    expect(afterGuaranteedUsd).eq(sizeDelta.add(feeUsd).sub(collateralDeltaUsd))
  })

  it("Synthetic_MultipleIncreaseOrder", async () => {
    const timelock = await deployTimelock()
    await vault.setGov(timelock.address)
    await timelock.setContractHandler(positionManager.address, true)
    await timelock.setShouldToggleIsLeverageEnabled(true)
    await positionManager.setInLegacyMode(true)
    await router.addPlugin(positionManager.address)
    await router.connect(user0).approvePlugin(positionManager.address)

    const executionFee = expandDecimals(1, 17) // 0.1 WETH
    await dai.mint(user0.address, expandDecimals(20000, 18))
    await dai.connect(user0).approve(router.address, expandDecimals(20000, 18))

    const createIncreaseOrder = (amountIn = expandDecimals(1000, 18), sizeDelta = toUsd(2000), isLong = true) => {
      const path = [dai.address, ]
      const collateralToken = dai.address
      return orderBook.connect(user0).createIncreaseOrder(
        path,
        amountIn,
        eur.address, // indexToken
        0, // minOut
        sizeDelta,
        collateralToken,
        isLong,
        toUsd(1.07), // triggerPrice
        false, // triggerAboveThreshold
        executionFee,
        false, // shouldWrap
        {value: executionFee}
      );
    }
    let feedTokens = [dai.address, eur.address];
    let precisions = [26, 22];
    let minPrices = [Math.trunc(1 *10**4), Math.trunc(1.068 *10**8)];
    let maxPrices = [Math.trunc(1 *10**4), Math.trunc(1.069 *10**8)];
    let priceFeedTokens = [];

    await positionManager.setOrderKeeper(user1.address, true)

    const beforeSyntheticCollateralAmounts = await vault.syntheticCollateralAmounts(eur.address)
    const beforeDaiPoolAmounts = await vault.poolAmounts(dai.address)
    const beforeFeeReserves = await vault.feeReserves(dai.address)
    console.log("before feeReserves:", beforeFeeReserves)

    const beforeGuaranteedUsd = await vault.guaranteedUsd(eur.address)
    console.log("before GuaranteedUsd: ", beforeGuaranteedUsd)

    const amountIn = expandDecimals(100, 18)
    const sizeDelta = toUsd(100)
    await createIncreaseOrder(amountIn, sizeDelta, true)
    let orderIndex = (await orderBook.increaseOrdersIndex(user0.address)) - 1

    let oracleParam = await prepareOracleParam(feedTokens, precisions, minPrices, maxPrices, priceFeedTokens, await getOracleBlock(provider))
    expect(oracleParam).to.not.be.null;
    await positionManager.connect(user1).executeIncreaseOrder(user0.address, orderIndex, user1.address, oracleParam)
    let afterFeeAmount1 = await vault.feeReserves(dai.address)
    console.log("afterFeeAmount1: ", afterFeeAmount1.sub(beforeFeeReserves))

    await createIncreaseOrder(amountIn, sizeDelta, true)
    orderIndex = (await orderBook.increaseOrdersIndex(user0.address)) - 1

    oracleParam = await prepareOracleParam(feedTokens, precisions, minPrices, maxPrices, priceFeedTokens, await getOracleBlock(provider))
    expect(oracleParam).to.not.be.null;
    await positionManager.connect(user1).executeIncreaseOrder(user0.address, orderIndex, user1.address, oracleParam)

    let afterFeeAmount2 = await vault.feeReserves(dai.address)
    console.log("afterFeeAmount2: ", afterFeeAmount2.sub(afterFeeAmount1))

    const feeAmount = afterFeeAmount1.sub(beforeFeeReserves).add(afterFeeAmount2.sub(afterFeeAmount1))
    expect(await vault.syntheticCollateralAmounts(eur.address)).eq(amountIn.mul(2).sub(feeAmount))

    const expectReservedAmounts = await vault.usdToTokenMax(dai.address, sizeDelta.mul(2));
    expect(await vault.reservedAmounts(dai.address)).eq(expectReservedAmounts)
  })

  it("Synthetic_IncreaseShortPosition", async () => {
    const timelock = await deployTimelock()
    await vault.setGov(timelock.address)
    await timelock.setContractHandler(positionManager.address, true)
    await timelock.setShouldToggleIsLeverageEnabled(true)
    await positionManager.setInLegacyMode(true)
    await router.addPlugin(positionManager.address)
    await router.connect(user0).approvePlugin(positionManager.address)

    await dai.mint(user0.address, expandDecimals(20000, 18))
    await dai.connect(user0).approve(router.address, expandDecimals(20000, 18))

    const beforeFeeReserves = await vault.feeReserves(dai.address)
    console.log("before feeReserves:", beforeFeeReserves)

    const amountIn = expandDecimals(100, 18)
    const sizeDelta = toUsd(200)
    await positionManager.connect(user0).increasePosition([dai.address], eur.address, amountIn, 0, sizeDelta, false, toNormalizedPrice(1))

    let afterFeeAmount = await vault.feeReserves(dai.address)
    const feeAmount = afterFeeAmount.sub(beforeFeeReserves)
    const expectReservedAmounts = await vault.usdToTokenMax(dai.address, sizeDelta);
    expect(await vault.reservedAmounts(dai.address)).eq(expectReservedAmounts)
    expect(await vault.globalShortSizes(eur.address)).eq(sizeDelta)
  })

  it("Synthetic_decreasePositionV2", async () => {
    await expect(vault.connect(user1).decreasePositionV2(user0.address, dai.address, eur.address, toUsd(100), toUsd(100), true, user1.address, oracle.address))
    .to.be.revertedWith("decNotOb")
  })

  it("Synthetic_executeDecreaseLongOrder", async () => {
    const timelock = await deployTimelock()
    await vault.setGov(timelock.address)
    await timelock.setContractHandler(positionManager.address, true)
    await timelock.setShouldToggleIsLeverageEnabled(true)
    await positionManager.setInLegacyMode(true)
    await router.addPlugin(positionManager.address)
    await router.connect(user0).approvePlugin(positionManager.address)

    await dai.mint(user0.address, expandDecimals(20000, 18))
    await dai.connect(user0).approve(router.address, expandDecimals(20000, 18))

    const beforeFeeReserves = await vault.feeReserves(dai.address)
    console.log("before feeReserves:", beforeFeeReserves)
    const beforeGuaranteedUsd = await vault.guaranteedUsd(eur.address)
    console.log("before GuaranteedUsd: ", beforeGuaranteedUsd)
    await positionManager.connect(user0).increasePosition([dai.address], eur.address, expandDecimals(100, 18), 0, toUsd(200), true, toNormalizedPrice(2))
    const expectReservedAmounts = await vault.usdToTokenMax(dai.address, toUsd(200));
    expect(await vault.reservedAmounts(dai.address)).eq(expectReservedAmounts)

    let position = await vault.getPosition(user0.address, dai.address, eur.address, true)

    const executionFee = expandDecimals(1, 17) // 0.1 WETH
    await orderBook.connect(user0).createDecreaseOrder(
      eur.address,
      position[0],
      dai.address,
      position[1],
      true,
      toUsd(1),
      true,
      {value: executionFee}
    );

    let feedTokens = [dai.address, eur.address];
    let precisions = [26, 22];
    let minPrices = [Math.trunc(1 *10**4), Math.trunc(1.072 *10**8)];
    let maxPrices = [Math.trunc(1 *10**4), Math.trunc(1.072 *10**8)];
    let priceFeedTokens = [];
    let oracleParam = await prepareOracleParam(feedTokens, precisions, minPrices, maxPrices, priceFeedTokens, await getOracleBlock(provider))
    expect(oracleParam).to.not.be.null;

    const orderIndex = (await orderBook.decreaseOrdersIndex(user0.address)) - 1

    const balanceBefore = await provider.getBalance(user1.address)
    await positionManager.setOrderKeeper(user1.address, true)
    await positionManager.connect(user1).executeDecreaseOrder(user0.address, orderIndex, user1.address, oracleParam)
    expect((await orderBook.decreaseOrders(user0.address, orderIndex))[0]).to.be.equal(ethers.constants.AddressZero)
    const balanceAfter = await provider.getBalance(user1.address)
    expect(balanceAfter.gt(balanceBefore)).to.be.true
    expect(await vault.reservedAmounts(dai.address)).eq(bigNumberify(0))
    expect(await vault.syntheticCollateralAmounts(eur.address)).eq(bigNumberify(0))
    expect(await vault.guaranteedUsd(eur.address)).eq(bigNumberify(0))
  })

  it("Synthetic_executeDecreaseShortOrder", async () => {
    const timelock = await deployTimelock()
    await vault.setGov(timelock.address)
    await timelock.setContractHandler(positionManager.address, true)
    await timelock.setShouldToggleIsLeverageEnabled(true)
    await positionManager.setInLegacyMode(true)
    await router.addPlugin(positionManager.address)
    await router.connect(user0).approvePlugin(positionManager.address)

    await dai.mint(user0.address, expandDecimals(20000, 18))
    await dai.connect(user0).approve(router.address, expandDecimals(20000, 18))

    const beforeFeeReserves = await vault.feeReserves(dai.address)
    console.log("before feeReserves:", beforeFeeReserves)
    const beforeGlobalShortSizes = await vault.globalShortSizes(eur.address)
    console.log("before globalShortSizes: ", beforeGlobalShortSizes)

    await positionManager.connect(user0).increasePosition([dai.address], eur.address, expandDecimals(100, 18), 0, toUsd(200), false, toNormalizedPrice(1))
    const expectReservedAmounts = await vault.usdToTokenMax(dai.address, toUsd(200));
    expect(await vault.reservedAmounts(dai.address)).eq(expectReservedAmounts)

    let position = await vault.getPosition(user0.address, dai.address, eur.address, false)

    const executionFee = expandDecimals(1, 17) // 0.1 WETH
    await orderBook.connect(user0).createDecreaseOrder(
      eur.address,
      position[0],
      dai.address,
      position[1],
      false,
      toUsd(1),
      true,
      {value: executionFee}
    );

    let feedTokens = [dai.address, eur.address];
    let precisions = [26, 22];
    let minPrices = [Math.trunc(1 *10**4), Math.trunc(1.072 *10**8)];
    let maxPrices = [Math.trunc(1 *10**4), Math.trunc(1.072 *10**8)];
    let priceFeedTokens = [];
    let oracleParam = await prepareOracleParam(feedTokens, precisions, minPrices, maxPrices, priceFeedTokens, await getOracleBlock(provider))
    expect(oracleParam).to.not.be.null;

    const orderIndex = (await orderBook.decreaseOrdersIndex(user0.address)) - 1

    const balanceBefore = await provider.getBalance(user1.address)
    await positionManager.setOrderKeeper(user1.address, true)
    await positionManager.connect(user1).executeDecreaseOrder(user0.address, orderIndex, user1.address, oracleParam)
    expect((await orderBook.decreaseOrders(user0.address, orderIndex))[0]).to.be.equal(ethers.constants.AddressZero)
    const balanceAfter = await provider.getBalance(user1.address)
    expect(balanceAfter.gt(balanceBefore)).to.be.true
    expect(await vault.reservedAmounts(dai.address)).eq(bigNumberify(0))
    expect(await vault.globalShortSizes(eur.address)).eq(bigNumberify(0))
  })

  it("Synthetic_MultipleDecreaseOrder", async () => {
    const timelock = await deployTimelock()
    await vault.setGov(timelock.address)
    await timelock.setContractHandler(positionManager.address, true)
    await timelock.setShouldToggleIsLeverageEnabled(true)
    await positionManager.setInLegacyMode(true)
    await router.addPlugin(positionManager.address)
    await router.connect(user0).approvePlugin(positionManager.address)

    await dai.mint(user0.address, expandDecimals(20000, 18))
    await dai.connect(user0).approve(router.address, expandDecimals(20000, 18))

    const beforeFeeReserves = await vault.feeReserves(dai.address)
    console.log("before feeReserves:", beforeFeeReserves)
    const beforeGuaranteedUsd = await vault.guaranteedUsd(eur.address)
    console.log("before GuaranteedUsd: ", beforeGuaranteedUsd)
    await positionManager.connect(user0).increasePosition([dai.address], eur.address, expandDecimals(100, 18), 0, toUsd(200), true, toNormalizedPrice(2))
    const expectReservedAmounts = await vault.usdToTokenMax(dai.address, toUsd(200));
    expect(await vault.reservedAmounts(dai.address)).eq(expectReservedAmounts)

    const executionFee = expandDecimals(1, 17) // 0.1 WETH
    await orderBook.connect(user0).createDecreaseOrder(
      eur.address,
      toUsd(80),
      dai.address,
      toUsd(30),
      true,
      toUsd(1),
      true,
      {value: executionFee}
    );

    let feedTokens = [dai.address, eur.address];
    let precisions = [26, 22];
    let minPrices = [Math.trunc(1 *10**4), Math.trunc(1.078 *10**8)];
    let maxPrices = [Math.trunc(1 *10**4), Math.trunc(1.079 *10**8)];
    let priceFeedTokens = [];
    let oracleParam = await prepareOracleParam(feedTokens, precisions, minPrices, maxPrices, priceFeedTokens, await getOracleBlock(provider))
    expect(oracleParam).to.not.be.null;

    let orderIndex = (await orderBook.decreaseOrdersIndex(user0.address)) - 1

    const balanceBefore = await provider.getBalance(user1.address)
    await positionManager.setOrderKeeper(user1.address, true)
    await positionManager.connect(user1).executeDecreaseOrder(user0.address, orderIndex, user1.address, oracleParam)
    expect(await vault.reservedAmounts(dai.address)).eq(expandDecimals(120, 18))

    let position = await vault.getPosition(user0.address, dai.address, eur.address, true)
    await orderBook.connect(user0).createDecreaseOrder(
        eur.address,
        position[0],
        dai.address,
        position[1],
        true,
        toUsd(1),
        true,
        {value: executionFee}
      );
    orderIndex = (await orderBook.decreaseOrdersIndex(user0.address)) - 1
    oracleParam = await prepareOracleParam(feedTokens, precisions, minPrices, maxPrices, priceFeedTokens, await getOracleBlock(provider))
    expect(oracleParam).to.not.be.null;
    await positionManager.connect(user1).executeDecreaseOrder(user0.address, orderIndex, user1.address, oracleParam)

    expect((await orderBook.decreaseOrders(user0.address, orderIndex))[0]).to.be.equal(ethers.constants.AddressZero)
    const balanceAfter = await provider.getBalance(user1.address)
    expect(balanceAfter.gt(balanceBefore)).to.be.true
    expect(await vault.reservedAmounts(dai.address)).eq(bigNumberify(0))
  })

  it("Synthetic_checkSettings", async () => {
    expect(await positionManager.maxGlobalLongSizes(dai.address)).eq(expandDecimals(10001, 30))
    expect(await positionManager.maxGlobalLongSizes(eur.address)).eq(expandDecimals(8004, 30))
    expect(await positionManager.maxGlobalShortSizes(dai.address)).eq(expandDecimals(9000, 30))
    expect(await positionManager.maxGlobalShortSizes(eur.address)).eq(expandDecimals(7500, 30))
  })

  it("getSyntheticTotalGuaranteedUsd", async () => {
    const timelock = await deployTimelock()
    await vault.setGov(timelock.address)
    await timelock.setContractHandler(positionManager.address, true)
    await timelock.setShouldToggleIsLeverageEnabled(true)
    await positionManager.setInLegacyMode(true)
    await router.addPlugin(positionManager.address)
    await router.connect(user0).approvePlugin(positionManager.address)

    const maxPrice = await vault.getMaxPrice(dai.address)
    console.log("maxPrice: ", maxPrice)
    const decimals = await vault.tokenDecimals(dai.address);
    console.log("decimals: ", decimals)

    await dai.mint(user0.address, expandDecimals(20000, 18))
    await dai.connect(user0).approve(router.address, expandDecimals(20000, 18))

    const beforeGuaranteedUsdEur = await vault.guaranteedUsd(eur.address)
    console.log("before GuaranteedUsdEur: ", beforeGuaranteedUsdEur)
    const beforeGuaranteedUsdJpy = await vault.guaranteedUsd(jpy.address)
    console.log("before GuaranteedUsdJpy: ", beforeGuaranteedUsdJpy)
    const beforeFeeReserves = await vault.feeReserves(dai.address)
    console.log("before feeReserves:", beforeFeeReserves)

    await positionManager.connect(user0).increasePosition([dai.address], eur.address, expandDecimals(100, 18), 0, toUsd(200), true, toNormalizedPrice(2))
    const feeReserves1 = await vault.feeReserves(dai.address)
    const guaranteedUsd1 = await vault.guaranteedUsd(eur.address)

    await positionManager.connect(user0).increasePosition([dai.address], jpy.address, expandDecimals(100, 18), 0, toUsd(400), true, toNormalizedPrice(0.008))
    const feeReserves2 = await vault.feeReserves(dai.address)
    const guaranteedUsd2 = await vault.guaranteedUsd(jpy.address)

    await positionManager.connect(user0).increasePosition([dai.address], eur.address, expandDecimals(100, 18), 0, toUsd(300), true, toNormalizedPrice(2))
    const feeReserves3 = await vault.feeReserves(dai.address)
    const guaranteedUsd3 = await vault.guaranteedUsd(eur.address)

    const afterGuaranteedUsdEur = await vault.guaranteedUsd(eur.address)
    console.log("after GuaranteedUsdEur: ", afterGuaranteedUsdEur)
    const afterGuaranteedUsdJpy = await vault.guaranteedUsd(jpy.address)
    console.log("after GuaranteedUsdJpy: ", afterGuaranteedUsdJpy)

    const feeAmount1 = feeReserves1.sub(beforeFeeReserves)
    const feeAmount2 = feeReserves2.sub(feeReserves1)
    const feeAmount3 = feeReserves3.sub(feeReserves2)

    const feeUsd1 = maxPrice.mul(feeAmount1).div(expandDecimals(1, decimals))
    const feeUsd2 = maxPrice.mul(feeAmount2).div(expandDecimals(1, decimals))
    const feeUsd3 = maxPrice.mul(feeAmount3).div(expandDecimals(1, decimals))
    console.log("feeUsd1: ", feeUsd1)

    const collateralDeltaUsd = await vault.tokenToUsdMin(dai.address, expandDecimals(100, 18));

    const guaranteedUsdEur1 = guaranteedUsd1.sub(beforeGuaranteedUsdEur)
    const guaranteedUsdEur3 = guaranteedUsd3.sub(guaranteedUsd1)
    const eurTotalGuaranteedUsd = guaranteedUsdEur1.add(guaranteedUsdEur3)
    expect(eurTotalGuaranteedUsd).eq(toUsd(500).add(feeUsd1).add(feeUsd3).sub(collateralDeltaUsd).sub(collateralDeltaUsd))

    const guaranteedUsdJpy2 = guaranteedUsd2.sub(beforeGuaranteedUsdJpy)
    expect(guaranteedUsdJpy2).eq(toUsd(400).add(feeUsd2).sub(collateralDeltaUsd))

    const totalGuaranteedUsd = eurTotalGuaranteedUsd.add(guaranteedUsdJpy2)

    const res = await positionManager.connect(user1).getSyntheticTotalGuaranteedUsd()
    expect(res).eq(totalGuaranteedUsd)
})

  it("getSyntheticTotalGlobalShortSizes", async () => {
    const timelock = await deployTimelock()
    await vault.setGov(timelock.address)
    await timelock.setContractHandler(positionManager.address, true)
    await timelock.setShouldToggleIsLeverageEnabled(true)
    await positionManager.setInLegacyMode(true)
    await router.addPlugin(positionManager.address)
    await router.connect(user0).approvePlugin(positionManager.address)

    const maxPrice = await vault.getMaxPrice(dai.address)
    console.log("maxPrice: ", maxPrice)
    const decimals = await vault.tokenDecimals(dai.address);
    console.log("decimals: ", decimals)

    await dai.mint(user0.address, expandDecimals(20000, 18))
    await dai.connect(user0).approve(router.address, expandDecimals(20000, 18))

    const beforeGlobalShortSizesEur = await vault.globalShortSizes(eur.address)
    console.log("before globalShortSizesEur: ", beforeGlobalShortSizesEur)
    const beforeGlobalShortSizesJpy = await vault.globalShortSizes(jpy.address)
    console.log("before globalShortSizesJpy: ", beforeGlobalShortSizesJpy)

    await positionManager.connect(user0).increasePosition([dai.address], eur.address, expandDecimals(100, 18), 0, toUsd(200), false, toNormalizedPrice(1))
    const globalShortSizes1 = await vault.globalShortSizes(eur.address)

    await positionManager.connect(user0).increasePosition([dai.address], jpy.address, expandDecimals(100, 18), 0, toUsd(400), false, toNormalizedPrice(0.006))
    const globalShortSizes2 = await vault.globalShortSizes(jpy.address)

    await positionManager.connect(user0).increasePosition([dai.address], eur.address, expandDecimals(100, 18), 0, toUsd(300), false, toNormalizedPrice(1))
    const globalShortSizes3 = await vault.globalShortSizes(eur.address)

    const totalGlobalShortSize = globalShortSizes1.sub(beforeGlobalShortSizesEur).add(globalShortSizes2.sub(beforeGlobalShortSizesJpy)).add(globalShortSizes3.sub(globalShortSizes1))
    const res = await positionManager.connect(user1).getSyntheticTotalGlobalShortSizes()
    expect(res).eq(totalGlobalShortSize)
  })

  it("validateSyntheticMaxGlobalSizeLong", async () => {
    const timelock = await deployTimelock()
    await vault.setGov(timelock.address)
    await timelock.setContractHandler(positionManager.address, true)
    await timelock.setShouldToggleIsLeverageEnabled(true)
    await positionManager.setInLegacyMode(true)
    await router.addPlugin(positionManager.address)
    await router.connect(user0).approvePlugin(positionManager.address)

    await dai.mint(user0.address, expandDecimals(60000, 18))
    await dai.connect(user0).approve(router.address, expandDecimals(30000, 18))
    await router.connect(user1).swap([dai.address, usdg.address], expandDecimals(100000, 18), expandDecimals(90000, 18), user1.address)

    await positionManager.connect(user0).increasePosition([dai.address], eur.address, expandDecimals(100, 18), 0, toUsd(2000), true, toUsd(2))
    await positionManager.connect(user0).increasePosition([dai.address], eur.address, expandDecimals(100, 18), 0, toUsd(2000), true, toUsd(2))
    await expect(positionManager.connect(user0).increasePosition([dai.address], eur.address, expandDecimals(200, 18), 0, toUsd(8002), true, toUsd(2))).to.be.revertedWith("BasePositionManager: synthetic max global longs exceeded1")

    await expect(positionManager.connect(user0).increasePosition([dai.address], eur.address, expandDecimals(200, 18), 0, toUsd(5002), true, toUsd(2))).to.be.revertedWith("BasePositionManager: synthetic max global longs exceeded2")
  })
  
  it("validateSyntheticMaxGlobalSizeShort", async () => {
    const timelock = await deployTimelock()
    await vault.setGov(timelock.address)
    await timelock.setContractHandler(positionManager.address, true)
    await timelock.setShouldToggleIsLeverageEnabled(true)
    await positionManager.setInLegacyMode(true)
    await router.addPlugin(positionManager.address)
    await router.connect(user0).approvePlugin(positionManager.address)

    await dai.mint(user0.address, expandDecimals(60000, 18))
    await dai.connect(user0).approve(router.address, expandDecimals(30000, 18))
    await router.connect(user1).swap([dai.address, usdg.address], expandDecimals(100000, 18), expandDecimals(90000, 18), user1.address)

    await positionManager.connect(user0).increasePosition([dai.address], eur.address, expandDecimals(100, 18), 0, toUsd(2000), false, toUsd(1))
    await positionManager.connect(user0).increasePosition([dai.address], eur.address, expandDecimals(100, 18), 0, toUsd(2000), false, toUsd(1))
    await expect(positionManager.connect(user0).increasePosition([dai.address], eur.address, expandDecimals(200, 18), 0, toUsd(8002), false, toUsd(1))).to.be.revertedWith("BasePositionManager: synthetic max global shorts exceeded1")

    await expect(positionManager.connect(user0).increasePosition([dai.address], eur.address, expandDecimals(200, 18), 0, toUsd(4002), false, toUsd(1))).to.be.revertedWith("BasePositionManager: synthetic max global shorts exceeded2")
  })

  it("validateSyntheticMaxGlobalSizeUsdcShare", async () => {
    const timelock = await deployTimelock()
    await vault.setGov(timelock.address)
    await timelock.setContractHandler(positionManager.address, true)
    await timelock.setShouldToggleIsLeverageEnabled(true)
    await positionManager.setInLegacyMode(true)
    await router.addPlugin(positionManager.address)
    await router.connect(user0).approvePlugin(positionManager.address)

    await dai.mint(user0.address, expandDecimals(60000, 18))
    await dai.connect(user0).approve(router.address, expandDecimals(30000, 18))

    const daiPoolAmount = await vault.poolAmounts(dai.address)
    console.log("daiPoolAmount: ", daiPoolAmount)

    await positionManager.connect(user0).increasePosition([dai.address], eur.address, expandDecimals(200, 18), 0, toUsd(1803), true, toUsd(2))
    await expect(positionManager.connect(user0).increasePosition([dai.address], eur.address, expandDecimals(200, 18), 0, toUsd(7499), false, toUsd(1))).to.be.revertedWith("BasePositionManager: syntheticUsedUsdcUsd exceeded")
  })
})
