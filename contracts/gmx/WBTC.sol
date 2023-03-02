// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../tokens/FaucetToken.sol";

contract WBTC is FaucetToken {
    constructor() public FaucetToken("UPERP wbtc", "wbtc", 8, 50000000) {
    }
}
