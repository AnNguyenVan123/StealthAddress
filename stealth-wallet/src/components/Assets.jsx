import { useAssets } from "../hooks/useAssets";

const shortenAddress = (addr) =>
    addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "";

export default function Assets({ meta }) {
    const { assets, isLoading, error } = useAssets(meta);

    if (isLoading) {
        return (
            <div className="flex items-center gap-2 text-gray-500 text-sm py-4">
                <span className="animate-spin h-4 w-4 border-2 border-gray-400 border-t-transparent rounded-full" />
                Loading assets...
            </div>
        );
    }

    if (error) {
        return <p className="text-red-500 text-sm py-4">{error}</p>;
    }

    if (assets.length === 0) {
        return <p className="text-gray-400 text-sm py-4">No stealth assets found.</p>;
    }

    return (
        <div className="space-y-2">
            <h3 className="text-lg font-semibold">Assets</h3>
            {assets.map(a => (
                <div
                    key={a.address}
                    className="flex justify-between items-center border border-gray-200 rounded-lg px-4 py-3 bg-white"
                >
                    <span className="text-sm font-mono text-blue-600" title={a.address}>
                        {shortenAddress(a.address)}
                    </span>
                    <span className="text-sm font-bold text-gray-800">{a.balance} ETH</span>
                </div>
            ))}
        </div>
    );
}