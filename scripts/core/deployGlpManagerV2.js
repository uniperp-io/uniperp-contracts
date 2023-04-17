const { deployContract, contractAt , sendTxn, writeTmpAddresses, callWithRetries } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")
const { toUsd } = require("../../test/shared/units")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('./tokens')[network];

async function getArbValues() {
  const vault = { address: "0x489ee077994B6658eAfA855C308275EAd8097C4A" }
  const usdg = { address: "0x45096e7aA921f27590f8F19e457794EB09678141" }
  const ulp = { address: "0x4277f8F2c384827B5273592FF7CeBd9f2C1ac258" }
  const shortsTracker = { address: "0xf58eEc83Ba28ddd79390B9e90C4d3EbfF1d434da" }

  return { vault, usdg, ulp, shortsTracker }
}

async function getAvaxValues() {
  const vault = { address: "0x9ab2De34A33fB459b538c43f251eB825645e8595" }
  const usdg = { address: "0xc0253c3cC6aa5Ab407b5795a04c28fB063273894" }
  const ulp = { address: "0x01234181085565ed162a948b6a5e88758CD7c7b8" }
  const shortsTracker = { address: "0x9234252975484D75Fd05f3e4f7BdbEc61956D73a" }

  return { vault, usdg, ulp, shortsTracker }
}

async function getValues() {
  if (network === "arbitrum") {
    return getArbValues()
  }

  if (network === "avax") {
    return getAvaxValues()
  }
}

async function main() {
  const { vault, usdg, ulp, shortsTracker } = await getValues()

  const cooldownDuration = 0
  const ulpManager = await deployContract("UlpManager", [vault.address, usdg.address, ulp.address, shortsTracker.address, cooldownDuration])

  await sendTxn(ulpManager.setInPrivateMode(true), "ulpManager.setInPrivateMode")

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
