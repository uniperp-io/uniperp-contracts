// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../tokens/FaucetToken.sol";

contract LINK is FaucetToken {
    constructor() FaucetToken("UPERP LINK", "LINK", 18, 50000000000000000000000) {
    }
}
