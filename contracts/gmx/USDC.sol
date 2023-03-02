// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../tokens/FaucetToken.sol";

contract USDC is FaucetToken {
    constructor() public FaucetToken("UPERP usdc", "usdc", 6, 50000000) {
    }
}
