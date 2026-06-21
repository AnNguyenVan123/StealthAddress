# Quy trình thực hiện giao dịch (Spend) bằng Zero-Knowledge Proof (ZK Proof) và Khôi phục ví xã hội (Social Recovery)

Tài liệu này mô tả chi tiết hai quy trình quan trọng trong kiến trúc ví StealthAccount của hệ thống, dựa trên cấu trúc Smart Contract và mạch ZK (Circom) đã được triển khai trong thực tế mã nguồn.

---

## 1. Quy trình chi tiêu từ ví (Spend) bằng Zero-Knowledge Proof (ZK Proof)

Ví StealthAccount là một hợp đồng thông minh (Smart Contract Wallet) được tạo ra trên blockchain với một giá trị cố định `indexCommitment`. Để rút hoặc chuyển tiền (execute, executeStealthTransfer, ERC20, ERC721) từ ví này, người dùng (chủ sở hữu thực sự) cần cung cấp một ZK Proof hợp lệ mà không làm lộ khóa cá nhân của mình.

### Các thành phần trong mạch ZK (`stealth.circom`)

**Private Inputs (Đầu vào bí mật của người dùng):**
- `x`: Khóa cá nhân (spending private key).
- `sharedSecretHash`: Mã băm của shared secret (được sinh ra qua ECDH).
- `pathIndices`: Vị trí (index) của tài sản/ví trên Merkle Tree.
- `merkleProof`: Mảng các node chứng minh đường dẫn trên Merkle Tree (tùy thuộc độ sâu, ví dụ: 20 levels).

**Public Inputs (Đầu vào công khai trên Smart Contract):**
- `root`: Merkle Root hiện tại của toàn hệ thống (được quản lý bởi `StealthTreeManager`).
- `indexCommitment`: Một giá trị cam kết gắn liền với ví `StealthAccount` hiện tại, đóng vai trò định danh ví.

### Logic xác minh bên trong mạch ZK:
1. **Tính toán Leaf:** Tính giá trị `k = Poseidon(x)`. Đây chính là giá trị Leaf lưu trên Merkle Tree.
2. **Kiểm tra Index Commitment:** Mạch tính toán `commitment = Poseidon(Poseidon(pathIndices, 0) + sharedSecretHash)` và so sánh nghiêm ngặt giá trị này phải khớp với `indexCommitment` được truyền vào (Public Input).
3. **Kiểm tra Merkle Tree:** Sử dụng `MerkleTreeChecker` để chứng minh rằng Leaf `k` nằm đúng tại vị trí `pathIndices` và tạo thành `root` trùng khớp với `root` trên Smart Contract.

### Quy trình thực hiện trên Smart Contract (`StealthAccount.sol`):
1. **Gửi giao dịch:** Người dùng (thông qua Relayer hoặc trực tiếp) gọi các hàm chi tiêu như `execute`, `executeStealthTransfer`, v.v... kèm theo bằng chứng ZK (`ZKPAuth calldata auth` gồm các tham số `a`, `b`, `c`).
2. **Trích xuất thông tin:** Contract lấy giá trị `currentRoot` từ `StealthTreeManager` và sử dụng `indexCommitment` (được lưu sẵn tại constructor của ví).
3. **Xác minh Proof (`_verifyZKP`):** Contract gọi `verifier.verifyProof(auth.a, auth.b, auth.c, [currentRoot, indexCommitment])`. 
4. **Thực thi giao dịch:** Nếu ZK Proof trả về hợp lệ (đúng khóa cá nhân, khớp Merkle Root và khớp Index Commitment), ví sẽ thực hiện lệnh `call` để chuyển ETH, ERC20 hoặc ERC721 đến địa chỉ đích mà không cần chữ ký ECDSA truyền thống từ chủ sở hữu.

---

## 2. Quy trình Khôi phục ví xã hội (Social Recovery)

Hệ thống cung cấp cơ chế khôi phục thông qua hợp đồng `SocialRecoveryModule.sol` phối hợp cùng `StealthTreeManager.sol`. Cơ chế này cho phép một nhóm những người bảo hộ (Guardians) thay đổi cấu trúc cây Merkle (cụ thể là thay thế Leaf cũ bằng Leaf mới) nếu chủ sở hữu bị mất khóa.

### Các thành phần chính:
- **Guardians:** Danh sách các địa chỉ ví được phân quyền bảo hộ (`isGuardian`), được khởi tạo ngay khi tạo `SocialRecoveryModule`.
- **Threshold:** Số lượng chữ ký/phê duyệt tối thiểu từ Guardians để thực thi khôi phục.
- **StealthTreeManager:** Quản lý Merkle Tree on-chain và chỉ cho phép cập nhật Root khi có đủ điều kiện.

### Các bước thực hiện:

1. **Thiết lập ban đầu (Setup):**
   Khi deploy module khôi phục, hệ thống gán danh sách `Guardians`, `Threshold`, và `mappedIndex` (vị trí Leaf của người dùng trên Merkle Tree). Module này sau đó được đăng ký quyền cập nhật Leaf tại vị trí `mappedIndex` thông qua hàm `registerSocialContract` trên `StealthTreeManager`.

2. **Đề xuất khôi phục (`proposeRecovery`):**
   Khi người dùng mất khóa, họ nhờ một Guardian gọi hàm `proposeRecovery(bytes32 newRoot, bytes32 newLeaf)`. 
   - Hàm này tạo ra một `RecoveryRequest` mới mang một `reqId`.
   - Hệ thống lưu lại `newRoot` và `newLeaf` được đề xuất.
   - Guardian đề xuất sẽ tự động được ghi nhận là đã phê duyệt (Approve) yêu cầu này.

3. **Phê duyệt từ các Guardians khác (`approveRecovery`):**
   Các Guardians còn lại kiểm tra thông tin. Nếu đồng ý, họ gọi hàm `approveRecovery(reqId)`. 
   - Hàm kiểm tra xem Guardian này đã vote chưa. Nếu chưa, biến `approvals` của request sẽ tăng thêm 1.

4. **Thực thi khôi phục (`executeRecovery`):**
   Khi số lượng `approvals` đạt hoặc vượt qua `Threshold`, bất kỳ Guardian nào cũng có thể gọi hàm `executeRecovery(reqId, auth)` để chốt quá trình khôi phục.
   - Contract đánh dấu yêu cầu đã được thực thi (`executed = true`).
   - Contract gọi hàm `treeManager.updateRoot(req.newRoot, req.newLeaf, mappedIndex, auth)`.
   - **Xác minh ZK cho việc cập nhật cây:** Tại `StealthTreeManager`, hệ thống kiểm tra xem hàm gọi có đúng là từ `SocialContract` được phân quyền không, sau đó gọi tiếp mạch xác minh ZK (`smt_update.circom`) thông qua `verifier.verifyProof(...)` để chứng minh rằng `newRoot` được tạo ra hợp lệ từ việc thay đổi `newLeaf` tại vị trí `mappedIndex`.
   - Nếu xác minh thành công, `root` on-chain được cập nhật thành `newRoot`. Quyền sở hữu (thông qua Leaf mới) chính thức được chuyển sang khóa mới của người dùng.
