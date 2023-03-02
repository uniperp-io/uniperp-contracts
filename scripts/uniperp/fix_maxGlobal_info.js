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

function sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
}

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

  //TODO at most 8 tokens. gmx only use those 4 wbtc, weth, link, uni
  const fastPriceTokens = [btc, eth]

  const weth = await contractAt("WETH", nativeToken.address)

  //const chainlinkFlags = { address: "0x3C14e07Edd0dC67442FA96f1Ec6999c57E810a83" }
  const chainlinkFlags = false;

  const shortsTrackerTimelock = await contractAt("ShortsTrackerTimelock", "0x4b8317Cff73B0866D81dD6912D60F7D336DAc299")
  const shortsTracker = await contractAt("ShortsTracker", "0x8f8beD519A4B2b9De49E1B0E1BE136215d013210")

  //await sendTxn(shortsTracker.setIsGlobalShortDataReady(false), "shortsTracker.setIsGlobalShortDataReady")
  //await sendTxn(shortsTracker.setInitData([eth.address, btc.address], [toUsd(1592), toUsd(22860)]), "shortsTracker.setInitData")

  const notStableTokenArr = [btc, eth]
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
  const positionRouter = await contractAt("PositionRouter", "0xa870720AA70292Dc1d8b745D327889EE294BD1eB")
  const positionManager = await contractAt("PositionManager", "0x0644e8b061C0C1A148c921425d1Af8A0B5F1EF09")

  //await sendTxn(positionRouter.setMaxGlobalSizes(notStableTokenAddrArr, longSizes, shortSizes), "positionRouter.setMaxGlobalSizes")
  //await sendTxn(positionManager.setMaxGlobalSizes(notStableTokenAddrArr, longSizes, shortSizes), "positionManager.setMaxGlobalSizes")

  await sendTxn(positionRouter.setPositionKeeper(admin, true), "positionRouter.setPositionKeeper(positionKeeper)")

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
