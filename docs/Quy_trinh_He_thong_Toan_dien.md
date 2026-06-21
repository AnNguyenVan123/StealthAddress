# Toàn cảnh Quy trình Hoạt động Chi tiết của Ứng dụng Ví Stealth Address

Tài liệu này cung cấp luồng hoạt động chuyên sâu (deep-dive) của toàn bộ hệ thống ví, bao gồm các công thức mật mã học, tương tác Smart Contract và mạch Zero-Knowledge Proof (ZK-SNARK). Đây là tài liệu tham khảo chi tiết phù hợp để tích hợp vào Chương 3 của khóa luận.

Hệ thống kết hợp ba công nghệ lõi:
1. **Giao thức Stealth Address (ERC-5564)** dùng cho định tuyến và che giấu danh tính người nhận.
2. **Account Abstraction (ERC-4337)** cho phép triển khai ví dưới dạng Smart Contract và ủy quyền trả phí gas qua Relayer.
3. **Zero-Knowledge Proofs (ZK-SNARKs)** bảo vệ quyền riêng tư khi thực hiện chi tiêu (Spend) và khôi phục (Recovery).

---

## 1. Khởi tạo và Đăng ký Ví ẩn danh (Registration)
Mục đích: Khởi tạo cặp khóa mật mã làm cơ sở nhận tiền mà không tiết lộ số dư hoặc lịch sử giao dịch.

1. **Sinh khóa (Key Generation):** 
   Người dùng (ví dụ: Alice) sinh ra hai cặp khóa độc lập trên đường cong Elliptic (`secp256k1`):
   - **Viewing Key (Khóa xem):** Khóa riêng $k_v$ (scanPriv) và khóa công khai $K_v = k_v \cdot G$ (scanPub). Chức năng: Quét blockchain để tìm giao dịch.
   - **Spending Key (Khóa chi tiêu):** Khóa riêng $k_s$ (spendPriv) và khóa công khai $K_s = k_s \cdot G$ (spendPub). Chức năng: Rút tiền, sinh ZK proof.
2. **Tạo Stealth Meta-Address:** Từ $K_v$ và $K_s$, ứng dụng cấu tạo ra một địa chỉ siêu dữ liệu (Meta-address). Địa chỉ tĩnh này được công khai hoặc liên kết với ENS (ví dụ `alice.eth`).
3. **Khởi tạo Leaf trên hệ thống (Tuỳ chọn lúc tạo hoặc lúc nạp tiền):** 
   Ví gửi giá trị leaf $k = \text{Poseidon}(k_s)$ lên server (Relayer) off-chain để ghi nhận sự tồn tại vào cây Merkle. Server trả về vị trí `index`.

---

## 2. Gửi tiền ẩn danh (Stealth Transfer / Funding)
Mục đích: Người gửi (Sender - Bob) tính toán một địa chỉ dùng một lần (Stealth Address) để gửi tiền cho Alice.

1. **Tra cứu Meta-Address:** Bob lấy được Viewing Public Key ($K_v$) và Spending Public Key ($K_s$) của Alice.
2. **Sinh khóa tạm thời (Ephemeral Key):** Bob tự sinh một khóa ngẫu nhiên dùng một lần: Khóa riêng $r$ và Khóa công khai $R = r \cdot G$.
3. **Tính toán Bí mật chung (ECDH Shared Secret):**
   - Bob áp dụng ECDH: $S = r \cdot K_v$. Do tính chất giao hoán, Alice cũng có thể tính được $S = k_v \cdot R$.
   - Băm Shared Secret: $h_S = \text{Keccak256}(S)$.
4. **Tính toán Stealth Address:**
   - Khóa công khai dùng một lần của ví: $P = K_s + h_S \cdot G$.
   - Địa chỉ ví Ethereum (Stealth Address EOA) được suy ra từ $P$.
5. **Chuyển tiền và Phát sóng:** 
   - Bob gửi tài sản vào Stealth Address vừa được tạo.
   - Bob gọi hàm `announce(schemeId, stealthAddress, R, metadata)` trên hợp đồng `ERC5564Announcer.sol` để lưu vết khoá công khai $R$ lên mạng lưới.

---

## 3. Quét và Nhận diện tài sản (Scanning & Discovery)
Mục đích: Alice quét mạng lưới để nhận diện các khoản tiền gửi cho mình.

