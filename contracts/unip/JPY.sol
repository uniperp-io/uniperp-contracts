// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../tokens/BaseToken.sol";

contract JPY is BaseToken {
    constructor() BaseToken("Uniperp JPY", "JPY", 1) {
    }
}
