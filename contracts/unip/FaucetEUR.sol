// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../tokens/FaucetToken.sol";

contract FaucetEUR is FaucetToken {
    constructor() FaucetToken("UPERP EUR", "EUR", 18, 50000000000000000000000) {
    }
}
