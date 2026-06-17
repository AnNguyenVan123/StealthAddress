export function formatError(e) {
    if (!e) return "Unknown error occurred.";
    const msg = (e.reason || e.message || String(e)).toLowerCase();
    
    if (msg.includes("user rejected") || msg.includes("denied transaction")) 
        return "Transaction was rejected by the user.";
    if (msg.includes("insufficient funds")) 
        return "Insufficient ETH for gas fees.";
    if (msg.includes("network") || msg.includes("timeout") || msg.includes("fetch")) 
        return "Network connection issue. Please check your connection.";
    if (msg.includes("unauthorized")) 
        return "Unauthorized action.";
    if (msg.includes("already registered") || msg.includes("taken")) 
        return "This name is already taken or registered.";
    if (msg.includes("revert")) 
        return "Transaction reverted by the smart contract.";
        
    return "An error occurred during the transaction. Please try again.";
}
