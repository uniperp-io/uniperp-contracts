// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import "../libraries/token/IERC20.sol";
import "../libraries/token/SafeERC20.sol";
import "../libraries/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract UnipDistributor is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;  

    IERC20 public token;

    address public signer;

    uint256 public constant MAX_ADDRESSES = 200_000;
    uint256 public constant INIT_CLAIM = 1_000 * 1e18;
    uint256 public constant MAX_REFER_TOKEN = 1_680_000 * 1e18;

    //for unfixed_amount and referrer reward
    uint256 public constant MAX_RUSH_TOKEN_AMOUNT = 12_000_000 * 1e18;
    uint256 public constant ULP_PRECISION = 1e18;

    mapping(uint256 => bool) public _usedNonce;
    mapping(address => bool) public _claimedUser;
    mapping(address => uint256) public inviteRewards;

    mapping(address => uint256) public claimableTokens;
    uint256 public totalRushAmount; //claimed from non-fixed user and reward for referrer
    uint256 public totalClaimedAmount;

    uint256 public claimedSupply = 0;
    uint256 public claimedCount = 0;
    uint256 public claimedPercentage = 0;
    uint256 public endTime;

    mapping(address => uint256) public inviteUsers;

    uint256 public referReward = 0;

    event Claim(address indexed user, uint128 nonce, uint256 amount, address referrer, uint timestamp);
    /// @notice recipient can claim this amount of tokens
    event CanClaim(address indexed recipient, uint256 amount);
    /// @notice recipient has claimed this amount of tokens
    event HasClaimed(address indexed recipient, uint256 amount);

    constructor() {
        endTime = block.timestamp + 35 days;
    }

    function canClaimAmount() public view returns(uint256) {
        if (_claimedUser[_msgSender()]) {
            return 0;
        }

        if (claimedCount >= MAX_ADDRESSES) {
            return 0;
        }

        uint256 supplyPerAddress = INIT_CLAIM;
        uint256 curClaimedCount = claimedCount + 1;
        uint256 claimedPercent = curClaimedCount * 100e6 / MAX_ADDRESSES;
        uint256 curPercent = 1e6;

        while (curPercent <= claimedPercent) {
            supplyPerAddress = (supplyPerAddress * 80) / 100;
            curPercent += 1e6;
        }

        return supplyPerAddress;
    }

    function claim(uint128 nonce, bytes calldata signature, address referrer) public nonReentrant {
        require(_usedNonce[nonce] == false, "Unip: nonce already used");
        require(_claimedUser[_msgSender()] == false, "Unip: already claimed");

        _claimedUser[_msgSender()] = true;
        require(isValidSignature(nonce, signature), "Unip: only auth claims");
        _usedNonce[nonce] = true;

        uint256 amount = 1;
        if (claimableTokens[_msgSender()] > 0) {
            amount = lpClaim();
        } else {
           uint256 supplyPerAddress = canClaimAmount();
            require(supplyPerAddress >= ULP_PRECISION, "Unip: airdrop has ended");

            amount = canClaimAmount();
            totalRushAmount = totalRushAmount + amount;
            require(totalRushAmount <= MAX_RUSH_TOKEN_AMOUNT, "Unip: rush tokens all has been claimed!");

            token.safeTransfer(_msgSender(), amount);

            claimedCount++;
            claimedSupply += supplyPerAddress;

            if (claimedCount > 0) {
                claimedPercentage = (claimedCount * 100) / MAX_ADDRESSES;
            }
        }
        totalClaimedAmount += amount;

        if (referrer != address(0) && referrer != _msgSender() && referReward < MAX_REFER_TOKEN) {
            uint256 num = amount * 100 / 1000;

            totalRushAmount = totalRushAmount + num;
            if (totalRushAmount <= MAX_RUSH_TOKEN_AMOUNT) {
                token.safeTransfer(referrer, num);
                totalClaimedAmount += num;
                inviteRewards[referrer] += num;
                inviteUsers[referrer]++;

                referReward += num;
            }
        }

        emit Claim(_msgSender(), nonce, amount, referrer, block.timestamp);
    }

    function setRecipients(address[] calldata _recipients, uint256[] calldata _claimableAmount) external onlyOwner() {
        require(_recipients.length == _claimableAmount.length, "TokenDistributor: invalid array length");

        for (uint256 i = 0; i < _recipients.length; i++) {
            // sanity check that the address being set is consistent
            require(claimableTokens[_recipients[i]] == 0, "TokenDistributor: recipient already set");
            claimableTokens[_recipients[i]] = _claimableAmount[i];
            emit CanClaim(_recipients[i], _claimableAmount[i]);
        }
    }

    function lpClaim() internal returns(uint256) {
        uint256 amount = claimableTokens[_msgSender()];
        require(amount > 0, "TokenDistributor: nothing to claim");
        claimableTokens[_msgSender()] = 0;

        // we don't use safeTransfer since impl is assumed to be OZ
        require(token.transfer(_msgSender(), amount), "TokenDistributor: fail token transfer");
        totalClaimedAmount += amount;
        emit HasClaimed(_msgSender(), amount);
        return amount;
    }

    function setSigner(address val) public onlyOwner() {
        require(val != address(0), "Unip: val is the zero address");
        signer = val;
    }

    function setToken(address _tokenAddress) public onlyOwner() {
        token = IERC20(_tokenAddress);
    }

    function isValidSignature(
        uint128 nonce,
        bytes memory signature
    ) view internal returns (bool) {
        bytes32 data = keccak256(abi.encode(address(this), _msgSender(), nonce));
        return signer == data.toEthSignedMessageHash().recover(signature);
    }

    function withdrawTokens() external nonReentrant onlyOwner() {
        require(block.timestamp >= endTime, "Airdrop not end");
        uint256 balance = token.balanceOf(address(this));
        token.safeTransfer(msg.sender, balance);
    }
}