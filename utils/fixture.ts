import hre from "hardhat";

import { expandDecimals } from "./math";
import { hashData } from "./hash";

export async function deployFixture() {
    const chainId = 31337; // hardhat chain id
    const accountList = await hre.ethers.getSigners();
    const [
      wallet,
      user0,
      user1,
      user2,
      user3,
      user4,
      user5,
      user6,
      user7,
      user8,
      signer0,
      signer1,
      signer2,
      signer3,
      signer4,
      signer5,
      signer6,
      signer7,
      signer8,
      signer9,
    ] = accountList;
  
    //const wnt = await hre.ethers.getContract("WETH");

    const oracleSalt = hashData(["uint256", "string"], [chainId, "xget-oracle-v1"]);

    return {
        accountList,
        accounts: {
          wallet,
          user0,
          user1,
          user2,
          user3,
          user4,
          user5,
          user6,
          user7,
          user8,
          signer0,
          signer1,
          signer2,
          signer3,
          signer4,
          signer5,
          signer6,
          signer7,
          signer8,
          signer9,
          signers: [signer0, signer1, signer2, signer3, signer4, signer5, signer6],
        },
        props: { oracleSalt, signerIndexes: [0, 1, 2, 3, 4, 5, 6], executionFee: "1000000000000000" },
    };        
}