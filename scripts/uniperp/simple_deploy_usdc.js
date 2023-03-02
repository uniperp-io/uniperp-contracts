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

  //const usdc = await deployContract("USDC", [])
  const usdcAddr = { address: "0x5BB509Ea9C86d0Ff42ecF5E5DA88671197a1BaC0" }
  const usdc = await contractAt("USDC", usdcAddr.address)
  try {
    await run(`verify:verify`, {
      address: usdc.address,
      constructorArguments: [],
    });
  } catch (err) {
    if (err.message.includes("Reason: Already Verified")) {
      console.log("Contract is already verified!");
    }
  }

  await sendTxn(usdc.mint("0xd025C8DD06a87555063C9FbF1D8581Dd0F38b25E", 1000000000000), "usdc.mint")
  await sendTxn(usdc.mint("0xA7DE6233c4A4F8084478cC307F5ced4Bbea21AF2", 1000000000000), "usdc.mint")
  await sendTxn(usdc.mint("0xC842DD3ea22f6b4FBC7f3bcce37495a76a0ed570", 100000000000), "usdc.mint")

  //const wbtc = await deployContract("WBTC", [])
  //try {
  //  await run(`verify:verify`, {
  //    address: wbtc.address,
  //    constructorArguments: [],
  //  });
  //} catch (err) {
  //  if (err.message.includes("Reason: Already Verified")) {
  //    console.log("Contract is already verified!");
  //  }
  //}

  //await sendTxn(wbtc.mint("0xd025C8DD06a87555063C9FbF1D8581Dd0F38b25E", 1000000000000), "wbtc.mint")
  //await sendTxn(wbtc.mint("0xA7DE6233c4A4F8084478cC307F5ced4Bbea21AF2", 1000000000000), "wbtc.mint")
  //await sendTxn(wbtc.mint("0xC842DD3ea22f6b4FBC7f3bcce37495a76a0ed570", 1000000000000), "wbtc.mint")
  //process.exit()
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
