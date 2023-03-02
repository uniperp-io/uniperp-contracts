const { deployContract, contractAt , sendTxn, getFrameSigner } = require("../shared/helpers")
const { expandDecimals, getPriceBits } = require("../../test/shared/utilities")
const { toUsd } = require("../../test/shared/units")
const { errors } = require("../../test/core/Vault/helpers")

const network = (process.env.HARDHAT_NETWORK || 'mainnet')
const tokens = require('./tokens')[network]

const {
  ARBITRUM_TESTNET_URL,
  ARBITRUM_TESTNET_DEPLOY_KEY
} = require("./env.json")

function delay(time) {
    return new Promise(resolve => setTimeout(resolve, time));
}

async function main() {
  let rpcProvider = new ethers.providers.JsonRpcProvider(ARBITRUM_TESTNET_URL)
  const signer = new ethers.Wallet(ARBITRUM_TESTNET_DEPLOY_KEY).connect(rpcProvider)
  //const signer = await getFrameSigner()

  const admin = signer.address
  console.log("\nadmin address: ", admin)
  console.log("\n")

  const btcAddr = { address: "0x40c2228f2Bc74420363bbF27A316cf49D56C4907" }
  const ethAddr = { address: "0xe39Ab88f8A4777030A534146A9Ca3B52bd5D43A3" }

  const vault = await contractAt("Vault", "0x7CBE24E7916ed82160F8a2526EBB6D5Fe84a4233")
  const positionRouter = await contractAt("PositionRouter", "0xa870720AA70292Dc1d8b745D327889EE294BD1eB")
  const fastPriceFeed = await contractAt("FastPriceFeed", "0xEb711E9d505b58cB1f9847e003cb8D794e001c84") 

  //await sendTxn(fastPriceFeed.setVaultPriceFeed(ethers.constants.AddressZero), "fastPriceFeed.setVaultPriceFeed zero")
  var timestamp;
  while (true) {
    try {
        const blockNum = await ethers.provider.getBlockNumber();
        const block = await ethers.provider.getBlock(blockNum);
        timestamp = block.timestamp;
        console.log(blockNum, timestamp)

        const wbtcPrice = (await vault.getMinPrice(btcAddr.address)).toString();
        const wethPrice = (await vault.getMinPrice(ethAddr.address)).toString();
      
        const prices = [
          wbtcPrice.substring(0, wbtcPrice.length-27), 
          wethPrice.substring(0, wethPrice.length-27)
          ];
        console.log(prices)
        console.log("\n")
      
        const increaseIndex = await positionRouter.increasePositionRequestKeysStart();
        const decreaseIndex = await positionRouter.decreasePositionRequestKeysStart();
      
        const priceBits =  getPriceBits(prices);
      
        await sendTxn(fastPriceFeed.setPricesWithBitsAndExecute(priceBits,timestamp,
            increaseIndex +5,
            decreaseIndex +5,
            5,
            5
        ,{ gasLimit: 9000000 }), "fastPriceFeed.setPricesWithBitsAndExecute")
      
        console.log("execute done!!\n")
        await delay(5000);
        //break;
    } catch (err) {
        console.log("error: ", err.message);
        await delay(1000);        
    }
  }

  //const vaultPriceFeed = await contractAt("VaultPriceFeed", "0xAE855BA393430b9c5830a4D63D3D7a318441E6d6")
  //await sendTxn(fastPriceFeed.setVaultPriceFeed(vaultPriceFeed.address), "fastPriceFeed.setVaultPriceFeed true")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
