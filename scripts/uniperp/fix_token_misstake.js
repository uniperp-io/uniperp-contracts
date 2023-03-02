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

  const vaultPriceFeed = await contractAt("VaultPriceFeed", "0xAE855BA393430b9c5830a4D63D3D7a318441E6d6")

  //add whitelist tokens
  for (const [i, tokenItem] of tokenArr.entries()) {
    if (tokenItem.spreadBasisPoints === undefined) { continue }
    await sendTxn(vaultPriceFeed.setSpreadBasisPoints(
      tokenItem.address, // _token
      tokenItem.spreadBasisPoints // _spreadBasisPoints
    ), `vaultPriceFeed.setSpreadBasisPoints(${tokenItem.name}) ${tokenItem.spreadBasisPoints}`)
  }

  for (const token of tokenArr) {
    await sendTxn(vaultPriceFeed.setTokenConfig(
      token.address, // _token
      token.priceFeed, // _priceFeed
      token.priceDecimals, // _priceDecimals
      token.isStrictStable // _isStrictStable
    ), `vaultPriceFeed.setTokenConfig(${token.name}) ${token.address} ${token.priceFeed}`)

    await sendTxn(vault.setTokenConfig(
      token.address, // _token
      token.decimals, // _tokenDecimals
      token.tokenWeight, // _tokenWeight
      token.minProfitBps, // _minProfitBps
      expandDecimals(token.maxUsdgAmount, 18), // _maxUsdgAmount
      token.isStable, // _isStable
      token.isShortable // _isShortable
    ), `vault.setTokenConfig(${token.name}) ${token.address}`)
  }

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

  const positionRouter = await contractAt("PositionRouter", "0xa870720AA70292Dc1d8b745D327889EE294BD1eB")
  const positionManager = await contractAt("PositionManager", "0x0644e8b061C0C1A148c921425d1Af8A0B5F1EF09")

  const notStableTokenAddrArr = notStableTokenArr.map((token) => {return token.address})
  await sendTxn(positionRouter.setMaxGlobalSizes(notStableTokenAddrArr, longSizes, shortSizes), "positionRouter.setMaxGlobalSizes")
  await sendTxn(positionManager.setMaxGlobalSizes(notStableTokenAddrArr, longSizes, shortSizes), "positionManager.setMaxGlobalSizes")

  const secondaryPriceFeed = await contractAt("FastPriceFeed", "0xEb711E9d505b58cB1f9847e003cb8D794e001c84") 
  await sendTxn(secondaryPriceFeed.setTokens(fastPriceTokens.map(t => t.address), fastPriceTokens.map(t => t.fastPricePrecision)), "secondaryPriceFeed.setTokens")
  await sendTxn(secondaryPriceFeed.setMaxCumulativeDeltaDiffs(fastPriceTokens.map(t => t.address), fastPriceTokens.map(t => t.maxCumulativeDeltaDiff)), "secondaryPriceFeed.setMaxCumulativeDeltaDiffs")
  
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
