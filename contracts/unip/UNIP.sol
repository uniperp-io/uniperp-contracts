// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../tokens/MintableBaseToken.sol";

contract UNIP is MintableBaseToken {
    constructor() MintableBaseToken("UNIP", "UNIP", 0) {
    }

    function id() external pure returns (string memory _name) {
        return "UNIP";
    }
}
