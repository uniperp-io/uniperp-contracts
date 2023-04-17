// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../tokens/BaseToken.sol";

contract BNB is BaseToken {
    constructor() BaseToken("Uniperp BNB", "BNB", 1) {
    }
}