1. **Lắng nghe sự kiện:** Trình quét (Scanner) của Alice lắng nghe mọi sự kiện `Announcement` từ blockchain.
2. **View Tag Optimization:** Để giảm tải việc tính toán $P$ cho mỗi sự kiện, Scanner chỉ lấy byte đầu tiên của $h_S$ làm "View Tag". Nó tính nhánh $h_S$ từ $R$ của sự kiện: $S' = k_v \cdot R$. Nếu View Tag không khớp, bỏ qua sự kiện.
3. **Đối chiếu hoàn toàn:** Nếu View Tag khớp, Scanner tính toán đầy đủ $P = K_s + \text{Keccak256}(S') \cdot G$ và kiểm tra xem địa chỉ suy ra từ $P$ có trùng khớp với `stealthAddress` trong sự kiện không.
4. **Trích xuất Khóa:** Nếu khớp, Scanner xác định Private Key quản lý ví này là: $p = (k_s + \text{Keccak256}(S')) \pmod n$. 

---

## 4. Đăng ký lên Cây Merkle ZK (Tree Registration)
Mục đích: Smart Contract Wallet được triển khai và định danh vào cây Merkle để thực thi ZK Spend sau này.

1. Khi Stealth Address nhận được giao dịch chi tiêu đầu tiên (hoặc được tài trợ deploy), hợp đồng `StealthAccount` được triển khai thông qua Factory.
2. Tại hàm khởi tạo (`constructor`), ví lưu lại một giá trị `indexCommitment` duy nhất.
   - Công thức tính: $\text{indexCommitment} = \text{Poseidon}(\text{Poseidon}(index, 0) + sharedSecretHash)$.
   - Công thức này trói buộc Leaf của người dùng với vị trí cụ thể trên Merkle Tree.
3. Server (Bundler/Relayer) cập nhật `StealthTreeManager` thông qua bằng chứng `smt_update.circom`, đẩy Leaf $k$ vào gốc Merkle Root mới trên blockchain.

---

## 5. Chi tiêu ẩn danh (ZK Spend)
Mục đích: Rút tiền mà không tiết lộ Stealth Address thực sự thuộc về Meta-address nào.

1. **Khởi tạo bằng chứng Client-side (`stealth.circom`):**
   - **Private Inputs:** $k_s$ (`spendPriv`), $sharedSecretHash$, $pathIndices$, $merkleProof$.
   - **Public Inputs:** $root$, $indexCommitment$.
   - Mạch ZK kiểm tra hai điều kiện cốt lõi:
     - *Tính sở hữu:* Leaf $k = \text{Poseidon}(k_s)$ có thuộc về gốc Merkle $root$ hợp lệ không thông qua $merkleProof$ và $pathIndices$?
     - *Tính chính xác của ví:* Giá trị $indexCommitment$ có khớp chính xác với $\text{Poseidon}(\text{Poseidon}(pathIndices, 0) + sharedSecretHash)$ không?
2. **Ủy quyền thực thi (UserOperation):** Giao dịch được gói thành `UserOperation` và gửi cho Relayer (Server). Relayer sẽ chịu trách nhiệm trả phí gas.
3. **Xác minh On-chain (`StealthAccount.sol`):** 
   - Hàm `execute` hoặc `validateUserOp` nhận ZKP (`auth.a, auth.b, auth.c`).
   - Gọi hợp đồng `StealthSpendVerifier.sol` với tín hiệu công khai $[root, indexCommitment]$.
   - Nếu xác minh thành công, `StealthAccount` thực thi chuyển ETH/Token tới đích yêu cầu.

---

## 6. Khôi phục mạng lưới xã hội (Social Recovery)
Mục đích: Lấy lại quyền kiểm soát nếu người dùng mất Viewing/Spending Private Key gốc, dựa trên đồng thuận của những người bảo hộ.

1. **Đăng ký Guardians:** Lúc khởi tạo ví, người dùng thiết lập danh sách `isGuardian` và ngưỡng `Threshold` tại hợp đồng `SocialRecoveryModule.sol`, sau đó đăng ký module này với `StealthTreeManager` tại vị trí $index$ của mình.
2. **Khởi tạo yêu cầu (Propose Recovery):** 
   - Người dùng sinh bộ khóa mới (tương ứng với Leaf mới $newLeaf$).
   - Nhờ một Guardian gọi hàm `proposeRecovery(newRoot, newLeaf)` để gửi yêu cầu lên hệ thống. `newRoot` là rễ cây nếu cập nhật thay $oldLeaf$ bằng $newLeaf$.
3. **Phê duyệt (Approve):** Các Guardian khác gọi hàm `approveRecovery(reqId)`. Hệ thống theo dõi biến `approvals`.
4. **Thực thi cập nhật (Execute):** 
   - Khi `approvals \ge Threshold`, bất kỳ Guardian nào cũng có thể gọi `executeRecovery(reqId, auth)`.
   - Hàm này yêu cầu một ZK proof (`auth`) từ mạch `smt_update.circom` (chứng minh việc thay đổi $oldLeaf$ thành $newLeaf$ tại $index$ sẽ tạo ra $newRoot$).
   - `StealthTreeManager.sol` gọi Verifier để xác thực tính hợp lệ của toán học. Nếu đúng, $root$ được cập nhật thành $newRoot$. Việc khôi phục hoàn tất, người dùng kiểm soát tài sản qua khóa mới.
