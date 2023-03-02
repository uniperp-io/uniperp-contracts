import { expect } from "chai";

//import { deployContract } from "../../utils/deploy";
import { deployFixture } from "../../utils/fixture";
import {
  TOKEN_ORACLE_TYPES,
  signPrices,
  getSignerInfo,
  getCompactedPrices,
  getCompactedPriceIndexes,
  getCompactedDecimals,
  getCompactedOracleBlockNumbers,
  getCompactedOracleTimestamps,
  getOracleParams,
} from "../../utils/oracle";

import {ARBITRUM_TESTNET_URL, ARBITRUM_TESTNET_DEPLOY_KEY} from "./env.json";
import { deployContract, contractAt , sendTxn, getFrameSigner } from "../shared/helpers";
import { expandDecimals } from "../../test/shared/utilities";
import { toUsd } from "../../test/shared/units";
import { errors } from "../../test/core/Vault/helpers";

async function executeWithOracleParams(fixture, overrides): Promise<any> {
    const { oracleBlocks, oracleBlockNumber, tokens, precisions, minPrices, maxPrices, priceFeedTokens } =
      overrides;

    const { signers } = fixture.accounts;
    const { oracleSalt, signerIndexes } = fixture.props;
  
    const tokenOracleTypes =
      overrides.tokenOracleTypes || Array(tokens.length).fill(TOKEN_ORACLE_TYPES.DEFAULT, 0, tokens.length);
  
    let minOracleBlockNumbers:number[] = [];
    let maxOracleBlockNumbers:number[] = [];
    let oracleTimestamps:number[] = [];
    let blockHashes:string[] = [];
  
    for (let i = 0; i < oracleBlocks.length; i++) {
        const oracleBlock = oracleBlocks[i];
        minOracleBlockNumbers.push(oracleBlock.number);
        maxOracleBlockNumbers.push(oracleBlock.number);
        oracleTimestamps.push(oracleBlock.timestamp);
        blockHashes.push(oracleBlock.hash);
    }
  
    const args = {
      oracleSalt,
      minOracleBlockNumbers,
      maxOracleBlockNumbers,
      oracleTimestamps,
      blockHashes,
      signerIndexes,
      tokens,
      tokenOracleTypes,
      precisions,
      minPrices,
      maxPrices,
      signers,
      priceFeedTokens,
    };
  
    let oracleParams = await getOracleParams(args);
    return oracleParams;
}

async function main() {
    const fixture = await deployFixture();

    let oracleBlock = {number: 100004, timestamp: 1439799168, hash: "0xf93283571ae16dcecbe1816adc126954a739350cd1523a1559eabeae155fbb63"};
    
    //same length!
    //btc, eth
    let tokens = ["0x40c2228f2Bc74420363bbF27A316cf49D56C4907", "0xe39Ab88f8A4777030A534146A9Ca3B52bd5D43A3"];
    //TODO
    let precisions = [26, 26];
    let minPrices = [234413000, 16200000];
    let maxPrices = [234483000, 16310000];

    //usdc, usdt
    let priceFeedTokens = ["0x5BB509Ea9C86d0Ff42ecF5E5DA88671197a1BaC0", "0x0d3D8a77A67dCacc41939700eabbf361656Be916"];

    let overrides = {oracleBlocks: [oracleBlock, oracleBlock], tokens, precisions, minPrices, maxPrices, priceFeedTokens};

    let oracleParam = await executeWithOracleParams(fixture, overrides);

    let rpcProvider = new ethers.providers.JsonRpcProvider(ARBITRUM_TESTNET_URL)
    const signer = new ethers.Wallet(ARBITRUM_TESTNET_DEPLOY_KEY).connect(rpcProvider)
    //const signer = await getFrameSigner()
  
    const admin = signer.address
    console.log("\nadmin address: ", admin)
    console.log("\n")
    
    const positionManager = await contractAt("PositionManager", "0x0644e8b061C0C1A148c921425d1Af8A0B5F1EF09")

    const account = "0xd025C8DD06a87555063C9FbF1D8581Dd0F38b25E";
    const orderIndex = 1;
    await sendTxn(positionManager.executeSwapOrder(account, orderIndex, oracleParam), "positionManager.executeSwapOrder");
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
