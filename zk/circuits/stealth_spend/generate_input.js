const { buildPoseidon } = require("circomlibjs");
const fs = require("fs");

async function generate() {
    // Khởi tạo hàm băm Poseidon
    const poseidon = await buildPoseidon();
    const F = poseidon.F; // Field object để convert định dạng số

    // 1. Định nghĩa các Private Inputs (Giả định)
    const x = 123456789n;                // Spending private key
    const sharedSecretHash = 987654321n;  // Hash of shared secret
    const pathIndices = 0n;              // Index trong Merkle Tree (chọn 0 cho dễ test)
    const levels = 20;

    // 2. Tính k = Poseidon(x)
    const k = poseidon([x]);

    // 3. Tính indexCommitment = Poseidon(Poseidon(pathIndices, 0), sharedSecretHash)
    const indexHash = poseidon([pathIndices, 0n]);
    const indexCommitment = poseidon([indexHash, sharedSecretHash]);

    // 4. Giả lập Merkle Proof và tính Root
    const merkleProof = [];
    let currentHash = k;

    // Xây dựng đường đi Merkle Tree từ dưới lên (20 levels)
    for (let i = 0; i < levels; i++) {
        // Giả sử các nhánh anh em (siblings) đều có giá trị băm là 1
        const sibling = 1n;
        merkleProof.push(sibling);

        // Vì pathIndices = 0, currentHash luôn nằm ở nhánh trái (in[0] trong DualMux)
        // Nếu pathIndices có các bit 1, vị trí trái/phải sẽ đảo ngược tùy theo bit
        currentHash = poseidon([currentHash, sibling]);
    }

    const root = currentHash;

    // 5. Gom dữ liệu lại thành JSON
    const inputJson = {
        root: F.toString(root),
        indexCommitment: F.toString(indexCommitment),
        x: x.toString(),
        sharedSecretHash: sharedSecretHash.toString(),
        merkleProof: merkleProof.map(m => m.toString()),
        pathIndices: pathIndices.toString()
    };

    // Ghi ra file
    fs.writeFileSync("input.json", JSON.stringify(inputJson, null, 2));
    console.log("✅ Đã tạo file input.json thành công!");
    console.log(inputJson);
}

generate().catch(err => {
    console.error(err);
    process.exit(1);
});