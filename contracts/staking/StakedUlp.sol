// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../libraries/math/SafeMath.sol";
import "../libraries/token/IERC20.sol";

import "../core/interfaces/IUlpManager.sol";

import "./interfaces/IRewardTracker.sol";
import "./interfaces/IRewardTracker.sol";

// provide a way to transfer staked ULP tokens by unstaking from the sender
// and staking for the receiver
// tests in RewardRouterV2.js
contract StakedUlp {
    using SafeMath for uint256;

    string public constant name = "StakedUlp";
    string public constant symbol = "sULP";
    uint8 public constant decimals = 18;

    address public ulp;
    IUlpManager public ulpManager;
    address public stakedUlpTracker;
    address public feeUlpTracker;

    mapping (address => mapping (address => uint256)) public allowances;

    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(
        address _ulp,
        IUlpManager _ulpManager,
        address _stakedUlpTracker,
        address _feeUlpTracker
    ) public {
        ulp = _ulp;
        ulpManager = _ulpManager;
        stakedUlpTracker = _stakedUlpTracker;
        feeUlpTracker = _feeUlpTracker;
    }

    function allowance(address _owner, address _spender) external view returns (uint256) {
        return allowances[_owner][_spender];
    }

    function approve(address _spender, uint256 _amount) external returns (bool) {
        _approve(msg.sender, _spender, _amount);
        return true;
    }

    function transfer(address _recipient, uint256 _amount) external returns (bool) {
        _transfer(msg.sender, _recipient, _amount);
        return true;
    }

    function transferFrom(address _sender, address _recipient, uint256 _amount) external returns (bool) {
        uint256 nextAllowance = allowances[_sender][msg.sender].sub(_amount, "StakedUlp: transfer amount exceeds allowance");
        _approve(_sender, msg.sender, nextAllowance);
        _transfer(_sender, _recipient, _amount);
        return true;
    }

    function balanceOf(address _account) external view returns (uint256) {
        return IRewardTracker(feeUlpTracker).depositBalances(_account, ulp);
    }

    function totalSupply() external view returns (uint256) {
        return IERC20(stakedUlpTracker).totalSupply();
    }

    function _approve(address _owner, address _spender, uint256 _amount) private {
        require(_owner != address(0), "StakedUlp: approve from the zero address");
        require(_spender != address(0), "StakedUlp: approve to the zero address");

        allowances[_owner][_spender] = _amount;

        emit Approval(_owner, _spender, _amount);
    }

    function _transfer(address _sender, address _recipient, uint256 _amount) private {
        require(_sender != address(0), "StakedUlp: transfer from the zero address");
        require(_recipient != address(0), "StakedUlp: transfer to the zero address");

        require(
            ulpManager.lastAddedAt(_sender).add(ulpManager.cooldownDuration()) <= block.timestamp,
            "StakedUlp: cooldown duration not yet passed"
        );

        IRewardTracker(stakedUlpTracker).unstakeForAccount(_sender, feeUlpTracker, _amount, _sender);
        IRewardTracker(feeUlpTracker).unstakeForAccount(_sender, ulp, _amount, _sender);

        IRewardTracker(feeUlpTracker).stakeForAccount(_sender, _recipient, ulp, _amount);
        IRewardTracker(stakedUlpTracker).stakeForAccount(_recipient, _recipient, feeUlpTracker, _amount);
    }
}
