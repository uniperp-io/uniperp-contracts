const { deployContract, contractAt , sendTxn, getFrameSigner } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")
const { toUsd } = require("../../test/shared/units")
const { errors } = require("../../test/core/Vault/helpers")

const network = (process.env.HARDHAT_NETWORK || 'mainnet')
const tokens = require('./tokens')[network]

const {
  ARBITRUM_TESTNET_URL,
  ARBITRUM_TESTNET_DEPLOY_KEY
} = require("./env.json")

async function main() {
  let rpcProvider = new ethers.providers.JsonRpcProvider(ARBITRUM_TESTNET_URL)
  const signer = new ethers.Wallet(ARBITRUM_TESTNET_DEPLOY_KEY).connect(rpcProvider)
  //const signer = await getFrameSigner()

  const admin = signer.address
  console.log("\nadmin address: ", admin)
  console.log("\n")

  const signers = [
      admin,
      "0xA7DE6233c4A4F8084478cC307F5ced4Bbea21AF2", // account2
      "0xC842DD3ea22f6b4FBC7f3bcce37495a76a0ed570", // account3
      "0xaFd91EBe3ceDbf2764cc2f5430e9F9E795283C94", // account4
      "0x57E06356Fd7FD5f1a58B920d8843D778cAD992C9" // account5
    ]

  const positionKeeper = { address: "0xA7DE6233c4A4F8084478cC307F5ced4Bbea21AF2" }
  const priceFeedKeeper = { address: "0xA7DE6233c4A4F8084478cC307F5ced4Bbea21AF2" }

  //TODO
  const updater1 = { address: admin }
  const updater2 = { address: "0xA7DE6233c4A4F8084478cC307F5ced4Bbea21AF2" }
  const keeper1 = { address: "0xC842DD3ea22f6b4FBC7f3bcce37495a76a0ed570" }
  const keeper2 = { address: "0xaFd91EBe3ceDbf2764cc2f5430e9F9E795283C94" }
  const fastPriceFeedUpdaters = [updater1.address, updater2.address, keeper1.address, keeper2.address]

  //for PriceFeedTimelock
  const PriceFeedTimelockContractHandlers = [admin, ]
  const priceFeedTimelockKeepers = [admin, ]

  //Shorts Tracker Keeper
  const shortsTrackerTimelockHandlers = [admin, ]

  //for Timelock
  const timelockHandlers = [admin, ]
  const timelockKeepers = [admin, ]

  const TokenManagerMinAuthorizations = 4
  const fastPriceFeedMinAuthorizations = 1

  const { nativeToken } = tokens
  const { btc, eth, usdc, usdt} = tokens

  //whitelist tokens
  //TODO others??
  const tokenArr = [btc, eth, usdc, usdt]
  const notStableTokenArr = [btc, eth]

  //TODO at most 8 tokens. gmx only use those 4 wbtc, weth, link, uni
  const fastPriceTokens = [btc, eth]

  const weth = await contractAt("WETH", nativeToken.address)

  //const chainlinkFlags = { address: "0x3C14e07Edd0dC67442FA96f1Ec6999c57E810a83" }
  const chainlinkFlags = false;

  //const vault = await deployContract("Vault", [])
  const vault = await contractAt("Vault", "0x7CBE24E7916ed82160F8a2526EBB6D5Fe84a4233")
  //const usdg = await deployContract("USDG", [vault.address])
  const usdg = await contractAt("USDG", "0x1CC516C9c7ea2621e5Cc2899089eD77ACe587382")
  //await run(`verify:verify`, {
  //  address: usdg.address,
  //  constructorArguments: [vault.address],
  //});

  //const router = await deployContract("Router", [vault.address, usdg.address, nativeToken.address])
  const router = await contractAt("Router", "0x48905F1320ADB54c40861e5f561deA30dC3E6eBB")
  //await run(`verify:verify`, {
  //  address: router.address,
  //  constructorArguments: [vault.address, usdg.address, nativeToken.address],
  //});

  //route用的gov 也是下面这个地址
  const buffer = 60 // 60 seconds
  const updateDelay = 300 // 300 seconds, 5 minutes
  const maxAveragePriceChange = 20 // 0.2%
  //let shortsTrackerTimelock = await deployContract("ShortsTrackerTimelock", [admin, buffer, updateDelay, maxAveragePriceChange])
  //shortsTrackerTimelock = await contractAt("ShortsTrackerTimelock", shortsTrackerTimelock.address, signer)
  const shortsTrackerTimelock = await contractAt("ShortsTrackerTimelock", "0x4b8317Cff73B0866D81dD6912D60F7D336DAc299")
  //await run(`verify:verify`, {
  //  address: shortsTrackerTimelock.address,
  //  constructorArguments: [admin, buffer, updateDelay, maxAveragePriceChange],
  //});

  //console.log("Setting handlers for shortsTrackerTimelock")
  //for (const handler of shortsTrackerTimelockHandlers) {
  //  await sendTxn(shortsTrackerTimelock.setHandler(handler, true), `shortsTrackerTimelock.setHandler ${handler}`)
  //}

  //const gasLimit = 300000000000000
  //const shortsTracker = await deployContract("ShortsTracker", [vault.address], "ShortsTracker")
  const shortsTracker = await contractAt("ShortsTracker", "0x8f8beD519A4B2b9De49E1B0E1BE136215d013210")
  //await run(`verify:verify`, {
  //  address: shortsTracker.address,
  //  constructorArguments: [vault.address],
  //});

  console.log("\nDeploying new position router")
  let depositFee = "30" // 0.3%
  const minExecutionFee = "100000000000000" // 0.0001 ETH
  const positionRouterArgs = [vault.address, router.address, weth.address, shortsTracker.address, depositFee, minExecutionFee]
  //const positionRouter = await deployContract("PositionRouter", positionRouterArgs)
  const positionRouter = await contractAt("PositionRouter", "0xa870720AA70292Dc1d8b745D327889EE294BD1eB")
  //await run(`verify:verify`, {
  //  address: positionRouter.address,
  //  constructorArguments: positionRouterArgs,
  //});

  //console.log("\nsendTxn(shortsTracker.setHandler(positionRouter")
  ////after first deploy, only gov can setHandler!!!  
  //await sendTxn(shortsTracker.setHandler(positionRouter.address, true), "shortsTracker.setHandler(positionRouter)")

  //warn: can only run once!!
  await sendTxn(shortsTracker.setInitData([eth.address, btc.address], [toUsd(1600), toUsd(23077)]), "shortsTracker.setInitData")

  //await sendTxn(router.addPlugin(positionRouter.address), "router.addPlugin")

  //const orderBook = await deployContract("OrderBook", []);
  const orderBook = await contractAt("OrderBook", "0xD494655540069584053726df8f51f5157cc4cD0B")
  //await run(`verify:verify`, {
  //  address: orderBook.address,
  //  constructorArguments: [],
  //});

  // Arbitrum mainnet addresses
  //await sendTxn(orderBook.initialize(
  //  router.address, // router
  //  vault.address, // vault
  //  weth.address, // weth
  //  usdg.address, // usdg
  //  "300000000000000", // 0.0003 ETH
  //  expandDecimals(10, 30) // min purchase token amount usd
  //), "orderBook.initialize");
  await sendTxn(router.addPlugin(orderBook.address), "router.addPlugin(orderBook)")

  console.log("Deploying new position manager")
  const positionManagerArgs = [vault.address, router.address, shortsTracker.address, weth.address, depositFee, orderBook.address]
  //const positionManager = await deployContract("PositionManager", positionManagerArgs)
  const positionManager = await contractAt("PositionManager", "0x0644e8b061C0C1A148c921425d1Af8A0B5F1EF09")
  //try {
  //  await run(`verify:verify`, {
  //    address: positionManager.address,
  //    constructorArguments: positionManagerArgs,
  //  });
  //} catch (err) {
  //  if (err.message.includes("Reason: Already Verified")) {
  //    console.log("Contract is already verified!");
  //  }
  //}
  
  //await sendTxn(shortsTracker.setHandler(positionManager.address, true), "shortsTracker.setContractHandler(positionManager.address, true)")
  //await sendTxn(router.addPlugin(positionManager.address), "router.addPlugin(positionManager)")

  //await sendTxn(vault.setInPrivateLiquidationMode(true), "vault.setInPrivateLiquidationMode")
  //await sendTxn(vault.setLiquidator(positionManager.address, true), "vault.setLiquidator")

  //const fastPriceEvents = await deployContract("FastPriceEvents", [])
  const fastPriceEvents = await contractAt("FastPriceEvents", "0x29c80d5caCD6780551c5B401c5aaaEC342517816")

  //try {
  //  await run(`verify:verify`, {
  //    address: fastPriceEvents.address,
  //    constructorArguments: [],
  //  });
  //} catch (err) {
  //  if (err.message.includes("Reason: Already Verified")) {
  //    console.log("Contract is already verified!");
  //  }
  //}
  
  //const tokenManager = await deployContract("TokenManager", [TokenManagerMinAuthorizations, ], "TokenManager")
  const tokenManager = await contractAt("TokenManager", "0x701f16E0d8E6E8A539B498675cB6bf4B1C828b25")

  //try {
  //  await run(`verify:verify`, {
  //    address: tokenManager.address,
  //    constructorArguments: [TokenManagerMinAuthorizations, ],
  //  });
  //} catch (err) {
  //  if (err.message.includes("Reason: Already Verified")) {
  //    console.log("Contract is already verified!");
  //  }
  //}

  //const vaultPriceFeed = await deployContract("VaultPriceFeed", [])
  const vaultPriceFeed = await contractAt("VaultPriceFeed", "0xAE855BA393430b9c5830a4D63D3D7a318441E6d6")

  //try {
  //  await run(`verify:verify`, {
  //    address: vaultPriceFeed.address,
  //    constructorArguments: [],
  //  });
  //} catch (err) {
  //  if (err.message.includes("Reason: Already Verified")) {
  //    console.log("Contract is already verified!");
  //  }
  //}
  
  ////TODO
  //await sendTxn(vaultPriceFeed.setSpreadThresholdBasisPoints(30), "vaultPriceFeed.setSpreadThresholdBasisPoints")
  //await sendTxn(vaultPriceFeed.setMaxStrictPriceDeviation(expandDecimals(1, 28)), "vaultPriceFeed.setMaxStrictPriceDeviation") // 0.05 USD
  //await sendTxn(vaultPriceFeed.setPriceSampleSpace(1), "vaultPriceFeed.setPriceSampleSpace")
  //await sendTxn(vaultPriceFeed.setIsAmmEnabled(false), "vaultPriceFeed.setIsAmmEnabled")

  //if (chainlinkFlags) {
  //  await sendTxn(vaultPriceFeed.setChainlinkFlags(chainlinkFlags.address), "vaultPriceFeed.setChainlinkFlags")
  //}

  const fastPriceFeedArgs = [
    5 * 60, // _priceDuration
    60 * 60, // _maxPriceUpdateDelay
    0, // _minBlockInterval
    1000 , // _maxDeviationBasisPoints
    fastPriceEvents.address, // _fastPriceEvents
    signer.address, // _tokenManager  //TODO  at least use one account having private key!
    positionRouter.address
  ]
  //const secondaryPriceFeed = await deployContract("FastPriceFeed", fastPriceFeedArgs)
  const secondaryPriceFeed = await contractAt("FastPriceFeed", "0xEb711E9d505b58cB1f9847e003cb8D794e001c84") 
  //await sendTxn(vaultPriceFeed.setSecondaryPriceFeed(secondaryPriceFeed.address), "vaultPriceFeed.setSecondaryPriceFeed")

  ////await sendTxn(secondaryPriceFeed.initialize(fastPriceFeedMinAuthorizations, signers, fastPriceFeedUpdaters), "secondaryPriceFeed.initialize")
  //await sendTxn(secondaryPriceFeed.setTokens(fastPriceTokens.map(t => t.address), fastPriceTokens.map(t => t.fastPricePrecision)), "secondaryPriceFeed.setTokens")
  //await sendTxn(secondaryPriceFeed.setVaultPriceFeed(vaultPriceFeed.address), "secondaryPriceFeed.setVaultPriceFeed")
  //await sendTxn(secondaryPriceFeed.setMaxTimeDeviation(60 * 60), "secondaryPriceFeed.setMaxTimeDeviation")
  //await sendTxn(secondaryPriceFeed.setSpreadBasisPointsIfInactive(20), "secondaryPriceFeed.setSpreadBasisPointsIfInactive")
  //await sendTxn(secondaryPriceFeed.setSpreadBasisPointsIfChainError(500), "secondaryPriceFeed.setSpreadBasisPointsIfChainError")
  //await sendTxn(secondaryPriceFeed.setMaxCumulativeDeltaDiffs(fastPriceTokens.map(t => t.address), fastPriceTokens.map(t => t.maxCumulativeDeltaDiff)), "secondaryPriceFeed.setMaxCumulativeDeltaDiffs")
  //await sendTxn(secondaryPriceFeed.setPriceDataInterval(1 * 60), "secondaryPriceFeed.setPriceDataInterval")
  //await sendTxn(secondaryPriceFeed.setSigner(signer.address, true), "secondaryPriceFeed.setSigner")
  //await sendTxn(secondaryPriceFeed.setUpdater(signer.address, true), "secondaryPriceFeed.setUpdater")
  //await sendTxn(secondaryPriceFeed.setUpdater(priceFeedKeeper.address, true), "secondaryPriceFeed.setUpdater")

  //await sendTxn(vault.initialize(
  //  router.address, // router
  //  usdg.address, // usdg
  //  vaultPriceFeed.address, // priceFeed
  //  toUsd(2), // liquidationFeeUsd
  //  100, // fundingRateFactor
  //  100 // stableFundingRateFactor
  //), "vault.initialize")

  //await sendTxn(vault.setFundingRate(60 * 60, 100, 100), "vault.setFundingRate")
  //await sendTxn(usdg.addVault(vault.address), "usdg.addVault(vault)")

  //const glp = await deployContract("GLP", [])
  const glp = await contractAt("GLP", "0x3fD5e857Df9c2bF72510dF5Bceb36069A9664886")
  //await sendTxn(glp.setInPrivateTransferMode(false), "glp.setInPrivateTransferMode")


  const glpManagerArgs = [vault.address, usdg.address, glp.address, shortsTracker.address, 15 * 60]
  //const glpManager = await deployContract("GlpManager", glpManagerArgs)
  const glpManager = await contractAt("GlpManager", "0xAdC2d3F3Aa3df72DA1Ee23aAF2Ef130AfACBBB6c")

  //await sendTxn(glpManager.setInPrivateMode(true), "glpManager.setInPrivateMode")
  //await sendTxn(glpManager.setShortsTrackerAveragePriceWeight(10000), "glpManager.setShortsTrackerAveragePriceWeight")

  //await sendTxn(glp.setMinter(glpManager.address, true), "glp.setMinter")
  //await sendTxn(usdg.addVault(glpManager.address), "usdg.addVault(glpManager)")

  //await sendTxn(vault.setInManagerMode(true), "vault.setInManagerMode")
  //await sendTxn(vault.setManager(glpManager.address, true), "vault.setManager")

  //await sendTxn(vault.setFees(
  //  10, // _taxBasisPoints
  //  5, // _stableTaxBasisPoints
  //  20, // _mintBurnFeeBasisPoints
  //  20, // _swapFeeBasisPoints
  //  1, // _stableSwapFeeBasisPoints
  //  10, // _marginFeeBasisPoints
  //  toUsd(2), // _liquidationFeeUsd
  //  24 * 60 * 60, // _minProfitTime
  //  true // _hasDynamicFees
  //), "vault.setFees")

  //const vaultErrorController = await deployContract("VaultErrorController", [])
  const vaultErrorController = await contractAt("VaultErrorController", "0x1b0F84cA169C05BDFCc505668Bac4565fDb5bdC5")

  //await sendTxn(vault.setErrorController(vaultErrorController.address), "vault.setErrorController")
  //await sendTxn(vaultErrorController.setErrors(vault.address, errors), "vaultErrorController.setErrors")

  //const vaultUtils = await deployContract("VaultUtils", [vault.address])
  const vaultUtils = await contractAt("VaultUtils", "0x77827d46Fc9c59719C8c77c580E32E8abc68e244")

  //await sendTxn(vault.setVaultUtils(vaultUtils.address), "vault.setVaultUtils")
  //await sendTxn(vault.setIsSwapEnabled(true), "vault.setIsSwapEnabled")

  ////add whitelist tokens
  //for (const [i, tokenItem] of tokenArr.entries()) {
  //  if (tokenItem.spreadBasisPoints === undefined) { continue }
  //  await sendTxn(vaultPriceFeed.setSpreadBasisPoints(
  //    tokenItem.address, // _token
  //    tokenItem.spreadBasisPoints // _spreadBasisPoints
  //  ), `vaultPriceFeed.setSpreadBasisPoints(${tokenItem.name}) ${tokenItem.spreadBasisPoints}`)
  //}

  //for (const token of tokenArr) {
  //  await sendTxn(vaultPriceFeed.setTokenConfig(
  //    token.address, // _token
  //    token.priceFeed, // _priceFeed
  //    token.priceDecimals, // _priceDecimals
  //    token.isStrictStable // _isStrictStable
  //  ), `vaultPriceFeed.setTokenConfig(${token.name}) ${token.address} ${token.priceFeed}`)

  //  await sendTxn(vault.setTokenConfig(
  //    token.address, // _token
  //    token.decimals, // _tokenDecimals
  //    token.tokenWeight, // _tokenWeight
  //    token.minProfitBps, // _minProfitBps
  //    expandDecimals(token.maxUsdgAmount, 18), // _maxUsdgAmount
  //    token.isStable, // _isStable
  //    token.isShortable // _isShortable
  //  ), `vault.setTokenConfig(${token.name}) ${token.address}`)
  //}
  
  //const gmx = await deployContract("GMX", [])
  const gmx = await contractAt("GMX", "0x6DF70A54155784DAA4F76fA7EB6ff2876E22c575")
  await sendTxn(gmx.setMinter(admin, true), "gmx.setMinter")

  //const esGmx = await deployContract("EsGMX", [])
  const esGmx = await contractAt("EsGMX", "0x476d4529943E7Ce05766BE456C48D3e511889b46")

  //const bnGmx = await deployContract("MintableBaseToken", ["Bonus GMX", "bnGMX", 0])
  const bnGmx = await contractAt("MintableBaseToken", "0xD524a202A03462c4036cDbF352fC13727047bfC0")

  ////TODO
  //await sendTxn(gmx.setInPrivateTransferMode(false), "gmx.setInPrivateTransferMode")
  //await sendTxn(esGmx.setInPrivateTransferMode(true), "esGmx.setInPrivateTransferMode")
  //await sendTxn(bnGmx.setInPrivateTransferMode(false), "bnGmx.setInPrivateTransferMode")

  //const stakedGmxTracker = await deployContract("RewardTracker", ["Staked GMX", "sGMX"])
  const stakedGmxTracker = await contractAt("RewardTracker", "0xB67Ff86e0f4Ebfd6250880Cfb1bD6dCe021dA4bB")

  //const stakedGmxDistributor = await deployContract("RewardDistributor", [esGmx.address, stakedGmxTracker.address])
  const stakedGmxDistributor = await contractAt("RewardDistributor", "0x1D8710B42C1231dd948785ECD43f1E528247B263")

  //await sendTxn(stakedGmxTracker.initialize([gmx.address, esGmx.address], stakedGmxDistributor.address), "stakedGmxTracker.initialize")
  //await sendTxn(stakedGmxDistributor.updateLastDistributionTime(), "stakedGmxDistributor.updateLastDistributionTime")

  //const bonusGmxTracker = await deployContract("RewardTracker", ["Staked + Bonus GMX", "sbGMX"])
  const bonusGmxTracker = await contractAt("RewardTracker", "0x67959f82f48398E69dcC12D8128539d2Bd2aa8Da")

  //const bonusGmxDistributor = await deployContract("BonusDistributor", [bnGmx.address, bonusGmxTracker.address])
  const bonusGmxDistributor = await contractAt("BonusDistributor", "0xa51675249Bc2bbAA06B624f66568c89E6d5f615C")

  //await sendTxn(bonusGmxTracker.initialize([stakedGmxTracker.address], bonusGmxDistributor.address), "bonusGmxTracker.initialize")
  //await sendTxn(bonusGmxDistributor.updateLastDistributionTime(), "bonusGmxDistributor.updateLastDistributionTime")

  //const feeGmxTracker = await deployContract("RewardTracker", ["Staked + Bonus + Fee GMX", "sbfGMX"])
  const feeGmxTracker = await contractAt("RewardTracker", "0x35796D26614a3D5fbBc0682e8904e58c19A5fBF2")

  //const feeGmxDistributor = await deployContract("RewardDistributor", [nativeToken.address, feeGmxTracker.address])
  const feeGmxDistributor = await contractAt("RewardDistributor", "0x770B1D99494E9B43D400499f59B92961D5C06063")

  //await sendTxn(feeGmxTracker.initialize([bonusGmxTracker.address, bnGmx.address], feeGmxDistributor.address), "feeGmxTracker.initialize")
  //await sendTxn(feeGmxDistributor.updateLastDistributionTime(), "feeGmxDistributor.updateLastDistributionTime")

  //const feeGlpTracker = await deployContract("RewardTracker", ["Fee GLP", "fGLP"])
  const feeGlpTracker = await contractAt("RewardTracker", "0xf4B83f0cb41184279B1c11459d7C9ed9bEAc8b58")

  //const feeGlpDistributor = await deployContract("RewardDistributor", [nativeToken.address, feeGlpTracker.address])
  const feeGlpDistributor = await contractAt("RewardDistributor", "0x22411836eA9e3FA0A91299ACc890a6E483B2416c")

  //await sendTxn(feeGlpTracker.initialize([glp.address], feeGlpDistributor.address), "feeGlpTracker.initialize")
  //await sendTxn(feeGlpDistributor.updateLastDistributionTime(), "feeGlpDistributor.updateLastDistributionTime")

  //const stakedGlpTracker = await deployContract("RewardTracker", ["Fee + Staked GLP", "fsGLP"])
  const stakedGlpTracker = await contractAt("RewardTracker", "0xAd2251Ad0cE75C6f27d8cC4a41b3Ca32799Da1eA")

  //const stakedGlpDistributor = await deployContract("RewardDistributor", [esGmx.address, stakedGlpTracker.address])
  const stakedGlpDistributor = await contractAt("RewardDistributor", "0xBEa18Cd01Ddeddc8844CC4290c52Df3E88c13385")

  //await sendTxn(stakedGlpTracker.initialize([feeGlpTracker.address], stakedGlpDistributor.address), "stakedGlpTracker.initialize")
  //await sendTxn(stakedGlpDistributor.updateLastDistributionTime(), "stakedGlpDistributor.updateLastDistributionTime")

  ////TODO
  //await sendTxn(stakedGmxTracker.setInPrivateTransferMode(true), "stakedGmxTracker.setInPrivateTransferMode")
  //await sendTxn(stakedGmxTracker.setInPrivateStakingMode(true), "stakedGmxTracker.setInPrivateStakingMode")
  //await sendTxn(bonusGmxTracker.setInPrivateTransferMode(true), "bonusGmxTracker.setInPrivateTransferMode")
  //await sendTxn(bonusGmxTracker.setInPrivateStakingMode(true), "bonusGmxTracker.setInPrivateStakingMode")
  //await sendTxn(bonusGmxTracker.setInPrivateClaimingMode(true), "bonusGmxTracker.setInPrivateClaimingMode")
  //await sendTxn(feeGmxTracker.setInPrivateTransferMode(true), "feeGmxTracker.setInPrivateTransferMode")
  //await sendTxn(feeGmxTracker.setInPrivateStakingMode(true), "feeGmxTracker.setInPrivateStakingMode")

  //await sendTxn(feeGlpTracker.setInPrivateTransferMode(true), "feeGlpTracker.setInPrivateTransferMode")
  //await sendTxn(feeGlpTracker.setInPrivateStakingMode(true), "feeGlpTracker.setInPrivateStakingMode")
  //await sendTxn(stakedGlpTracker.setInPrivateTransferMode(true), "stakedGlpTracker.setInPrivateTransferMode")
  //await sendTxn(stakedGlpTracker.setInPrivateStakingMode(true), "stakedGlpTracker.setInPrivateStakingMode")

  const vestingDuration = 365 * 24 * 60 * 60
  const gmxVesterArgs = [
    "Vested GMX", // _name
    "vGMX", // _symbol
    vestingDuration, // _vestingDuration
    esGmx.address, // _esToken
    feeGmxTracker.address, // _pairToken
    gmx.address, // _claimableToken
    stakedGmxTracker.address, // _rewardTracker
  ]  
  //const gmxVester = await deployContract("Vester", gmxVesterArgs)
  const gmxVester = await contractAt("Vester", "0xb0c325Ba3433aDC37B4084311E7194AA1c8D6494")

  const glpVesterArgs = [
    "Vested GLP", // _name
    "vGLP", // _symbol
    vestingDuration, // _vestingDuration
    esGmx.address, // _esToken
    stakedGlpTracker.address, // _pairToken
    gmx.address, // _claimableToken
    stakedGlpTracker.address, // _rewardTracker //TODO
  ]
  //const glpVester = await deployContract("Vester", glpVesterArgs)
  const glpVester = await contractAt("Vester", "0xc146d93B1c77e74449F3f4E4B937ff944011AF07")

  //const rewardRouter = await deployContract("RewardRouterV2", [])
  const rewardRouter = await contractAt("RewardRouterV2", "0xc02E55794C1Ce80D6013904b5e07fD3c6E7b3c1f")

  //await sendTxn(rewardRouter.initialize(
  //  nativeToken.address,
  //  gmx.address,
  //  esGmx.address,
  //  bnGmx.address,
  //  glp.address,
  //  stakedGmxTracker.address,
  //  bonusGmxTracker.address,
  //  feeGmxTracker.address,
  //  feeGlpTracker.address,
  //  stakedGlpTracker.address,
  //  glpManager.address,
  //  gmxVester.address,
  //  glpVester.address
  //), "rewardRouter.initialize")

  await sendTxn(glpManager.setHandler(rewardRouter.address, true), "glpManager.setHandler(rewardRouter)")

  //// allow rewardRouter to stake in stakedGmxTracker
  //await sendTxn(stakedGmxTracker.setHandler(rewardRouter.address, true), "stakedGmxTracker.setHandler(rewardRouter)")
  //// allow bonusGmxTracker to stake stakedGmxTracker
  //await sendTxn(stakedGmxTracker.setHandler(bonusGmxTracker.address, true), "stakedGmxTracker.setHandler(bonusGmxTracker)")
  //// allow rewardRouter to stake in bonusGmxTracker
  //await sendTxn(bonusGmxTracker.setHandler(rewardRouter.address, true), "bonusGmxTracker.setHandler(rewardRouter)")
  //// allow bonusGmxTracker to stake feeGmxTracker
  //await sendTxn(bonusGmxTracker.setHandler(feeGmxTracker.address, true), "bonusGmxTracker.setHandler(feeGmxTracker)")
  //await sendTxn(bonusGmxDistributor.setBonusMultiplier(10000), "bonusGmxDistributor.setBonusMultiplier")
  //// allow rewardRouter to stake in feeGmxTracker
  //await sendTxn(feeGmxTracker.setHandler(rewardRouter.address, true), "feeGmxTracker.setHandler(rewardRouter)")
  //// allow stakedGmxTracker to stake esGmx
  //await sendTxn(esGmx.setHandler(stakedGmxTracker.address, true), "esGmx.setHandler(stakedGmxTracker)")
  //// allow feeGmxTracker to stake bnGmx
  //await sendTxn(bnGmx.setHandler(feeGmxTracker.address, true), "bnGmx.setHandler(feeGmxTracker")
  //// allow rewardRouter to burn bnGmx
  //await sendTxn(bnGmx.setMinter(rewardRouter.address, true), "bnGmx.setMinter(rewardRouter")

  //// allow stakedGlpTracker to stake feeGlpTracker
  //await sendTxn(feeGlpTracker.setHandler(stakedGlpTracker.address, true), "feeGlpTracker.setHandler(stakedGlpTracker)")
  //// allow feeGlpTracker to stake glp
  //await sendTxn(glp.setHandler(feeGlpTracker.address, true), "glp.setHandler(feeGlpTracker)")

  //// allow rewardRouter to stake in feeGlpTracker
  await sendTxn(feeGlpTracker.setHandler(rewardRouter.address, true), "feeGlpTracker.setHandler(rewardRouter)")
  //// allow rewardRouter to stake in stakedGlpTracker
  await sendTxn(stakedGlpTracker.setHandler(rewardRouter.address, true), "stakedGlpTracker.setHandler(rewardRouter)")

  //await sendTxn(esGmx.setHandler(rewardRouter.address, true), "esGmx.setHandler(rewardRouter)")
  //await sendTxn(esGmx.setHandler(stakedGmxDistributor.address, true), "esGmx.setHandler(stakedGmxDistributor)")
  //await sendTxn(esGmx.setHandler(stakedGlpDistributor.address, true), "esGmx.setHandler(stakedGlpDistributor)")
  //await sendTxn(esGmx.setHandler(stakedGlpTracker.address, true), "esGmx.setHandler(stakedGlpTracker)")
  //await sendTxn(esGmx.setHandler(gmxVester.address, true), "esGmx.setHandler(gmxVester)")
  //await sendTxn(esGmx.setHandler(glpVester.address, true), "esGmx.setHandler(glpVester)")

  //await sendTxn(esGmx.setMinter(gmxVester.address, true), "esGmx.setMinter(gmxVester)")
  //await sendTxn(esGmx.setMinter(glpVester.address, true), "esGmx.setMinter(glpVester)")

  //await sendTxn(gmxVester.setHandler(rewardRouter.address, true), "gmxVester.setHandler(rewardRouter)")
  //await sendTxn(glpVester.setHandler(rewardRouter.address, true), "glpVester.setHandler(rewardRouter)")

  //await sendTxn(feeGmxTracker.setHandler(gmxVester.address, true), "feeGmxTracker.setHandler(gmxVester)")
  //await sendTxn(stakedGlpTracker.setHandler(glpVester.address, true), "stakedGlpTracker.setHandler(glpVester)")

  //TODO admin
  const priceFeedTimelockBuffer = 24 * 60 * 60
  const priceFeedTimelockArgs = [
    admin,
    priceFeedTimelockBuffer,
    tokenManager.address
  ]
  //const priceFeedTimelock = await deployContract("PriceFeedTimelock", priceFeedTimelockArgs, "Timelock")
  //const deployedPriceFeedTimelock = await contractAt("PriceFeedTimelock", priceFeedTimelock.address, signer)
  const deployedPriceFeedTimelock = await contractAt("PriceFeedTimelock", "0x91392C532c11E0370c0198eB6502333F76285ed2")

  //for (let i = 0; i < PriceFeedTimelockContractHandlers.length; i++) {
  //  const signer = PriceFeedTimelockContractHandlers[i]
  //  await sendTxn(deployedPriceFeedTimelock.setContractHandler(signer, true), `deployedPriceFeedTimelock.setContractHandler(${signer})`)
  //}

  //for (let i = 0; i < priceFeedTimelockKeepers.length; i++) {
  //  const keeper = priceFeedTimelockKeepers[i]
  //  await sendTxn(deployedPriceFeedTimelock.setKeeper(keeper, true), `deployedPriceFeedTimelock.setKeeper(${keeper})`)
  //}

  //await sendTxn(positionRouter.setPositionKeeper(secondaryPriceFeed.address, true), "positionRouter.setPositionKeeper(secondaryPriceFeed)")
  //
  ////actually this is no need, as positionKeeper submit request through FastPriceFeed.
  //await sendTxn(positionRouter.setPositionKeeper(positionKeeper.address, true), "positionRouter.setPositionKeeper(positionKeeper)")

  //await sendTxn(fastPriceEvents.setIsPriceFeed(secondaryPriceFeed.address, true), "fastPriceEvents.setIsPriceFeed")

  //TODO 
  const timelockBuffer = 24 * 60 * 60
  const maxTokenSupply = expandDecimals("20000000", 18)
  const mintReceiver = tokenManager

  const timelockArgs = [
    admin, // admin
    timelockBuffer, // buffer
    tokenManager.address, // tokenManager
    mintReceiver.address, // mintReceiver
    glpManager.address, // glpManager
    rewardRouter.address, // rewardRouter
    maxTokenSupply, // maxTokenSupply
    10, // marginFeeBasisPoints 0.1%
    500 // maxMarginFeeBasisPoints 5%
  ]
  //const timelock = await deployContract("Timelock", timelockArgs, "Timelock")
  //const deployedTimelock = await contractAt("Timelock", timelock.address, signer)
  const deployedTimelock = await contractAt("Timelock", "0x8E66C9da3dE244311E382A4Ea835c36914E5A39a")

  //await sendTxn(deployedTimelock.setShouldToggleIsLeverageEnabled(true), "deployedTimelock.setShouldToggleIsLeverageEnabled(true)")
  //await sendTxn(deployedTimelock.setContractHandler(positionRouter.address, true), "deployedTimelock.setContractHandler(positionRouter)")
  //await sendTxn(deployedTimelock.setContractHandler(positionManager.address, true), "deployedTimelock.setContractHandler(positionManager)")

  ////TODO
  //// // update gov of vault
  //// const vaultGov = await contractAt("Timelock", await vault.gov(), signer)
  //// await sendTxn(vaultGov.signalSetGov(vault.address, deployedTimelock.address), "vaultGov.signalSetGov")
  //// await sendTxn(deployedTimelock.signalSetGov(vault.address, vaultGov.address), "deployedTimelock.signalSetGov(vault)")

  //for (let i = 0; i < timelockHandlers.length; i++) {
  //  const handler = timelockHandlers[i]
  //  await sendTxn(deployedTimelock.setContractHandler(handler, true), `deployedTimelock.setContractHandler(${handler})`)
  //}

  //for (let i = 0; i < timelockKeepers.length; i++) {
  //  const keeper = timelockKeepers[i]
  //  await sendTxn(deployedTimelock.setKeeper(keeper, true), `deployedTimelock.setKeeper(${keeper})`)
  //}

  //await sendTxn(deployedTimelock.signalApprove(gmx.address, admin, "1000000000000000000"), "deployedTimelock.signalApprove")

  const gmxTimelockBuffer = 24 * 60 * 60
  const longBuffer = 7 * 24 * 60 * 60

  const { AddressZero } = ethers.constants
  const rewardManager = { address: AddressZero }
  const gmxTimelockArgs = [
    admin,    //very important!!!!
    gmxTimelockBuffer,
    longBuffer,
    rewardManager.address,
    tokenManager.address,
    mintReceiver.address,
    maxTokenSupply
  ]
  const gmxTimelock = await deployContract("GmxTimelock", gmxTimelockArgs, "GmxTimelock")

  const reader = await deployContract("Reader", [], "Reader")
  await sendTxn(reader.setConfig(true), "Reader.setConfig")

  const rewardReader = await deployContract("RewardReader", [], "RewardReader")
  const vaultReader = await deployContract("VaultReader", [], "VaultReader")
  const orderBookReader = await deployContract("OrderBookReader", [])

  const stakedGlpArgs = [
    glp.address,
    glpManager.address,
    stakedGlpTracker.address,
    feeGlpTracker.address
  ]
  const stakedGlp = await deployContract("StakedGlp", stakedGlpArgs)

  await sendTxn(stakedGlpTracker.setHandler(stakedGlp.address, true), "stakedGlpTracker.setHandler(stakedGlp)")
  await sendTxn(feeGlpTracker.setHandler(stakedGlp.address, true), "feeGlpTracker.setHandler(stakedGlp)")

  const referralReader = await deployContract("ReferralReader", [], "ReferralReader")

  const referralStorage = await deployContract("ReferralStorage", [])
  await sendTxn(positionRouter.setReferralStorage(referralStorage.address), "positionRouter.setReferralStorage")
  await sendTxn(positionManager.setReferralStorage(referralStorage.address), "positionManager.setReferralStorage")
  await sendTxn(referralStorage.setHandler(positionRouter.address, true), "referralStorage.setHandler(positionRouter)")

  await sendTxn(tokenManager.initialize(signers), "tokenManager.initialize")

  const longSizes = notStableTokenArr.map((token) => {
    if (!token.maxGlobalLongSize) {
      return bigNumberify(0)
    }   

    return expandDecimals(token.maxGlobalLongSize, 30) 
  })  

  const shortSizes = notStableTokenArr.map((token) => {
    if (!token.maxGlobalShortSize) {
      return bigNumberify(0)
    }   

    return expandDecimals(token.maxGlobalShortSize, 30) 
  })

  const notStableTokenAddrArr = notStableTokenArr.map((token) => {return token.address})
  await sendTxn(positionRouter.setMaxGlobalSizes(notStableTokenAddrArr, longSizes, shortSizes), "positionRouter.setMaxGlobalSizes")
  await sendTxn(positionManager.setMaxGlobalSizes(notStableTokenAddrArr, longSizes, shortSizes), "positionManager.setMaxGlobalSizes")

  try {
  await run(`verify:verify`, {
    address: secondaryPriceFeed.address,
    constructorArguments: fastPriceFeedArgs,
  });
} catch (err) {
  if (err.message.includes("Reason: Already Verified")) {
    console.log("Contract is already verified!");
  }
}

try {
  await run(`verify:verify`, {
    address: glp.address,
    constructorArguments: [],
  });
} catch (err) {
  if (err.message.includes("Reason: Already Verified")) {
    console.log("Contract is already verified!");
  }
}

  try {
  await run(`verify:verify`, {
    address: glpManager.address,
    constructorArguments: glpManagerArgs,
  });
} catch (err) {
  if (err.message.includes("Reason: Already Verified")) {
    console.log("Contract is already verified!");
  }
}

  try {
  await run(`verify:verify`, {
    address: vaultErrorController.address,
    constructorArguments: [],
  });
} catch (err) {
  if (err.message.includes("Reason: Already Verified")) {
    console.log("Contract is already verified!");
  }
}

  try {
  await run(`verify:verify`, {
    address: vaultUtils.address,
    constructorArguments: [vault.address],
  });
} catch (err) {
  if (err.message.includes("Reason: Already Verified")) {
    console.log("Contract is already verified!");
  }
}

  try {
  await run(`verify:verify`, {
    address: gmx.address,
    constructorArguments: [],
  });
} catch (err) {
  if (err.message.includes("Reason: Already Verified")) {
    console.log("Contract is already verified!");
  }
}

  try {
  await run(`verify:verify`, {
    address: esGmx.address,
    constructorArguments: [],
  });
} catch (err) {
  if (err.message.includes("Reason: Already Verified")) {
    console.log("Contract is already verified!");
  }
}

  try {
  await run(`verify:verify`, {
    address: bnGmx.address,
    constructorArguments: ["Bonus GMX", "bnGMX", 0],
  });
} catch (err) {
  if (err.message.includes("Reason: Already Verified")) {
    console.log("Contract is already verified!");
  }
}

  try {
  await run(`verify:verify`, {
    address: stakedGmxTracker.address,
    constructorArguments: ["Staked GMX", "sGMX"],
  });
} catch (err) {
  if (err.message.includes("Reason: Already Verified")) {
    console.log("Contract is already verified!");
  }
}

  try {
  await run(`verify:verify`, {
    address: stakedGmxDistributor.address,
    constructorArguments: [esGmx.address, stakedGmxTracker.address],
  });
} catch (err) {
  if (err.message.includes("Reason: Already Verified")) {
    console.log("Contract is already verified!");
  }
}

  try {
  await run(`verify:verify`, {
    address: bonusGmxTracker.address,
    constructorArguments: ["Staked + Bonus GMX", "sbGMX"],
  });
} catch (err) {
  if (err.message.includes("Reason: Already Verified")) {
    console.log("Contract is already verified!");
  }
}

  try {
  await run(`verify:verify`, {
    address: bonusGmxDistributor.address,
    constructorArguments: [bnGmx.address, bonusGmxTracker.address],
  });
} catch (err) {
  if (err.message.includes("Reason: Already Verified")) {
    console.log("Contract is already verified!");
  }
}

  try {
  await run(`verify:verify`, {
    address: feeGmxTracker.address,
    constructorArguments: ["Staked + Bonus + Fee GMX", "sbfGMX"],
  });
} catch (err) {
  if (err.message.includes("Reason: Already Verified")) {
    console.log("Contract is already verified!");
  }
}

  try {
  await run(`verify:verify`, {
    address: feeGmxDistributor.address,
    constructorArguments: [nativeToken.address, feeGmxTracker.address],
  });
} catch (err) {
  if (err.message.includes("Reason: Already Verified")) {
    console.log("Contract is already verified!");
  }
}

  try {
  await run(`verify:verify`, {
    address: feeGlpTracker.address,
    constructorArguments: ["Fee GLP", "fGLP"],
  });
} catch (err) {
  if (err.message.includes("Reason: Already Verified")) {
    console.log("Contract is already verified!");
  }
}

  try {
  await run(`verify:verify`, {
    address: feeGlpDistributor.address,
    constructorArguments: [nativeToken.address, feeGlpTracker.address],
  });
} catch (err) {
  if (err.message.includes("Reason: Already Verified")) {
    console.log("Contract is already verified!");
  }
}

  try {
  await run(`verify:verify`, {
    address: stakedGlpTracker.address,
    constructorArguments: ["Fee + Staked GLP", "fsGLP"],
  });
} catch (err) {
  if (err.message.includes("Reason: Already Verified")) {
    console.log("Contract is already verified!");
  }
}

  try {
  await run(`verify:verify`, {
    address: stakedGlpDistributor.address,
    constructorArguments: [esGmx.address, stakedGlpTracker.address],
  });
} catch (err) {
  if (err.message.includes("Reason: Already Verified")) {
    console.log("Contract is already verified!");
  }
}

  try {
  await run(`verify:verify`, {
    address: gmxVester.address,
    constructorArguments: gmxVesterArgs,
  });
} catch (err) {
  if (err.message.includes("Reason: Already Verified")) {
    console.log("Contract is already verified!");
  }
}

  try {
  await run(`verify:verify`, {
    address: glpVester.address,
    constructorArguments: glpVesterArgs,
  });
} catch (err) {
  if (err.message.includes("Reason: Already Verified")) {
    console.log("Contract is already verified!");
  }
}

  try {
  await run(`verify:verify`, {
    address: rewardRouter.address,
    constructorArguments: [],
  });
} catch (err) {
  if (err.message.includes("Reason: Already Verified")) {
    console.log("Contract is already verified!");
  }
}

  try {
  await run(`verify:verify`, {
    address: deployedPriceFeedTimelock.address,
    constructorArguments: priceFeedTimelockArgs,
  });
} catch (err) {
  if (err.message.includes("Reason: Already Verified")) {
    console.log("Contract is already verified!");
  }
}

  try {
  await run(`verify:verify`, {
    address: deployedTimelock.address,
    constructorArguments: timelockArgs,
  });
} catch (err) {
  if (err.message.includes("Reason: Already Verified")) {
    console.log("Contract is already verified!");
  }
}

  try {
  await run(`verify:verify`, {
    address: gmxTimelock.address,
    constructorArguments: gmxTimelockArgs,
  });
} catch (err) {
  if (err.message.includes("Reason: Already Verified")) {
    console.log("Contract is already verified!");
  }
}

  try {
  await run(`verify:verify`, {
    address: reader.address,
    constructorArguments: [],
  });
} catch (err) {
  if (err.message.includes("Reason: Already Verified")) {
    console.log("Contract is already verified!");
  }
}

  try {
  await run(`verify:verify`, {
    address: rewardReader.address,
    constructorArguments: [],
  });
} catch (err) {
  if (err.message.includes("Reason: Already Verified")) {
    console.log("Contract is already verified!");
  }
}

  try {
  await run(`verify:verify`, {
    address: vaultReader.address,
    constructorArguments: [],
  });
} catch (err) {
  if (err.message.includes("Reason: Already Verified")) {
    console.log("Contract is already verified!");
  }
}

  try {
  await run(`verify:verify`, {
    address: orderBookReader.address,
    constructorArguments: [],
  });
} catch (err) {
  if (err.message.includes("Reason: Already Verified")) {
    console.log("Contract is already verified!");
  }
}

  try {
  await run(`verify:verify`, {
    address: stakedGlp.address,
    constructorArguments: stakedGlpArgs,
  });
} catch (err) {
  if (err.message.includes("Reason: Already Verified")) {
    console.log("Contract is already verified!");
  }
}

  try {
  await run(`verify:verify`, {
    address: referralReader.address,
    constructorArguments: [],
  });
} catch (err) {
  if (err.message.includes("Reason: Already Verified")) {
    console.log("Contract is already verified!");
  }
}

  try {
  await run(`verify:verify`, {
    address: referralStorage.address,
    constructorArguments: [],
  });
} catch (err) {
  if (err.message.includes("Reason: Already Verified")) {
    console.log("Contract is already verified!");
  }
}

  console.log("\n\nAll done!\n\n")

  //setGov must exec after shortsTracker.setHandler
  //after first deploy, only gov can set gov!!!
  //await sendTxn(shortsTracker.setGov(shortsTrackerTimelock.address), "shortsTracker.setGov")  

  //TODO move it to update access part
  //await sendTxn(vaultPriceFeed.setGov(deployedPriceFeedTimelock.address), "vaultPriceFeed.setGov")
  //await sendTxn(secondaryPriceFeed.setGov(deployedPriceFeedTimelock.address), "secondaryPriceFeed.setGov")

  //TODO
  //can only run after feeGlpTracker, stakedGlpTracker, glpManager's Gov had been set to timeLock
  //await sendTxn(deployedTimelock.initRewardRouter({ gasLimit: 1000000 }), "deployedTimelock.initRewardRouter")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
