// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IGMT {
    function beginMigration() external;
    function endMigration() external;
}
