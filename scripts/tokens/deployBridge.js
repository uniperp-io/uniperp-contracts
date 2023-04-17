const { deployContract, contractAt, writeTmpAddresses } = require("../shared/helpers")

async function main() {
  const unip = { address: "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a" }
  const wUnip = { address: "0x590020B1005b8b25f1a2C82c5f743c540dcfa24d" }
  await deployContract("Bridge", [unip.address, wUnip.address], "Bridge")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
