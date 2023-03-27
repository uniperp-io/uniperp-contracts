// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../libraries/math/SafeMath.sol";
import "../libraries/token/IERC20.sol";
import "./interfaces/IVault.sol";
import "./interfaces/IVaultUtils.sol";

import "../access/Governable.sol";

contract VaultUtils is IVaultUtils, Governable {
    using SafeMath for uint256;

    struct Position {
        uint256 size;
        uint256 collateral;
        uint256 averagePrice;
        uint256 entryFundingRate;
        uint256 reserveAmount;
        int256 realisedPnl;
        uint256 lastIncreasedTime;
    }

    event UpdateFundingRate(address token, uint256 fundingRate);
    uint256 public constant MIN_FUNDING_RATE_INTERVAL = 1 hours;
    uint256 public constant MAX_FUNDING_RATE_FACTOR = 10000; // 1%
    uint256 public constant PRICE_PRECISION = 10 ** 30;

    uint256 public override maxLeverage = 50 * 10000; // 50x
    mapping (address => uint256) public override maxLeverages;
    uint256 public constant MIN_LEVERAGE = 10000; // 1x

    mapping (address => bool) public override isTradable;

    IVault public vault;
    mapping (uint256 => string) public errors;
    address public errorController;

    // cumulativeFundingRates tracks the funding rates based on utilization
    mapping (address => uint256) public override cumulativeFundingRates;
    // lastFundingTimes tracks the last time funding was updated for a token
    mapping (address => uint256) public override lastFundingTimes;
    mapping (address => bool) public isVault;
    uint256 public override maxGasPrice;

    uint256 public override fundingInterval = 8 hours;
    uint256 public override fundingRateFactor;
    uint256 public override stableFundingRateFactor;

    uint256 public constant BASIS_POINTS_DIVISOR = 10000;
    uint256 public constant FUNDING_RATE_PRECISION = 1000000;
    
    modifier onlyVault() {
        require(isVault[msg.sender], "NotVault");
        _;
    }

    constructor(IVault _vault) {
        vault = _vault;
        isVault[address(vault)] = true;
        isVault[msg.sender] = true; //TODO remove after test
    }

    function initialize(uint256 _fundingRateFactor, uint256 _stableFundingRateFactor) external onlyGov {
        fundingRateFactor = _fundingRateFactor;
        stableFundingRateFactor = _stableFundingRateFactor;
    }

    function setMaxGasPrice(uint256 _maxGasPrice) external override onlyGov {
        maxGasPrice = _maxGasPrice;
    }

    function setMaxLeverage(uint256 _maxLeverage) external override onlyGov {
        _validate(_maxLeverage > MIN_LEVERAGE, 2);
        maxLeverage = _maxLeverage;
    }

    function setMaxLeverages(address _token, uint256 _maxLeverage) external override onlyGov {
        _validate(_maxLeverage > MIN_LEVERAGE, 2);
        maxLeverages[_token] = _maxLeverage;
    }

    function setIsTradable(address _token, bool _isTradable) external override onlyGov {
        isTradable[_token] = _isTradable;
    }

    function isTradableBatch(address[] memory _tokens) external view returns (bool[] memory res) {
        res = new bool[](_tokens.length);
        for (uint256 i = 0; i < _tokens.length; i++) {
            res[i] = isTradable[_tokens[i]];
        }
    }

    function validateTradablePair(address _token1, address _token2) public override view {
        require(isTradable[_token1] && isTradable[_token2], "notTradable");
    }

    function setFundingRate(uint256 _fundingInterval, uint256 _fundingRateFactor, uint256 _stableFundingRateFactor) external override onlyGov {
        _validate(_fundingInterval >= MIN_FUNDING_RATE_INTERVAL, 10);
        _validate(_fundingRateFactor <= MAX_FUNDING_RATE_FACTOR, 11);
        _validate(_stableFundingRateFactor <= MAX_FUNDING_RATE_FACTOR, 12);
        fundingInterval = _fundingInterval;
        fundingRateFactor = _fundingRateFactor;
        stableFundingRateFactor = _stableFundingRateFactor;
    }

    function updateCumulativeFundingRate(address _collateralToken, address _indexToken) public onlyVault {
        if (lastFundingTimes[_collateralToken] == 0) {
            lastFundingTimes[_collateralToken] = block.timestamp.div(fundingInterval).mul(fundingInterval);
            return;
        }

        if (lastFundingTimes[_collateralToken].add(fundingInterval) > block.timestamp) {
            return;
        }

        uint256 fundingRate = getNextFundingRate(_collateralToken);
        cumulativeFundingRates[_collateralToken] = cumulativeFundingRates[_collateralToken].add(fundingRate);
        lastFundingTimes[_collateralToken] = block.timestamp.div(fundingInterval).mul(fundingInterval);

        emit UpdateFundingRate(_collateralToken, cumulativeFundingRates[_collateralToken]);
    }

    function getNextFundingRate(address _token) public override view returns (uint256) {   
        if (lastFundingTimes[_token].add(fundingInterval) > block.timestamp) { return 0; }

        uint256 intervals = block.timestamp.sub(lastFundingTimes[_token]).div(fundingInterval);
        uint256 poolAmount = vault.poolAmounts(_token);
        if (poolAmount == 0) { return 0; }

        uint256 _fundingRateFactor = vault.stableTokens(_token) ? stableFundingRateFactor : fundingRateFactor;
        return _fundingRateFactor.mul(vault.reservedAmounts(_token)).mul(intervals).div(poolAmount);
    }

    function validateSwap(address _tokenIn, address _tokenOut) external override view {
        _validate(vault.whitelistedTokens(_tokenIn), 24);
        _validate(vault.whitelistedTokens(_tokenOut), 25);
        _validate(_tokenIn != _tokenOut, 26);
        validateTradablePair(_tokenIn, _tokenOut);
        require(!vault.syntheticTokens(_tokenIn), "swapSyn1");
        require(!vault.syntheticTokens(_tokenOut), "swapSyn2");
    }

    function validateIncreasePosition(address /* _account */, address  _collateralToken, address  _indexToken, uint256 /* _sizeDelta */, bool /* _isLong */) external override view {
        _validateGasPrice();
        // no additional validations
        require(isTradable[_collateralToken], "notTrade1");
        require(isTradable[_indexToken], "notTrade2");
    }

    function validateDecreasePosition(address /* _account */, address _collateralToken, address  _indexToken, uint256 /* _collateralDelta */, uint256 /* _sizeDelta */, bool /* _isLong */, address /* _receiver */) external override view {
        _validateGasPrice();
        // no additional validations
        require(isTradable[_collateralToken], "notTrade3");
        require(isTradable[_indexToken], "notTrade4");
    }

    function getPosition(address _account, address _collateralToken, address _indexToken, bool _isLong) internal view returns (Position memory) {
        IVault _vault = vault;
        Position memory position;
        {
            (uint256 size, uint256 collateral, uint256 averagePrice, uint256 entryFundingRate, /* reserveAmount */, /* realisedPnl */, /* hasProfit */, uint256 lastIncreasedTime) = _vault.getPosition(_account, _collateralToken, _indexToken, _isLong);
            position.size = size;
            position.collateral = collateral;
            position.averagePrice = averagePrice;
            position.entryFundingRate = entryFundingRate;
            position.lastIncreasedTime = lastIncreasedTime;
        }
        return position;
    }

    function validateLiquidation(address _account, address _collateralToken, address _indexToken, bool _isLong, bool _raise) public view override returns (uint256, uint256) {
        Position memory position = getPosition(_account, _collateralToken, _indexToken, _isLong);
        IVault _vault = vault;

        (bool hasProfit, uint256 delta) = _vault.getDelta(_indexToken, position.size, position.averagePrice, _isLong, position.lastIncreasedTime);
        uint256 marginFees = getFundingFee(_account, _collateralToken, _indexToken, _isLong, position.size, position.entryFundingRate);
        marginFees = marginFees.add(getPositionFee(_account, _collateralToken, _indexToken, _isLong, position.size));

        if (!hasProfit && position.collateral < delta) {
            if (_raise) { revert("Vault: losses exceed collateral"); }
            return (1, marginFees);
        }

        uint256 remainingCollateral = position.collateral;
        if (!hasProfit) {
            remainingCollateral = position.collateral.sub(delta);
        }

        if (remainingCollateral < marginFees) {
            if (_raise) { revert("Vault: fees exceed collateral"); }
            // cap the fees to the remainingCollateral
            return (1, remainingCollateral);
        }

        if (remainingCollateral < marginFees.add(_vault.liquidationFeeUsd())) {
            if (_raise) { revert("Vault: liquidation fees exceed collateral"); }
            return (1, marginFees);
        }

        uint256 tokenMaxLeverage = maxLeverages[_indexToken];
        if (tokenMaxLeverage == 0) {
            tokenMaxLeverage = maxLeverage;
        }
        require(tokenMaxLeverage >= MIN_LEVERAGE, "tokenMaxLeverage too small");
        if (remainingCollateral.mul(tokenMaxLeverage) < position.size.mul(BASIS_POINTS_DIVISOR)) {
            if (_raise) { revert("Vault: maxLeverage exceeded"); }
            return (2, marginFees);
        }

        return (0, marginFees);
    }

    function getEntryFundingRate(address _collateralToken, address /* _indexToken */, bool /* _isLong */) public override view returns (uint256) {
        return cumulativeFundingRates[_collateralToken];
    }

    function getPositionFee(address /* _account */, address /* _collateralToken */, address /* _indexToken */, bool /* _isLong */, uint256 _sizeDelta) public override view returns (uint256) {
        if (_sizeDelta == 0) { return 0; }
        uint256 afterFeeUsd = _sizeDelta.mul(BASIS_POINTS_DIVISOR.sub(vault.marginFeeBasisPoints())).div(BASIS_POINTS_DIVISOR);
        return _sizeDelta.sub(afterFeeUsd);
    }

    function getFundingFee(address /* _account */, address _collateralToken, address /* _indexToken */, bool /* _isLong */, uint256 _size, uint256 _entryFundingRate) public override view returns (uint256) {
        if (_size == 0) { return 0; }

        uint256 fundingRate = cumulativeFundingRates[_collateralToken].sub(_entryFundingRate);
        if (fundingRate == 0) { return 0; }

        return _size.mul(fundingRate).div(FUNDING_RATE_PRECISION);
    }

    function getBuyUsdgFeeBasisPoints(address _token, uint256 _usdgAmount) public override view returns (uint256) {
        return getFeeBasisPoints(_token, _usdgAmount, vault.mintBurnFeeBasisPoints(), vault.taxBasisPoints(), true);
    }

    function getSellUsdgFeeBasisPoints(address _token, uint256 _usdgAmount) public override view returns (uint256) {
        return getFeeBasisPoints(_token, _usdgAmount, vault.mintBurnFeeBasisPoints(), vault.taxBasisPoints(), false);
    }

    function getSwapFeeBasisPoints(address _tokenIn, address _tokenOut, uint256 _usdgAmount) public override view returns (uint256) {
        bool isStableSwap = vault.stableTokens(_tokenIn) && vault.stableTokens(_tokenOut);
        uint256 baseBps = isStableSwap ? vault.stableSwapFeeBasisPoints() : vault.swapFeeBasisPoints();
        uint256 taxBps = isStableSwap ? vault.stableTaxBasisPoints() : vault.taxBasisPoints();
        uint256 feesBasisPoints0 = getFeeBasisPoints(_tokenIn, _usdgAmount, baseBps, taxBps, true);
        uint256 feesBasisPoints1 = getFeeBasisPoints(_tokenOut, _usdgAmount, baseBps, taxBps, false);
        // use the higher of the two fee basis points
        return feesBasisPoints0 > feesBasisPoints1 ? feesBasisPoints0 : feesBasisPoints1;
    }

    // cases to consider
    // 1. initialAmount is far from targetAmount, action increases balance slightly => high rebate
    // 2. initialAmount is far from targetAmount, action increases balance largely => high rebate
    // 3. initialAmount is close to targetAmount, action increases balance slightly => low rebate
    // 4. initialAmount is far from targetAmount, action reduces balance slightly => high tax
    // 5. initialAmount is far from targetAmount, action reduces balance largely => high tax
    // 6. initialAmount is close to targetAmount, action reduces balance largely => low tax
    // 7. initialAmount is above targetAmount, nextAmount is below targetAmount and vice versa
    // 8. a large swap should have similar fees as the same trade split into multiple smaller swaps
    function getFeeBasisPoints(address _token, uint256 _usdgDelta, uint256 _feeBasisPoints, uint256 _taxBasisPoints, bool _increment) public override view returns (uint256) {
        if (!vault.hasDynamicFees()) { return _feeBasisPoints; }

        uint256 initialAmount = vault.usdgAmounts(_token);
        uint256 nextAmount = initialAmount.add(_usdgDelta);
        if (!_increment) {
            nextAmount = _usdgDelta > initialAmount ? 0 : initialAmount.sub(_usdgDelta);
        }

        uint256 targetAmount = vault.getTargetUsdgAmount(_token);
        if (targetAmount == 0) { return _feeBasisPoints; }

        uint256 initialDiff = initialAmount > targetAmount ? initialAmount.sub(targetAmount) : targetAmount.sub(initialAmount);
        uint256 nextDiff = nextAmount > targetAmount ? nextAmount.sub(targetAmount) : targetAmount.sub(nextAmount);

        // action improves relative asset balance
        if (nextDiff < initialDiff) {
            uint256 rebateBps = _taxBasisPoints.mul(initialDiff).div(targetAmount);
            return rebateBps > _feeBasisPoints ? 0 : _feeBasisPoints.sub(rebateBps);
        }

        uint256 averageDiff = initialDiff.add(nextDiff).div(2);
        if (averageDiff > targetAmount) {
            averageDiff = targetAmount;
        }
        uint256 taxBps = _taxBasisPoints.mul(averageDiff).div(targetAmount);
        return _feeBasisPoints.add(taxBps);
    }

    function getSyntheticGlobalLongSize(address _indexToken) public view returns (uint256) {
        require(vault.syntheticTokens(_indexToken), "only for synthetic tokens!");
        uint256 longSize = vault.guaranteedUsd(_indexToken);
        return longSize.add(vault.syntheticCollateralAmounts(_indexToken));
    }

    // for longs: nextAveragePrice = (nextPrice * nextSize)/ (nextSize + delta)
    // for shorts: nextAveragePrice = (nextPrice * nextSize) / (nextSize - delta)
    function getNextAveragePrice(address _indexToken, uint256 _size, uint256 _averagePrice, bool _isLong, uint256 _nextPrice, uint256 _sizeDelta, uint256 _lastIncreasedTime) public view returns (uint256) {
        (bool hasProfit, uint256 delta) = vault.getDelta(_indexToken, _size, _averagePrice, _isLong, _lastIncreasedTime);
        uint256 nextSize = _size.add(_sizeDelta);
        uint256 divisor;
        if (_isLong) {
            divisor = hasProfit ? nextSize.add(delta) : nextSize.sub(delta);
        } else {
            divisor = hasProfit ? nextSize.sub(delta) : nextSize.add(delta);
        }
        return _nextPrice.mul(nextSize).div(divisor);
    }

    function getGlobalShortDelta(address _token) public view returns (bool, uint256) {
        uint256 size = vault.globalShortSizes(_token);
        if (size == 0) { return (false, 0); }

        uint256 nextPrice = vault.getMaxPrice(_token);
        uint256 averagePrice = vault.globalShortAveragePrices(_token);
        uint256 priceDelta = averagePrice > nextPrice ? averagePrice.sub(nextPrice) : nextPrice.sub(averagePrice);
        uint256 delta = size.mul(priceDelta).div(averagePrice);
        bool hasProfit = averagePrice > nextPrice;

        return (hasProfit, delta);
    }

    // for longs: nextAveragePrice = (nextPrice * nextSize)/ (nextSize + delta)
    // for shorts: nextAveragePrice = (nextPrice * nextSize) / (nextSize - delta)
    function getNextGlobalShortAveragePrice(address _indexToken, uint256 _nextPrice, uint256 _sizeDelta) public view returns (uint256) {
        uint256 size = vault.globalShortSizes(_indexToken);
        uint256 averagePrice = vault.globalShortAveragePrices(_indexToken);
        uint256 priceDelta = averagePrice > _nextPrice ? averagePrice.sub(_nextPrice) : _nextPrice.sub(averagePrice);
        uint256 delta = size.mul(priceDelta).div(averagePrice);
        bool hasProfit = averagePrice > _nextPrice;

        uint256 nextSize = size.add(_sizeDelta);
        uint256 divisor = hasProfit ? nextSize.sub(delta) : nextSize.add(delta);

        return _nextPrice.mul(nextSize).div(divisor);
    }

    function getDeltaV2(address _indexToken, uint256 _size, uint256 _averagePrice, bool _isLong, uint256 _lastIncreasedTime, uint256 price) public override view returns (bool, uint256) {
        require(_averagePrice > 0, "_averagePrice should >0");
        uint256 priceDelta = _averagePrice > price ? _averagePrice.sub(price) : price.sub(_averagePrice);
        uint256 delta = _size.mul(priceDelta).div(_averagePrice);

        bool hasProfit;

        if (_isLong) {
            hasProfit = price > _averagePrice;
        } else {
            hasProfit = _averagePrice > price;
        }

        // if the minProfitTime has passed then there will be no min profit threshold
        // the min profit threshold helps to prevent front-running issues
        uint256 minBps = block.timestamp > _lastIncreasedTime.add(vault.minProfitTime()) ? 0 : vault.minProfitBasisPoints(_indexToken);
        if (hasProfit && delta.mul(BASIS_POINTS_DIVISOR) <= _size.mul(minBps)) {
            delta = 0;
        }

        return (hasProfit, delta);
    }

    function getTargetUsdgAmount(address _token) public override view returns (uint256) {
        address usdg = vault.usdg();
        uint256 supply = IERC20(usdg).totalSupply();
        if (supply == 0) { return 0; }
        uint256 weight = vault.tokenWeights(_token);
        return weight.mul(supply).div(vault.totalTokenWeights());
    }

    function tokenToUsdMin(address _token, uint256 _tokenAmount) public override view returns (uint256) {
        if (_tokenAmount == 0) { return 0; }
        uint256 price = vault.getMinPrice(_token);
        uint256 decimals = vault.tokenDecimals(_token);
        return _tokenAmount.mul(price).div(10 ** decimals);
    }

    function usdToToken(address _token, uint256 _usdAmount, uint256 _price) public view returns (uint256) {
        if (_usdAmount == 0) { return 0; }
        uint256 decimals = vault.tokenDecimals(_token);
        return _usdAmount.mul(10 ** decimals).div(_price);
    }

    function processBuyUSDG(address _token, uint256 tokenAmount, address usdg) public onlyVault returns (uint256, uint256) {
        _validate(vault.whitelistedTokens(_token), 16);
        //useSwapPricing = true;
        _validate(tokenAmount > 0, 17);

        updateCumulativeFundingRate(_token, _token);

        uint256 price = vault.getMinPrice(_token);

        uint256 usdgAmount = tokenAmount.mul(price).div(PRICE_PRECISION);
        usdgAmount = vault.adjustForDecimals(usdgAmount, _token, usdg);
        _validate(usdgAmount > 0, 18);

        uint256 feeBasisPoints = getBuyUsdgFeeBasisPoints(_token, usdgAmount);

        return (price, feeBasisPoints);
    }

    function calcMarginFees(address _account, address _collateralToken, address _indexToken, bool _isLong, uint256 _sizeDelta, uint256 _size, uint256 _entryFundingRate) public view returns (uint256, uint256) {
        uint256 feeUsd = getPositionFee(_account, _collateralToken, _indexToken, _isLong, _sizeDelta);

        uint256 fundingFee = getFundingFee(_account, _collateralToken, _indexToken, _isLong, _size, _entryFundingRate);
        feeUsd = feeUsd.add(fundingFee);

        uint256 feeTokens = vault.usdToTokenMin(_collateralToken, feeUsd);

        return (feeUsd, feeTokens);
    }

    function getRedemptionCollateral(address _token) public view returns (uint256) {
        if (vault.stableTokens(_token)) {
            return vault.poolAmounts(_token);
        }
        uint256 collateral = vault.usdToTokenMin(_token, vault.guaranteedUsd(_token));
        return collateral.add(vault.poolAmounts(_token)).sub(vault.reservedAmounts(_token));
    }

    function getRedemptionCollateralUsd(address _token) public view returns (uint256) {
        return tokenToUsdMin(_token, getRedemptionCollateral(_token));
    }

    function validateTokens(address _collateralToken, address _indexToken, bool _isLong) public view {
        if (vault.syntheticTokens(_indexToken)) {
            _validateTokensSynthetic(_collateralToken, _indexToken, _isLong);
            return;
        }

        if (_isLong) {
            _validate(_collateralToken == _indexToken, 42);
            _validate(vault.whitelistedTokens(_collateralToken), 43);
            _validate(!vault.stableTokens(_collateralToken), 44);
            return;
        }

        _validate(vault.whitelistedTokens(_collateralToken), 45);
        _validate(vault.stableTokens(_collateralToken), 46);
        _validate(!vault.stableTokens(_indexToken), 47);
        _validate(vault.shortableTokens(_indexToken), 48);
    }

    function _validateTokensSynthetic(address _collateralToken, address _indexToken, bool _isLong) private view {
        _validate(vault.whitelistedTokens(_collateralToken), 56);
        _validate(vault.stableTokens(_collateralToken), 57);
        _validate(!vault.stableTokens(_indexToken), 58);
        _validate(vault.syntheticTokens(_indexToken), 59);        

        if (!_isLong) {
            _validate(vault.shortableTokens(_indexToken), 60);
        }
        _validate(_collateralToken != _indexToken, 61);
    }
    
    function setErrorController(address _errorController) external onlyGov {
        errorController = _errorController;
    }

    function setError(uint256 _errorCode, string calldata _error) external override {
        require(msg.sender == errorController, "VIEC");
        errors[_errorCode] = _error;
    }

    // we have this validation as a function instead of a modifier to reduce contract size
    function _validateGasPrice() private view {
        if (maxGasPrice == 0) { return; }
        _validate(tx.gasprice <= maxGasPrice, 55);
    }

    function _validate(bool _condition, uint256 _errorCode) private view {
        require(_condition, errors[_errorCode]);
    }
}
