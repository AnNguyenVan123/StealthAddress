import { ethers } from 'ethers';

/**
 * Attempt to decode a Solidity revert reason from raw bytes.
 * @param {string} data - Raw hex data from the revert
 * @returns {string|null}
 */
export function decodeRevert(data) {
    try {
        const abiCoder = ethers.AbiCoder.defaultAbiCoder();
        // Remove selector (first 4 bytes = 8 hex chars after "0x")
        const reason = abiCoder.decode(['string'], '0x' + data.slice(138));
        return reason[0];
    } catch {
        return null;
    }
}

/**
 * Build a structured error response object from an ethers/RPC error.
 * @param {Error} err
 * @returns {object}
 */
export function formatError(err) {
    const error = {
        message: err.message,
        code: err.code || 'UNKNOWN',
    };

    if (err.code === 'CALL_EXCEPTION') {
        error.type = 'CONTRACT_REVERT';
        error.reason = err.reason;
        error.decoded = err.data ? decodeRevert(err.data) : null;
    } else if (err.message?.includes('AA')) {
        error.type = 'AA_ERROR';
    } else if (err.code === 'NETWORK_ERROR' || err.code === 'SERVER_ERROR') {
        error.type = 'RPC_ERROR';
    }

    return error;
}

/**
 * Shorten a BigInt hash to 0x1234...abcd for console readability.
 * @param {BigInt|string|null} bigIntHash
 * @returns {string}
 */
export function shortHash(bigIntHash) {
    if (!bigIntHash) return 'empty';
    const hex = '0x' + BigInt(bigIntHash).toString(16).padStart(64, '0');
    return `${hex.slice(0, 10)}...${hex.slice(-8)}`;
}

/**
 * Decode a hex string to printable ASCII characters (strips padding/non-printable bytes).
 * @param {string} hexString
 * @returns {string}
 */
export function decodeHexToAscii(hexString) {
    if (!hexString || hexString === '0x') return '';
    const cleanHex = hexString.replace(/^0x/, '');
    let str = '';
    for (let i = 0; i < cleanHex.length; i += 2) {
        const charCode = parseInt(cleanHex.substr(i, 2), 16);
        // Only printable ASCII (32–126)
        if (charCode >= 32 && charCode <= 126) {
            str += String.fromCharCode(charCode);
        }
    }
    return str;
}

/**
 * Format a BigInt root as a 0x-padded 32-byte hex string.
 * @param {BigInt} root
 * @returns {string}
 */
export function rootToHex(root) {
    return '0x' + root.toString(16).padStart(64, '0');
}
