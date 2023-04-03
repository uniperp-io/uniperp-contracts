// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../tokens/BaseToken.sol";

contract EUR is BaseToken {
    constructor() BaseToken("Uniperp EUR", "EUR", 1) {
    }
}
