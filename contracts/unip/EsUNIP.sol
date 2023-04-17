// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../tokens/MintableBaseToken.sol";

contract EsUNIP is MintableBaseToken {
    constructor() MintableBaseToken("Escrowed UNIP", "esUNIP", 0) {
    }

    function id() external pure returns (string memory _name) {
        return "esUNIP";
    }
}
