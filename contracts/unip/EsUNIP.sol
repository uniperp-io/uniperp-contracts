// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../tokens/MintableBaseToken.sol";

contract EsGMX is MintableBaseToken {
    constructor() public MintableBaseToken("Escrowed UNIP", "esUNIP", 0) {
    }

    function id() external pure returns (string memory _name) {
        return "esUNIP";
    }
}
