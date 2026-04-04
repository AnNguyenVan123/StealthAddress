export function convertProofToBigInt(auth) {
    return {
        a: auth.proofA.map(x => BigInt(x)),
        b: auth.proofB.map(row => row.map(x => BigInt(x))),
        c: auth.proofC.map(x => BigInt(x)),
    };
}
