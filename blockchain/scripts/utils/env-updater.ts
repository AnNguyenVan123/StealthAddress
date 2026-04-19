import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Updates or adds a key-value pair in a .env file.
 * @param filePath Path to the .env file.
 * @param updates Object containing the keys and values to update.
 */
export function updateEnvFile(filePath: string, updates: Record<string, string>) {
  if (!fs.existsSync(filePath)) {
    console.log(`Creating new .env file at ${filePath}`);
    const content = Object.entries(updates)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");
    fs.writeFileSync(filePath, content + "\n");
    return;
  }

  let content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  for (const [key, value] of Object.entries(updates)) {
    let found = false;
    for (let i = 0; i < lines.length; i++) {
      // Regex to match KEY=VALUE, accounting for comments and spaces
      if (lines[i].trim().startsWith(`${key}=`)) {
        lines[i] = `${key}=${value}`;
        found = true;
        break;
      }
    }

    if (!found) {
      lines.push(`${key}=${value}`);
    }
  }

  content = lines.join("\n");
  fs.writeFileSync(filePath, content);
  console.log(`Updated ${filePath}`);
}

/**
 * Automatically updates both Server and Client .env files with fresh contract addresses.
 */
export function updateProjectEnvs(addresses: {
  poseidon: string;
  treeManager: string;
  stealthFactory: string;
  announcer: string;
  verifier: string;
  smtVerifier: string;
  paymaster: string;
}) {
  const rootDir = path.resolve(__dirname, "../../../"); // blockchain/scripts/utils -> blockchain/scripts -> blockchain -> ROOT
  const serverEnvPath = path.join(rootDir, "server", ".env");
  const clientEnvPath = path.join(rootDir, "stealth-wallet", ".env");

  // Update Server .env
  updateEnvFile(serverEnvPath, {
    CONTRACT_ADDRESS: addresses.treeManager,
    VERIFIER_ADDRESS: addresses.verifier,
    SMT_VERIFIER_ADDRESS: addresses.smtVerifier,
    POSEIDON_ADDRESS: addresses.poseidon,
    PAYMASTER_ADDRESS: addresses.paymaster,
  });

  // Update Client .env
  updateEnvFile(clientEnvPath, {
    VITE_FACTORY_ADDRESS: addresses.stealthFactory,
    VITE_ANNOUNCER_ADDRESS: addresses.announcer,
    VITE_PAYMASTER_ADDRESS: addresses.paymaster,
  });

  console.log("✅ All .env files updated successfully!");
}
