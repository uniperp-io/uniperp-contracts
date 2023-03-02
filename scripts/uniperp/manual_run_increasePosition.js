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

  //const timelock = { address: "0x8E66C9da3dE244311E382A4Ea835c36914E5A39a" }
  //const vault = await contractAt("Vault", "0x7CBE24E7916ed82160F8a2526EBB6D5Fe84a4233")
  //await sendTxn(vault.setGov(timelock.address), "vault.setGov")

  const positionRouter = await contractAt("PositionRouter", "0xa870720AA70292Dc1d8b745D327889EE294BD1eB")
  const positionManager = await contractAt("PositionManager", "0x0644e8b061C0C1A148c921425d1Af8A0B5F1EF09")

  //await sendTxn(positionManager.setOrderKeeper(admin, true), "positionManager.setOrderKeeper")
  //await sendTxn(positionManager.setLiquidator(admin, true), "positionManager.setLiquidator")
  //await sendTxn(positionManager.setPartner(admin, true), "positionManager.setPartner")
  //await sendTxn(positionManager.setInLegacyMode(true), "positionManager.setInLegacyMode")

  //const router = await contractAt("Router", "0x48905F1320ADB54c40861e5f561deA30dC3E6eBB")
  //await router.approvePlugin(positionManager.address)

  await sendTxn(positionManager.increasePosition([btc.address], btc.address, expandDecimals(1, 7), 0, toUsd(2600), true, toUsd(100000),{ gasLimit: 9000000 }), "positionManager.increasePosition")

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
