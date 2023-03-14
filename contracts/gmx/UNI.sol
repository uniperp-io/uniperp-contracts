// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../tokens/FaucetToken.sol";

contract UNI is FaucetToken {
    constructor() FaucetToken("UPERP UNI", "UNI", 18, 500000000000000000000000) {
    }
}
