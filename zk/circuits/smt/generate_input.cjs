const { buildPoseidon } = require("circomlibjs");
const fs = require("fs");

async function generate() {
    // Khởi tạo hàm Poseidon từ circomlibjs
    const poseidon = await buildPoseidon();
    const F = poseidon.F;

    // Các tham số đầu vào (Bạn có thể thay đổi các giá trị này)
    const levels = 20;
    const index = 5;            // Vị trí leaf trong cây SMT
    const oldLeaf = 12345n;     // Giá trị của leaf trước khi cập nhật
    const newLeaf = 67890n;     // Giá trị mới của leaf

    // Khởi tạo mảng siblings giả định (trong thực tế, đây là Merkle Proof lấy từ database/tree)
    // Để test circuit, chúng ta có thể dùng mảng chứa các số ngẫu nhiên hoặc 0
    const siblings = [];
    for (let i = 0; i < levels; i++) {
        siblings.push(BigInt(i + 1)); // Dùng index + 1 làm sibling giả định cho dễ nhìn
    }

    // Chuyển đổi index sang dạng nhị phân (Little-Endian / LSB first) để khớp với Num2Bits trong Circom
    const indexBits = index.toString(2).padStart(levels, '0').split('').reverse().map(Number);

    let currentOldHash = oldLeaf;
    let currentNewHash = newLeaf;

    // Mô phỏng lại vòng lặp tính Hash từ Leaf lên Root
    for (let i = 0; i < levels; i++) {
        const sibling = siblings[i];
        const bit = indexBits[i];

        let oldLeft, oldRight;
        let newLeft, newRight;

        // Logic của DualMux:
        // Nếu bit = 0: Node hiện tại nằm bên trái, sibling nằm bên phải
        // Nếu bit = 1: Sibling nằm bên trái, node hiện tại nằm bên phải
        if (bit === 0) {
            oldLeft = currentOldHash;
            oldRight = sibling;

            newLeft = currentNewHash;
            newRight = sibling;
        } else {
            oldLeft = sibling;
            oldRight = currentOldHash;

            newLeft = sibling;
            newRight = currentNewHash;
        }

        // Tính hash bằng Poseidon cho level tiếp theo
        currentOldHash = F.toObject(poseidon([oldLeft, oldRight]));
        currentNewHash = F.toObject(poseidon([newLeft, newRight]));
    }

    // Cấu trúc dữ liệu JSON input
    const input = {
        oldRoot: currentOldHash.toString(),
        newRoot: currentNewHash.toString(),
        oldLeaf: oldLeaf.toString(),
        siblings: siblings.map(s => s.toString()),
        leaf: newLeaf.toString(),
        index: index.toString()
    };

    // In ra console và lưu thành file input.json
    console.log(JSON.stringify(input, null, 2));
    fs.writeFileSync("input.json", JSON.stringify(input, null, 2));
    console.log("\n✅ Đã tạo file input.json thành công!");
}

generate().catch(err => {
    console.error(err);
    process.exit(1);
});