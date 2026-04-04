import express from 'express';
import cors from 'cors';
import { PORT } from './config/index.js';
import { initTree, getCurrentRootHex } from './services/merkleService.js';

// ── Routes ────────────────────────────────────────────────────────────────────
import leavesRouter from './routes/leaves.js';
import treeRouter from './routes/tree.js';
import spendRouter from './routes/spend.js';

const app = express();

app.use(cors());
app.use(express.json());

// ── Mount routes ──────────────────────────────────────────────────────────────
app.use('/leaves', leavesRouter);
app.use('/', treeRouter);               // /tree, /proof/:leaf, /debug/visualize-tree
app.use('/api/spend-zk-proof', spendRouter);

// ── Bootstrap ─────────────────────────────────────────────────────────────────
initTree().then(() => {
    app.listen(PORT, () => {
        console.log(`[🚀] Stealth Server running on port ${PORT}`);
        console.log(`[🌳] Poseidon Tree Root: ${getCurrentRootHex()}`);
    });
});
