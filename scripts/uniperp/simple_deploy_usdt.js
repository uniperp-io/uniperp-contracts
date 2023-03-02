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

  //const usdt = await deployContract("USDT", [])
  const usdtAddr = { address: "0x0d3D8a77A67dCacc41939700eabbf361656Be916" }
  const usdt = await contractAt("USDT", usdtAddr.address)
  try {
    await run(`verify:verify`, {
      address: usdt.address,
      constructorArguments: [],
    });
  } catch (err) {
    if (err.message.includes("Reason: Already Verified")) {
      console.log("Contract is already verified!");
    }
  }

  await sendTxn(usdt.mint("0xd025C8DD06a87555063C9FbF1D8581Dd0F38b25E", 1000000000000), "usdt.mint")
  await sendTxn(usdt.mint("0xA7DE6233c4A4F8084478cC307F5ced4Bbea21AF2", 1000000000000), "usdt.mint")
  await sendTxn(usdt.mint("0xC842DD3ea22f6b4FBC7f3bcce37495a76a0ed570", 1000000000000), "usdt.mint")

  //process.exit()
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
