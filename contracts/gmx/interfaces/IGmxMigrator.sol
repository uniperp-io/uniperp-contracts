// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IGmxMigrator {
    function iouTokens(address _token) external view returns (address);
}
