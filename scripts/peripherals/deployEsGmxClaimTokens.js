const { deployContract, contractAt, writeTmpAddresses } = require("../shared/helpers")

async function main() {
  await deployContract("MintableBaseToken", ["VestingOption", "ARB:UNIP", 0])
  await deployContract("MintableBaseToken", ["VestingOption", "ARB:ULP", 0])
  await deployContract("MintableBaseToken", ["VestingOption", "AVAX:UNIP", 0])
  await deployContract("MintableBaseToken", ["VestingOption", "AVAX:ULP", 0])
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
