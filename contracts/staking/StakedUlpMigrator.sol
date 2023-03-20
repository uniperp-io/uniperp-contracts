// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../libraries/math/SafeMath.sol";
import "../libraries/token/IERC20.sol";

import "../core/interfaces/IUlpManager.sol";

import "./interfaces/IRewardTracker.sol";
import "./interfaces/IRewardTracker.sol";

import "../access/Governable.sol";

// provide a way to migrate staked ULP tokens by unstaking from the sender
// and staking for the receiver
// meant for a one-time use for a specified sender
// requires the contract to be added as a handler for stakedUlpTracker and feeUlpTracker
contract StakedUlpMigrator is Governable {
    using SafeMath for uint256;

    address public sender;
    address public ulp;
    address public stakedUlpTracker;
    address public feeUlpTracker;
    bool public isEnabled = true;

    constructor(
        address _sender,
        address _ulp,
        address _stakedUlpTracker,
        address _feeUlpTracker
    ) public {
        sender = _sender;
        ulp = _ulp;
        stakedUlpTracker = _stakedUlpTracker;
        feeUlpTracker = _feeUlpTracker;
    }

    function disable() external onlyGov {
        isEnabled = false;
    }

    function transfer(address _recipient, uint256 _amount) external onlyGov {
        _transfer(sender, _recipient, _amount);
    }

    function _transfer(address _sender, address _recipient, uint256 _amount) private {
        require(isEnabled, "StakedUlpMigrator: not enabled");
        require(_sender != address(0), "StakedUlpMigrator: transfer from the zero address");
        require(_recipient != address(0), "StakedUlpMigrator: transfer to the zero address");

        IRewardTracker(stakedUlpTracker).unstakeForAccount(_sender, feeUlpTracker, _amount, _sender);
        IRewardTracker(feeUlpTracker).unstakeForAccount(_sender, ulp, _amount, _sender);

        IRewardTracker(feeUlpTracker).stakeForAccount(_sender, _recipient, ulp, _amount);
        IRewardTracker(stakedUlpTracker).stakeForAccount(_recipient, _recipient, feeUlpTracker, _amount);
    }
}
