const { deployContract, contractAt , sendTxn, writeTmpAddresses, callWithRetries } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")
const { toUsd } = require("../../test/shared/units")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

async function main() {
  const {
    nativeToken
  } = tokens

  const vault = await contractAt("Vault", "0xDE3590067c811b6F023b557ed45E4f1067859663")
  const usdg = await contractAt("USDG", "0x45096e7aA921f27590f8F19e457794EB09678141")
  const ulp = await contractAt("ULP", "0x4277f8F2c384827B5273592FF7CeBd9f2C1ac258")

  const ulpManager = await deployContract("UlpManager", [vault.address, usdg.address, ulp.address, 15 * 60])

  await sendTxn(ulpManager.setInPrivateMode(true), "ulpManager.setInPrivateMode")

  await sendTxn(ulp.setMinter(ulpManager.address, true), "ulp.setMinter")
  await sendTxn(usdg.addVault(ulpManager.address), "usdg.addVault")
  await sendTxn(vault.setManager(ulpManager.address, true), "vault.setManager")

  writeTmpAddresses({
    ulpManager: ulpManager.address
  })
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
