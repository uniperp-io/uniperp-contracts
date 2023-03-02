// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IOracle {
    function getMaxPrice(address _token) external view returns (uint256);
    function getMinPrice(address _token) external view returns (uint256);    
}
