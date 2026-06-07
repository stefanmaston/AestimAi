// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/UCIIndex.sol";

/**
 * Deploya UCIIndex på Base Sepolia (testnet) eller Base mainnet
 *
 * Kör med:
 *   forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast --verify
 *
 * Miljövariabler som krävs (.env):
 *   DEPLOYER_PRIVATE_KEY  — wallet som betalar gas
 *   UPDATER_ADDRESS       — adress som får pusha dagliga uppdateringar
 *   BASESCAN_API_KEY      — för verifiering av kontraktet på Basescan
 */
contract Deploy is Script {

    function run() external {
        uint256 deployerKey    = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address updaterAddress = vm.envAddress("UPDATER_ADDRESS");

        // Initiala indexvärden (UCI/valuta × 100)
        uint256 initSEK = 6240;   // 62.40 SEK
        uint256 initEUR =  552;   //  5.52 EUR
        uint256 initUSD =  598;   //  5.98 USD

        vm.startBroadcast(deployerKey);

        UCIIndex uciIndex = new UCIIndex(initSEK, initEUR, initUSD);
        console.log("UCIIndex deployed at:", address(uciIndex));

        // Lägg till backend-adressen som updater
        if (updaterAddress != address(0) && updaterAddress != vm.addr(deployerKey)) {
            uciIndex.addUpdater(updaterAddress);
            console.log("Updater added:", updaterAddress);
        }

        vm.stopBroadcast();

        // Spara kontraktsadress i en fil för backend-scriptet
        string memory output = string.concat(
            '{"contractAddress":"',
            vm.toString(address(uciIndex)),
            '","network":"base-sepolia","deployedAt":',
            vm.toString(block.timestamp),
            "}"
        );
        vm.writeFile("deployment.json", output);
        console.log("Deployment info saved to deployment.json");
    }
}
