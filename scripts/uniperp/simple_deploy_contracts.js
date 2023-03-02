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

  //TODO at most 8 tokens. gmx only use those 4 wbtc, weth, link, uni
  const fastPriceTokens = [btc, eth]

  const weth = await contractAt("WETH", nativeToken.address)

  //const chainlinkFlags = { address: "0x3C14e07Edd0dC67442FA96f1Ec6999c57E810a83" }
  const chainlinkFlags = false;

  //const vault = await deployContract("Vault", [])
  //const vault = await contractAt("Vault", "0x7CBE24E7916ed82160F8a2526EBB6D5Fe84a4233")
  //await run(`verify:verify`, {
  //  address: vault.address,
  //  constructorArguments: [],
  //});

  const deployedPriceFeedTimelock = { address: "0x91392C532c11E0370c0198eB6502333F76285ed2" }
  const tokenManager = { address: "0x701f16E0d8E6E8A539B498675cB6bf4B1C828b25" }
  const priceFeedTimelockBuffer = 24 * 60 * 60
  const priceFeedTimelockArgs = [
    admin,
    priceFeedTimelockBuffer,
    tokenManager.address
  ]  
  
  /*
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

  let deployedTimelock = { address: "0x8E66C9da3dE244311E382A4Ea835c36914E5A39a" }
  const glpManager = { address: "0xAdC2d3F3Aa3df72DA1Ee23aAF2Ef130AfACBBB6c" }
  const rewardRouter = { address: "0xc02E55794C1Ce80D6013904b5e07fD3c6E7b3c1f" }

  const timelockBuffer = 24 * 60 * 60
  const maxTokenSupply = expandDecimals("20000000", 18)
  const mintReceiver = tokenManager
  const buffer = 60 // 60 seconds

  const timelockArgs = [
    admin, // admin
    buffer, // buffer
    tokenManager.address, // tokenManager
    mintReceiver.address, // mintReceiver
    glpManager.address, // glpManager
    rewardRouter.address, // rewardRouter
    maxTokenSupply, // maxTokenSupply
    10, // marginFeeBasisPoints 0.1%
    500 // maxMarginFeeBasisPoints 5%
  ]

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
  deployedTimelock = await contractAt("Timelock", deployedTimelock.address)
  await sendTxn(deployedTimelock.setBuffer(86400), "deployedTimelock.setBuffer")
  */

  const multicall3 = await deployContract("Multicall3", [])
  try {
    await run(`verify:verify`, {
      address: multicall3.address,
      constructorArguments: [],
    });
  } catch (err) {
    if (err.message.includes("Reason: Already Verified")) {
      console.log("Contract is already verified!");
    }
  }

  //process.exit()
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
