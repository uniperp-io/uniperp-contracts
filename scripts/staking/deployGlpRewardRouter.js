const { deployContract, contractAt, sendTxn, getFrameSigner } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const tokens = require('../core/tokens')[network];

const { AddressZero } = ethers.constants

async function getArbValues() {
  const { nativeToken } = tokens
  const ulp = { address: "0x4277f8F2c384827B5273592FF7CeBd9f2C1ac258" }
  const feeUlpTracker = { address: "0x4e971a87900b931fF39d1Aad67697F49835400b6" }
  const stakedUlpTracker = { address: "0x1aDDD80E6039594eE970E5872D247bf0414C8903" }
  const ulpManager = { address: "0x3963FfC9dff443c2A94f21b129D429891E32ec18" }

  return { nativeToken, ulp, feeUlpTracker, stakedUlpTracker, ulpManager }
}

async function getAvaxValues() {
  const { nativeToken } = tokens
  const ulp = { address: "0x01234181085565ed162a948b6a5e88758CD7c7b8" }
  const feeUlpTracker = { address: "0xd2D1162512F927a7e282Ef43a362659E4F2a728F" }
  const stakedUlpTracker = { address: "0x9e295B5B976a184B14aD8cd72413aD846C299660" }
  const ulpManager = { address: "0xD152c7F25db7F4B95b7658323c5F33d176818EE4" }

  return { nativeToken, ulp, feeUlpTracker, stakedUlpTracker, ulpManager }
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
  const { nativeToken, ulp, feeUlpTracker, stakedUlpTracker, ulpManager } = await getValues()

  const rewardRouter = await deployContract("RewardRouterV2", [])
  await sendTxn(rewardRouter.initialize(
    nativeToken.address, // _weth
    AddressZero, // _unip
    AddressZero, // _esUnip
    AddressZero, // _bnUnip
    ulp.address, // _ulp
    AddressZero, // _stakedUnipTracker
    AddressZero, // _bonusUnipTracker
    AddressZero, // _feeUnipTracker
    feeUlpTracker.address, // _feeUlpTracker
    stakedUlpTracker.address, // _stakedUlpTracker
    ulpManager.address, // _ulpManager
    AddressZero, // _unipVester
    AddressZero // ulpVester
  ), "rewardRouter.initialize")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
