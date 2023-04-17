const { deployContract, contractAt, sendTxn, readCsv } = require("../shared/helpers")
const { expandDecimals, bigNumberify } = require("../../test/shared/utilities")

const path = require('path')
const fs = require('fs')
const parse = require('csv-parse')

const inputDir = path.resolve(__dirname, "../..") + "/data/bonds/"

const network = (process.env.HARDHAT_NETWORK || 'mainnet');

const inputFile = inputDir + "2022-09-14_transfers.csv"
const shouldSendTxns = true

async function getArbValues() {
  const esUnip = await contractAt("EsUNIP", "0xf42Ae1D54fd613C9bb14810b0588FaAa09a426cA")
  const esUnipBatchSender = await contractAt("EsUnipBatchSender", "0xc3828fa579996090Dc7767E051341338e60207eF")

  const vestWithUnipOption = "0x544a6ec142Aa9A7F75235fE111F61eF2EbdC250a"
  const vestWithUlpOption = "0x9d8f6f6eE45275A5Ca3C6f6269c5622b1F9ED515"

  const unipVester = await contractAt("Vester", "0x199070DDfd1CFb69173aa2F7e20906F26B363004")
  const ulpVester = await contractAt("Vester", "0xA75287d2f8b217273E7FCD7E86eF07D33972042E")

  return { esUnip, esUnipBatchSender, vestWithUnipOption, vestWithUlpOption, unipVester, ulpVester }
}

async function getAvaxValues() {
  const esUnip = await contractAt("EsUNIP", "0xFf1489227BbAAC61a9209A08929E4c2a526DdD17")
  const esUnipBatchSender = await contractAt("EsUnipBatchSender", "0xc9baFef924159138697e72899a2753a3Dc8D1F4d")
  const vestWithUnipOption = "0x171a321A78dAE0CDC0Ba3409194df955DEEcA746"
  const vestWithUlpOption = "0x28863Dd19fb52DF38A9f2C6dfed40eeB996e3818"

  const unipVester = await contractAt("Vester", "0x472361d3cA5F49c8E633FB50385BfaD1e018b445")
  const ulpVester = await contractAt("Vester", "0x62331A7Bd1dfB3A7642B7db50B5509E57CA3154A")

  return { esUnip, esUnipBatchSender, vestWithUnipOption, vestWithUlpOption, unipVester, ulpVester }
}

async function main() {
  const wallet = { address: "0x5F799f365Fa8A2B60ac0429C48B153cA5a6f0Cf8" }

  const values = network === "arbitrum" ? await getArbValues() : await getAvaxValues()
  const { esUnip, esUnipBatchSender, vestWithUnipOption, vestWithUlpOption, unipVester, ulpVester } = values

  const txns = await readCsv(inputFile)
  console.log("processing list", txns.length)

  const vestWithUnipAccounts = []
  const vestWithUnipAmounts = []

  const vestWithUlpAccounts = []
  const vestWithUlpAmounts = []

  let totalEsUnip = bigNumberify(0)

  for (let i = 0; i < txns.length; i++) {
    const txn = txns[i]
    if (txn.Method !== "Transfer") {
      continue
    }

    const amount = ethers.utils.parseUnits(txn.Quantity, 18)

    if (txn.To.toLowerCase() === vestWithUnipOption.toLowerCase()) {
      vestWithUnipAccounts.push(txn.From)
      vestWithUnipAmounts.push(amount)
      totalEsUnip = totalEsUnip.add(amount)
    }

    if (txn.To.toLowerCase() === vestWithUlpOption.toLowerCase()) {
      vestWithUlpAccounts.push(txn.From)
      vestWithUlpAmounts.push(amount)
      totalEsUnip = totalEsUnip.add(amount)
    }
  }

  console.log("vestWithUnipAccounts", vestWithUnipAccounts.length)
  console.log("vestWithUlpAccounts", vestWithUlpAccounts.length)
  console.log("totalEsUnip", totalEsUnip.toString(), ethers.utils.formatUnits(totalEsUnip, 18))

  if (shouldSendTxns) {
    if (vestWithUnipAccounts.length > 0) {
      await sendTxn(esUnipBatchSender.send(unipVester.address, 4, vestWithUnipAccounts, vestWithUnipAmounts), "esUnipBatchSender.send(unipVester)")
    }
    if (vestWithUlpAccounts.length > 0) {
      await sendTxn(esUnipBatchSender.send(ulpVester.address, 320, vestWithUlpAccounts, vestWithUlpAmounts), "esUnipBatchSender.send(ulpVester)")
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
