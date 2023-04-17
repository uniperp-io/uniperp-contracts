// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../tokens/FaucetToken.sol";

contract USDT is FaucetToken {
    constructor() FaucetToken("UPERP USDT", "USDT", 6, 50000000) {
    }
}
