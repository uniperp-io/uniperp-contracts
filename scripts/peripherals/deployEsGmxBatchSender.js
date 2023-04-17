const { getFrameSigner, deployContract, contractAt, sendTxn } = require("../shared/helpers")

const network = (process.env.HARDHAT_NETWORK || 'mainnet');

async function getArbValues() {
  const signer = await getFrameSigner()

  const esUnip = await contractAt("EsUNIP", "0xf42Ae1D54fd613C9bb14810b0588FaAa09a426cA")
  const esUnipGov = await contractAt("Timelock", await esUnip.gov(), signer)
  const unipVester = await contractAt("Vester", "0x199070DDfd1CFb69173aa2F7e20906F26B363004")
  const unipVesterGov = await contractAt("Timelock", await unipVester.gov(), signer)
  const ulpVester = await contractAt("Vester", "0xA75287d2f8b217273E7FCD7E86eF07D33972042E")
  const ulpVesterGov = await contractAt("Timelock", await ulpVester.gov(), signer)

  return { esUnip, esUnipGov, unipVester, unipVesterGov, ulpVester, ulpVesterGov }
}

async function getAvaxValues() {
  const signer = await getFrameSigner()

  const esUnip = await contractAt("EsUNIP", "0xFf1489227BbAAC61a9209A08929E4c2a526DdD17")
  const esUnipGov = await contractAt("Timelock", await esUnip.gov(), signer)
  const unipVester = await contractAt("Vester", "0x472361d3cA5F49c8E633FB50385BfaD1e018b445")
  const unipVesterGov = await contractAt("Timelock", await unipVester.gov(), signer)
  const ulpVester = await contractAt("Vester", "0x62331A7Bd1dfB3A7642B7db50B5509E57CA3154A")
  const ulpVesterGov = await contractAt("Timelock", await ulpVester.gov(), signer)

  return { esUnip, esUnipGov, unipVester, unipVesterGov, ulpVester, ulpVesterGov }
}

async function main() {
  const method = network === "arbitrum" ? getArbValues : getAvaxValues
  const { esUnip, esUnipGov, unipVester, unipVesterGov, ulpVester, ulpVesterGov } = await method()

  const esUnipBatchSender = await deployContract("EsUnipBatchSender", [esUnip.address])

  console.log("esUnip", esUnip.address)
  console.log("esUnipGov", esUnipGov.address)
  console.log("unipVester", unipVester.address)
  console.log("unipVesterGov", unipVesterGov.address)
  console.log("ulpVester", ulpVester.address)
  console.log("ulpVesterGov", ulpVesterGov.address)

  await sendTxn(esUnipGov.signalSetHandler(esUnip.address, esUnipBatchSender.address, true), "esUnipGov.signalSetHandler")
  await sendTxn(unipVesterGov.signalSetHandler(unipVester.address, esUnipBatchSender.address, true), "unipVesterGov.signalSetHandler")
  await sendTxn(ulpVesterGov.signalSetHandler(ulpVester.address, esUnipBatchSender.address, true), "ulpVesterGov.signalSetHandler")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
