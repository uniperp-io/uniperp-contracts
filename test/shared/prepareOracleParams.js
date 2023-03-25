const { ethers } = require("hardhat")
const { deployFixture } = require("../../utils/fixture")
//const { deployFixture } from "../../utils/goerliFixture";
const {
  TOKEN_ORACLE_TYPES,
  signPrices,
  getSignerInfo,
  getCompactedPrices,
  getCompactedPriceIndexes,
  getCompactedDecimals,
  getCompactedOracleBlockNumbers,
  getCompactedOracleTimestamps,
  getOracleParams,
} = require("../../utils/oracle");

const { expandDecimals } = require("./utilities")
const { toUsd } = require("./units")
const { errors } = require("../core/Vault/helpers")

async function executeWithOracleParams(fixture, overrides) {
    const { oracleBlocks, oracleBlockNumber, tokens, precisions, minPrices, maxPrices, priceFeedTokens } =
      overrides;

    const { signers } = fixture.accounts;
    const { oracleSalt, signerIndexes } = fixture.props;
  
    const tokenOracleTypes =
      overrides.tokenOracleTypes || Array(tokens.length).fill(TOKEN_ORACLE_TYPES.DEFAULT, 0, tokens.length);
  
    let minOracleBlockNumbers = [];
    let maxOracleBlockNumbers = [];
    let oracleTimestamps = [];
    let blockHashes = [];

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
  
    //console.log(args);
    let oracleParams = await getOracleParams(args);
    return oracleParams;
}

export async function prepareOracleParam(feedTokens, precisions, minPrices, maxPrices, priceFeedTokens, oracleBlock) {
    if (minPrices.length != maxPrices.length) {
      console.log(minPrices.length != maxPrices.length);
      return null
    } else{
      for (let i = 0; i < minPrices.length; ++i) {
        if (minPrices[i] > maxPrices[i]) {
          console.log("ERROR minPrices[i] > maxPrices[i]", minPrices[i], maxPrices[i]);
          return null;
        }
      }
    }

    let overrides = {oracleBlocks: Array(feedTokens.length).fill(oracleBlock, 0, feedTokens.length), tokens: feedTokens, precisions, minPrices, maxPrices, priceFeedTokens};

    const fixture = await deployFixture();
    let oracleParam = await executeWithOracleParams(fixture, overrides);
    //console.log(oracleParam)
    return oracleParam
}

export async function getOracleBlock(provider) {
  const block = await provider.getBlock();
  //block = await provider.getBlock(block.number-5);
  let oracleBlock = {number: block.number, timestamp: block.timestamp, hash: block.hash};
  return oracleBlock
}

export async function getSigners(fixture) {
  const { signers } = fixture.accounts;
  return signers
}
