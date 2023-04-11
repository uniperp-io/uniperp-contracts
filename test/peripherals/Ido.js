const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const helpers = require("@nomicfoundation/hardhat-network-helpers");
const { deployContract } = require("../shared/fixtures")
const { expandDecimals, bigNumberify, getBlockTime, increaseTime, mineBlock, reportGasUsed } = require("../shared/utilities")
const { initVault } = require("../core/Vault/helpers")
const { toChainlinkPrice } = require("../shared/chainlink")
const { toUsd, toNormalizedPrice } = require("../shared/units")

use(solidity)

const PRICE_PRECISION = ethers.BigNumber.from(10).pow(30);

describe("IdoFunction", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3] = provider.getWallets()
  let ido;
  let usdc;
  let unip;
  let startTime;
  let endTime;
  beforeEach(async () => {
    usdc = await deployContract("USDC", [])
    unip = await deployContract("UNIP", [])
    await unip.setMinter(wallet.address, true)

    ido = await deployContract("IDO", [])

    startTime = await getBlockTime(provider)
    endTime = startTime + 10
    console.log("ok1")

    await ido.initialize(unip.address,
        usdc.address,
        startTime,
        endTime,
        expandDecimals(10, 6),
        expandDecimals(50000000, 6)
    )
    console.log("ok2")

    await ido.setRate(1)
    console.log("ok3")

    await usdc.mint(user0.address, expandDecimals(10000000, 6))
    await usdc.connect(user0).approve(ido.address, expandDecimals(1000000, 6))

    await usdc.mint(wallet.address, expandDecimals(10000000, 6))
    await usdc.connect(wallet).approve(ido.address, expandDecimals(1000000, 6))

    await unip.mint(wallet.address, expandDecimals(11000000, 18))
    await unip.connect(wallet).approve(ido.address, expandDecimals(11000000, 18))
    await unip.connect(wallet).transfer(ido.address, expandDecimals(10000000, 18))
  })

  it("calculateTokenAmount", async () => {
    const usdcAmount = expandDecimals(20, 6)
    const rate = await ido.rate()
    const expected = usdcAmount.div(expandDecimals(1, 6)).mul(expandDecimals(1, 18)).mul(rate)
    const res = await ido.calculateTokenAmount(usdcAmount)
    expect(res).eq(expected)
  })

  it("buyTokens", async () => {
    let correntBlockTime = await getBlockTime(provider)
    console.log("startTime: ", startTime)
    console.log("endTime: ", endTime)
    console.log("correntBlockTime: ", correntBlockTime)

    await mineBlock(provider)
    await mineBlock(provider)
    correntBlockTime = await getBlockTime(provider)
    console.log("correntBlockTime: ", correntBlockTime)
    await expect(ido.connect(user0).buyTokens(expandDecimals(11, 6))).to.be.revertedWith("IDO time not match")

    await ido.connect(wallet).setEndTime(await getBlockTime(provider) + 1000)

    let toBuyUsdcAmount = expandDecimals(9, 6)
    await expect(ido.connect(user0).buyTokens(toBuyUsdcAmount)).to.be.revertedWith("Contribution not much")

    toBuyUsdcAmount = expandDecimals(50000001, 6)
    await expect(ido.connect(user0).buyTokens(toBuyUsdcAmount)).to.be.revertedWith("Contribution not much")

    toBuyUsdcAmount = expandDecimals(200, 6)
    console.log("user0 addr: ", user0.address)
    await ido.connect(user0).buyTokens(toBuyUsdcAmount)

    expect(await ido.contributions(user0.address)).eq(toBuyUsdcAmount)
    expect(await ido.totalContributed()).eq(toBuyUsdcAmount)

    const expectUnipAmount = toBuyUsdcAmount.div(expandDecimals(1, 6)).mul(expandDecimals(1, 18)).mul(await ido.rate())
    expect(await ido.purchasedAmounts(user0.address)).eq(expectUnipAmount)

    let moreBuyUsdcAmount = expandDecimals(300, 6)
    await ido.connect(wallet).buyTokens(moreBuyUsdcAmount)
    expect(await ido.totalContributed()).eq(toBuyUsdcAmount.add(moreBuyUsdcAmount))
    expect(await ido.contributions(wallet.address)).eq(moreBuyUsdcAmount)
  })

  it("claimTokens", async () => {
    await ido.connect(wallet).setEndTime(await getBlockTime(provider) + 3)
    console.log("endTime: ", await ido.endTime())

    let moreBuyUsdcAmount = expandDecimals(32311, 6)
    await ido.connect(user0).buyTokens(moreBuyUsdcAmount)
    expect(await ido.totalContributed()).eq(moreBuyUsdcAmount)

    const expectUnipAmount = moreBuyUsdcAmount.div(expandDecimals(1, 6)).mul(expandDecimals(1, 18)).mul(await ido.rate())
    expect(await ido.purchasedAmounts(user0.address)).eq(expectUnipAmount)

    console.log("claimInterval: ", await ido.claimInterval())
    await mineBlock(provider)
    await mineBlock(provider)
    console.log("correntBlockTime: ", await getBlockTime(provider))

    let newTimestamp = await getBlockTime(provider) + 60*60*24*7
    await helpers.time.setNextBlockTimestamp(newTimestamp);
    const beforeUnipAmount = await unip.balanceOf(user0.address)
    console.log("beforeUnipAmount: ", beforeUnipAmount)
    await ido.connect(user0).claimTokens()

    const expectUser0UnipAmount = expectUnipAmount.div(30)
    let afterUnipAmount = await unip.balanceOf(user0.address)
    console.log("afterUnipAmount: ", afterUnipAmount)
    expect(afterUnipAmount).eq(beforeUnipAmount.add(expectUser0UnipAmount))
    expect(await ido.connect(user0).remainTokens()).eq(expectUnipAmount.sub(expectUser0UnipAmount))

    for (let i = 0; i < 29; ++i) {
        newTimestamp = await getBlockTime(provider) + 60*60*24*7
        await helpers.time.setNextBlockTimestamp(newTimestamp);
        await ido.connect(user0).claimTokens()
        console.log("unip balance: ", await unip.balanceOf(user0.address), ", remainTokens: ", await ido.connect(user0).remainTokens())
    }

    afterUnipAmount = await unip.balanceOf(user0.address)
    expect(afterUnipAmount.add(await ido.connect(user0).remainTokens())).eq(expectUnipAmount)

  })

  it("withdrawUsdcTokens", async () => {
    console.log("startTime: ", startTime)
    console.log("endTime: ", endTime)
    await ido.connect(wallet).setEndTime(await getBlockTime(provider) + 3)
    console.log("endTime: ", await ido.endTime())

    let moreBuyUsdcAmount = expandDecimals(300, 6)
    await ido.connect(wallet).buyTokens(moreBuyUsdcAmount)
    expect(await ido.totalContributed()).eq(moreBuyUsdcAmount)

    const before = await usdc.balanceOf(wallet.address)
    console.log("before withdrawUsdcTokens: ", before)

    await mineBlock(provider)
    await mineBlock(provider)
    console.log("correntBlockTime: ", await getBlockTime(provider))

    await ido.connect(wallet).withdrawUsdcTokens()

    const after = await usdc.balanceOf(wallet.address)
    console.log("after withdrawUsdcTokens: ", after)

    const walletBalanceExpect = before.add(moreBuyUsdcAmount)
    expect(after).eq(walletBalanceExpect)
  })

  it("withdrawTokens", async () => {
    const balance = await unip.balanceOf(ido.address)
    const expectvAL = expandDecimals(10000000, 18)
    expect(balance).eq(expectvAL)

    const before = await unip.balanceOf(wallet.address)
    console.log("before withdrawTokens: ", before)
    await ido.withdrawTokens()
    const after = await unip.balanceOf(wallet.address)
    console.log("after withdrawTokens: ", after)

    const delta = after.sub(before)
    expect(balance).eq(delta)
  })
});
