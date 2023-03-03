// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../tokens/FaucetToken.sol";

contract WBTC is FaucetToken {
    constructor() FaucetToken("UPERP WBTC", "WBTC", 8, 50000000) {
    }
}
