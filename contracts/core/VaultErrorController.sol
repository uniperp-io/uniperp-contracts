// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

import "./interfaces/IVault.sol";
import "./interfaces/IVaultUtils.sol";
import "../access/Governable.sol";

contract VaultErrorController is Governable {
    function setErrors(IVault _vault, string[] calldata _errors) external onlyGov {
        for (uint256 i = 0; i < _errors.length; i++) {
            _vault.setError(i, _errors[i]);
        }
    }

    function setErrorsForUtils(IVaultUtils _vaultUtils, string[] calldata _errors) external onlyGov {
        for (uint256 i = 0; i < _errors.length; i++) {
            _vaultUtils.setError(i, _errors[i]);
        }
    }
}
