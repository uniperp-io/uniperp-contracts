// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../tokens/MintableBaseToken.sol";

contract GLP is MintableBaseToken {
    constructor() public MintableBaseToken("Uniperp LP", "ULP", 0) {
    }

    function id() external pure returns (string memory _name) {
        return "ULP";
    }
}
