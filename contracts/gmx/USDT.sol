// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../tokens/FaucetToken.sol";

contract USDT is FaucetToken {
    constructor() public FaucetToken("UPERP usdt", "usdt", 6, 500) {
    }
}
