// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./interfaces/ITimelockExt.sol";
import "../core/interfaces/IVaultUtils.sol";
import "../referrals/interfaces/IReferralStorage.sol";
import "../core/interfaces/IUlpManager.sol";

//as original Timelock size is large than 120kb, not fit for zksync era
//move some code to this file
contract TimelockExt is ITimelockExt {
    uint256 public constant MAX_FUNDING_RATE_FACTOR = 200; // 0.02%
    uint256 public constant MAX_LEVERAGE_VALIDATION = 500000; // 50x

    address public admin;
    address public tokenManager;
    address public ulpManager;
    
    mapping (address => bool) public isHandler;
    mapping (address => bool) public isKeeper;

    modifier onlyAdmin() {
        require(msg.sender == admin, "TFB");
        _;
    }

    modifier onlyKeeperAndAbove() {
        require(msg.sender == admin || isHandler[msg.sender] || isKeeper[msg.sender], "TFB");
        _;
    }

    modifier onlyTokenManager() {
        require(msg.sender == tokenManager, "TFB");
        _;
    }

    constructor(address _admin,
                address _tokenManager,
                address _ulpManager
    ) {
        admin = _admin;
        tokenManager = _tokenManager;
        ulpManager = _ulpManager;
    }

    function setKeeper(address _keeper, bool _isActive) external onlyAdmin {
        isKeeper[_keeper] = _isActive;
    }

    function setAdmin(address _admin) external override onlyTokenManager {
        admin = _admin;
    }

    function setContractHandler(address _handler, bool _isActive) external onlyAdmin {
        isHandler[_handler] = _isActive;
    }

    function setMaxLeverage(address _vaultUtils, uint256 _maxLeverage) external onlyAdmin {
      require(_maxLeverage > MAX_LEVERAGE_VALIDATION, "TIML1");  //Timelock: invalid _maxLeverage
      IVaultUtils(_vaultUtils).setMaxLeverage(_maxLeverage);
    }

    function setMaxLeverages(address _vaultUtils, address _token, uint256 _maxLeverage) external onlyAdmin {
      require(_maxLeverage > MAX_LEVERAGE_VALIDATION, "TIML2");  //Timelock: invalid _maxLeverage
      IVaultUtils(_vaultUtils).setMaxLeverages(_token, _maxLeverage);
    }

    function setIsTradable(address _vaultUtils, address _token, bool _isTradable) external onlyAdmin {
        IVaultUtils(_vaultUtils).setIsTradable(_token, _isTradable);
    }

    function setFundingRate(address _vaultUtils, uint256 _fundingInterval, uint256 _fundingRateFactor, uint256 _stableFundingRateFactor) external onlyKeeperAndAbove {
        require(_fundingRateFactor < MAX_FUNDING_RATE_FACTOR, "TIFR");  //Timelock: invalid _fundingRateFactor
        require(_stableFundingRateFactor < MAX_FUNDING_RATE_FACTOR, "TISR");    //Timelock: invalid _stableFundingRateFactor
        IVaultUtils(_vaultUtils).setFundingRate(_fundingInterval, _fundingRateFactor, _stableFundingRateFactor);
    }

    function setMaxGasPrice(address _vaultUtils, uint256 _maxGasPrice) external onlyAdmin {
        require(_maxGasPrice > 5000000000, "INMG"); //Invalid _maxGasPrice
        IVaultUtils(_vaultUtils).setMaxGasPrice(_maxGasPrice);
    }

    function setTier(address _referralStorage, uint256 _tierId, uint256 _totalRebate, uint256 _discountShare) external onlyKeeperAndAbove {
        IReferralStorage(_referralStorage).setTier(_tierId, _totalRebate, _discountShare);
    }

    function setReferrerTier(address _referralStorage, address _referrer, uint256 _tierId) external onlyKeeperAndAbove {
        IReferralStorage(_referralStorage).setReferrerTier(_referrer, _tierId);
    }

    function govSetCodeOwner(address _referralStorage, bytes32 _code, address _newAccount) external onlyKeeperAndAbove {
        IReferralStorage(_referralStorage).govSetCodeOwner(_code, _newAccount);
    }

    function setShortsTrackerAveragePriceWeight(uint256 _shortsTrackerAveragePriceWeight) external onlyAdmin {
        IUlpManager(ulpManager).setShortsTrackerAveragePriceWeight(_shortsTrackerAveragePriceWeight);
    }

    function setUlpCooldownDuration(uint256 _cooldownDuration) external onlyAdmin {
        require(_cooldownDuration < 2 hours, "TIC");   //Timelock: invalid _cooldownDuration
        IUlpManager(ulpManager).setCooldownDuration(_cooldownDuration);
    }
}
