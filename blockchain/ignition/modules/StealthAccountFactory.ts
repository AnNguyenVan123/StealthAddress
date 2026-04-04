import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Ignition deploy module for StealthAccountFactory.
 * Run:  npx hardhat ignition deploy ignition/modules/StealthAccountFactory.ts --network sepolia
 */
const StealthAccountFactoryModule = buildModule(
  "StealthAccountFactoryModule",
  (m) => {
    const factory = m.contract("StealthAccountFactory", []);
    return { factory };
  }
);

export default StealthAccountFactoryModule;
