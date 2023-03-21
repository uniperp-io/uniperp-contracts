// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../tokens/FaucetToken.sol";

contract JPY is FaucetToken {
    constructor() FaucetToken("UPERP JPY", "JPY", 18, 50000000000000000000000) {
    }
}
