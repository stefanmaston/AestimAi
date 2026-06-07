// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/UCIIndex.sol";

contract UCIIndexTest is Test {

    UCIIndex public idx;
    address  public owner   = address(this);
    address  public updater = address(0xBEEF);
    address  public stranger = address(0xDEAD);

    function setUp() public {
        idx = new UCIIndex(6240, 552, 598);   // 62.40 SEK, 5.52 EUR, 5.98 USD
    }

    // ── Grundläggande läsning ─────────────────────────────

    function test_InitialValues() public view {
        (uint256 sek, uint256 eur, uint256 usd, uint256 ts) = idx.getCurrentRate();
        assertEq(sek, 6240);
        assertEq(eur, 552);
        assertEq(usd, 598);
        assertGt(ts, 0);
    }

    function test_HistoryStartsWithOne() public view {
        assertEq(idx.historyLength(), 1);
    }

    // ── Uppdatera index ───────────────────────────────────

    function test_OwnerCanUpdate() public {
        vm.warp(block.timestamp + 2 hours);
        idx.updateIndex(6300, 558, 604, "AestimAi-v1");
        (uint256 sek,,,) = idx.getCurrentRate();
        assertEq(sek, 6300);
    }

    function test_UpdaterCanUpdate() public {
        idx.addUpdater(updater);
        vm.prank(updater);
        vm.warp(block.timestamp + 2 hours);
        idx.updateIndex(6300, 558, 604, "AestimAi-v1");
        (uint256 sek,,,) = idx.getCurrentRate();
        assertEq(sek, 6300);
    }

    function test_StrangerCannotUpdate() public {
        vm.prank(stranger);
        vm.warp(block.timestamp + 2 hours);
        vm.expectRevert("UCIIndex: ej behorig uppdaterare");
        idx.updateIndex(6300, 558, 604, "hack");
    }

    function test_TooSoonUpdate() public {
        vm.expectRevert("UCIIndex: for tidig uppdatering");
        idx.updateIndex(6300, 558, 604, "AestimAi-v1");
    }

    function test_SanityCheckUpperBound() public {
        vm.warp(block.timestamp + 2 hours);
        vm.expectRevert("UCIIndex: for stor okning");
        idx.updateIndex(9999, 558, 604, "AestimAi-v1");
    }

    function test_SanityCheckLowerBound() public {
        vm.warp(block.timestamp + 2 hours);
        vm.expectRevert("UCIIndex: for stor minskning");
        idx.updateIndex(100, 10, 10, "AestimAi-v1");
    }

    // ── Historik ─────────────────────────────────────────

    function test_HistoryGrows() public {
        for (uint i = 0; i < 5; i++) {
            vm.warp(block.timestamp + 2 hours);
            idx.updateIndex(6240 + i * 10, 552, 598, "test");
        }
        assertEq(idx.historyLength(), 6);
    }

    function test_GetRecentHistory() public {
        vm.warp(block.timestamp + 2 hours);
        idx.updateIndex(6300, 558, 604, "v2");
        vm.warp(block.timestamp + 2 hours);
        idx.updateIndex(6350, 562, 608, "v3");

        UCIIndex.IndexSnapshot[] memory recent = idx.getRecentHistory(2);
        assertEq(recent.length, 2);
        assertEq(recent[0].rateSEK, 6300);
        assertEq(recent[1].rateSEK, 6350);
    }

    // ── Ägarskap ─────────────────────────────────────────

    function test_TransferOwnership() public {
        idx.transferOwnership(updater);
        assertEq(idx.owner(), updater);
    }

    function test_StrangerCannotTransferOwnership() public {
        vm.prank(stranger);
        vm.expectRevert("UCIIndex: ej agare");
        idx.transferOwnership(stranger);
    }

    function test_UpdateCount() public {
        assertEq(idx.updateCount(), 1);
        vm.warp(block.timestamp + 2 hours);
        idx.updateIndex(6300, 558, 604, "v2");
        assertEq(idx.updateCount(), 2);
    }
}
