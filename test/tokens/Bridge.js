const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { expandDecimals, getBlockTime, increaseTime, mineBlock, reportGasUsed } = require("../shared/utilities")

use(solidity)

describe("Bridge", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2, user3] = provider.getWallets()
  let unip
  let wunip
  let bridge

  beforeEach(async () => {
    unip = await deployContract("UNIP", [])
    wunip = await deployContract("UNIP", [])
    bridge = await deployContract("Bridge", [unip.address, wunip.address])
  })

  it("wrap, unwrap", async () => {
    await unip.setMinter(wallet.address, true)
    await unip.mint(user0.address, 100)
    await unip.connect(user0).approve(bridge.address, 100)
    await expect(bridge.connect(user0).wrap(200, user1.address))
      .to.be.revertedWith("BaseToken: transfer amount exceeds allowance")

    await expect(bridge.connect(user0).wrap(100, user1.address))
      .to.be.revertedWith("BaseToken: transfer amount exceeds balance")

    await wunip.setMinter(wallet.address, true)
    await wunip.mint(bridge.address, 50)

    await expect(bridge.connect(user0).wrap(100, user1.address))
      .to.be.revertedWith("BaseToken: transfer amount exceeds balance")

    await wunip.mint(bridge.address, 50)

    expect(await unip.balanceOf(user0.address)).eq(100)
    expect(await unip.balanceOf(bridge.address)).eq(0)
    expect(await wunip.balanceOf(user1.address)).eq(0)
    expect(await wunip.balanceOf(bridge.address)).eq(100)

    await bridge.connect(user0).wrap(100, user1.address)

    expect(await unip.balanceOf(user0.address)).eq(0)
    expect(await unip.balanceOf(bridge.address)).eq(100)
    expect(await wunip.balanceOf(user1.address)).eq(100)
    expect(await wunip.balanceOf(bridge.address)).eq(0)

    await wunip.connect(user1).approve(bridge.address, 100)

    expect(await unip.balanceOf(user2.address)).eq(0)
    expect(await unip.balanceOf(bridge.address)).eq(100)
    expect(await wunip.balanceOf(user1.address)).eq(100)
    expect(await wunip.balanceOf(bridge.address)).eq(0)

    await bridge.connect(user1).unwrap(100, user2.address)

    expect(await unip.balanceOf(user2.address)).eq(100)
    expect(await unip.balanceOf(bridge.address)).eq(0)
    expect(await wunip.balanceOf(user1.address)).eq(0)
    expect(await wunip.balanceOf(bridge.address)).eq(100)
  })

  it("withdrawToken", async () => {
    await unip.setMinter(wallet.address, true)
    await unip.mint(bridge.address, 100)

    await expect(bridge.connect(user0).withdrawToken(unip.address, user1.address, 100))
      .to.be.revertedWith("Governable: forbidden")

    await expect(bridge.connect(user0).setGov(user0.address))
      .to.be.revertedWith("Governable: forbidden")

    await bridge.connect(wallet).setGov(user0.address)

    expect(await unip.balanceOf(user1.address)).eq(0)
    expect(await unip.balanceOf(bridge.address)).eq(100)
    await bridge.connect(user0).withdrawToken(unip.address, user1.address, 100)
    expect(await unip.balanceOf(user1.address)).eq(100)
    expect(await unip.balanceOf(bridge.address)).eq(0)
  })
})
