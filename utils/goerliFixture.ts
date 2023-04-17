import hre from "hardhat";

import { expandDecimals } from "./math";
import { hashData } from "./hash";
import { Wallet } from 'ethers';
import { HDNode } from 'ethers/lib/utils';
import { NonceManager } from '@ethersproject/experimental';
import { range } from 'lodash';

export async function deployFixture() {
    const chainId = 421613; // hardhat chain id

    const mnemonic = "hat solid this else damage remind ghost resist broom online pear curtain"
    const masterNode = HDNode.fromMnemonic(mnemonic);
    const amount = 20
    
    const ARBITRUM_TESTNET_URL = "https://goerli-rollup.arbitrum.io/rpc";
    let rpcProvider = new ethers.providers.JsonRpcProvider(ARBITRUM_TESTNET_URL)

    const accountList = range(amount).map(i => {
        const wallet = new Wallet(masterNode.derivePath(`m/44'/60'/0'/0/${i}`).privateKey, rpcProvider);
        console.info(`Created signer ${i + 1}/${amount}`, { args: { address: wallet.address } });
        //return new NonceManager(wallet).connect(rpcProvider);
        return wallet;
    });

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