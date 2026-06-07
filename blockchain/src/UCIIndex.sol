// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title UCIIndex
 * @notice Universal Commerce Index — on-chain oracle på Base
 *
 * Håller aktuellt UCI-indexvärde och historik.
 * Värdet representeras som ett heltal × 100 för att undvika
 * decimaltal i Solidity: 6240 = 62.40 SEK per 1 UCI
 *
 * Ägarskap:
 *   - owner: kan överföra ägarskap
 *   - updaters: adresser som får pusha index-uppdateringar
 *     (t.ex. AestimAi backend multisig)
 */
contract UCIIndex {

    // ── Datastrukturer ──────────────────────────────────────

    struct IndexSnapshot {
        uint256 rateSEK;    // UCI/SEK × 100  (6240 = 62.40 SEK)
        uint256 rateEUR;    // UCI/EUR × 100  ( 552 =  5.52 EUR)
        uint256 rateUSD;    // UCI/USD × 100  ( 598 =  5.98 USD)
        uint256 timestamp;
        string  source;     // "AestimAi-v1" eller oracle-identifierare
    }

    // ── State ───────────────────────────────────────────────

    address public owner;
    mapping(address => bool) public updaters;

    IndexSnapshot public current;
    IndexSnapshot[] public history;       // fullständig historik
    uint256 public updateCount;

    uint256 public constant MAX_HISTORY = 365;   // max 1 år historik on-chain
    uint256 public constant MIN_UPDATE_INTERVAL = 1 hours;

    // ── Events ──────────────────────────────────────────────

    event IndexUpdated(
        uint256 indexed updateId,
        uint256 rateSEK,
        uint256 rateEUR,
        uint256 rateUSD,
        uint256 timestamp,
        address updatedBy
    );

    event UpdaterAdded(address indexed updater);
    event UpdaterRemoved(address indexed updater);
    event OwnershipTransferred(address indexed from, address indexed to);

    // ── Modifiers ───────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "UCIIndex: ej agare");
        _;
    }

    modifier onlyUpdater() {
        require(
            updaters[msg.sender] || msg.sender == owner,
            "UCIIndex: ej behorig uppdaterare"
        );
        _;
    }

    // ── Constructor ─────────────────────────────────────────

    constructor(
        uint256 initialRateSEK,
        uint256 initialRateEUR,
        uint256 initialRateUSD
    ) {
        owner = msg.sender;
        updaters[msg.sender] = true;

        // Sätt initialt indexvärde
        IndexSnapshot memory snap = IndexSnapshot({
            rateSEK:   initialRateSEK,
            rateEUR:   initialRateEUR,
            rateUSD:   initialRateUSD,
            timestamp: block.timestamp,
            source:    "AestimAi-v1-genesis"
        });

        current = snap;
        history.push(snap);
        updateCount = 1;

        emit IndexUpdated(0, initialRateSEK, initialRateEUR, initialRateUSD, block.timestamp, msg.sender);
    }

    // ── Uppdatera index ─────────────────────────────────────

    /**
     * @notice Pusha ett nytt UCI-indexvärde
     * @param rateSEK  UCI/SEK × 100 (t.ex. 6240 för 62.40 SEK)
     * @param rateEUR  UCI/EUR × 100
     * @param rateUSD  UCI/USD × 100
     * @param source   Identifierare för källa/version
     */
    function updateIndex(
        uint256 rateSEK,
        uint256 rateEUR,
        uint256 rateUSD,
        string calldata source
    ) external onlyUpdater {
        require(rateSEK > 0 && rateEUR > 0 && rateUSD > 0, "UCIIndex: nollvarde ej tillatet");
        require(
            block.timestamp >= current.timestamp + MIN_UPDATE_INTERVAL,
            "UCIIndex: for tidig uppdatering"
        );

        // Sanity check — max ±50% avvikelse per uppdatering
        uint256 prevSEK = current.rateSEK;
        require(rateSEK <= prevSEK * 150 / 100, "UCIIndex: for stor okning");
        require(rateSEK >= prevSEK * 50  / 100, "UCIIndex: for stor minskning");

        IndexSnapshot memory snap = IndexSnapshot({
            rateSEK:   rateSEK,
            rateEUR:   rateEUR,
            rateUSD:   rateUSD,
            timestamp: block.timestamp,
            source:    source
        });

        current = snap;

        // Rullande historik — ta bort äldsta om vi når max
        if (history.length >= MAX_HISTORY) {
            // Shift: flytta alla ett steg (dyrt men sällan nödvändigt)
            for (uint256 i = 0; i < history.length - 1; i++) {
                history[i] = history[i + 1];
            }
            history.pop();
        }
        history.push(snap);

        emit IndexUpdated(
            updateCount,
            rateSEK,
            rateEUR,
            rateUSD,
            block.timestamp,
            msg.sender
        );
        updateCount++;
    }

    // ── Läsmetoder ──────────────────────────────────────────

    /// @notice Aktuellt indexvärde i läsbart format
    function getCurrentRate() external view returns (
        uint256 rateSEK,
        uint256 rateEUR,
        uint256 rateUSD,
        uint256 timestamp
    ) {
        return (
            current.rateSEK,
            current.rateEUR,
            current.rateUSD,
            current.timestamp
        );
    }

    /// @notice Antal historiska snapshots
    function historyLength() external view returns (uint256) {
        return history.length;
    }

    /// @notice Hämta en historisk snapshot
    function getSnapshot(uint256 index) external view returns (IndexSnapshot memory) {
        require(index < history.length, "UCIIndex: index utanfor intervall");
        return history[index];
    }

    /// @notice Hämta de senaste n snapshotsen
    function getRecentHistory(uint256 n) external view returns (IndexSnapshot[] memory) {
        uint256 len   = history.length;
        uint256 count = n < len ? n : len;
        IndexSnapshot[] memory result = new IndexSnapshot[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = history[len - count + i];
        }
        return result;
    }

    // ── Administration ──────────────────────────────────────

    function addUpdater(address addr) external onlyOwner {
        updaters[addr] = true;
        emit UpdaterAdded(addr);
    }

    function removeUpdater(address addr) external onlyOwner {
        updaters[addr] = false;
        emit UpdaterRemoved(addr);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "UCIIndex: noll-adress");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}
