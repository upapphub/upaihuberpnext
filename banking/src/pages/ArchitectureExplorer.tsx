import { useEffect, useMemo, useState } from "react";
import { HomeIcon, Loader2Icon, SearchIcon } from "lucide-react";
import { Link } from "react-router-dom";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Input } from "@/components/ui/input";
import type { ArchitectureGraph, ArchitectureNode } from "@/types/custom/ArchitectureExplorer";

type TreeNode = {
	name: string;
	path: string;
	isFile: boolean;
	children: Map<string, TreeNode>;
};

const createTreeNode = (name: string, path: string, isFile = false): TreeNode => ({
	name,
	path,
	isFile,
	children: new Map<string, TreeNode>(),
});

const buildTree = (paths: string[]) => {
	const root = createTreeNode("repo-root", ".");
	for (const rawPath of paths) {
		const parts = rawPath.split("/").filter(Boolean);
		let cursor = root;
		let consumed = "";
		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			consumed = consumed ? `${consumed}/${part}` : part;
			if (!cursor.children.has(part)) {
				cursor.children.set(part, createTreeNode(part, consumed, i === parts.length - 1));
			}
			cursor = cursor.children.get(part)!;
		}
	}
	return root;
};

const nodeTag = (node: ArchitectureNode) => {
	if (node.kind === "directory") return "DIR";
	if (node.language) return node.language.toUpperCase();
	return "FILE";
};

const ArchitectureExplorer = () => {
	const [graph, setGraph] = useState<ArchitectureGraph | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [query, setQuery] = useState("");
	const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		const fetchGraph = async () => {
			setLoading(true);
			setError(null);
			try {
				const response = await fetch("/assets/erpnext/banking/architecture-index.json", { cache: "no-store" });
				if (!response.ok) {
					throw new Error(`Unable to load architecture graph (${response.status})`);
				}
				const payload = (await response.json()) as ArchitectureGraph;
				if (!cancelled) {
					setGraph(payload);
					setSelectedNodeId(payload.nodes[0]?.id ?? null);
				}
			} catch (e) {
				if (!cancelled) {
					setError(e instanceof Error ? e.message : "Unknown error");
				}
			} finally {
				if (!cancelled) {
					setLoading(false);
				}
			}
		};
		void fetchGraph();
		return () => {
			cancelled = true;
		};
	}, []);

	const selectedNode = useMemo(
		() => graph?.nodes.find((node) => node.id === selectedNodeId) ?? null,
		[graph, selectedNodeId],
	);

	const filteredNodes = useMemo(() => {
		if (!graph) return [];
		const q = query.trim().toLowerCase();
		if (!q) return graph.nodes;
		return graph.nodes.filter((node) => {
			return (
				node.path.toLowerCase().includes(q) ||
				node.label.toLowerCase().includes(q) ||
				node.domain.toLowerCase().includes(q) ||
				(node.language ?? "").toLowerCase().includes(q)
			);
		});
	}, [graph, query]);

	const filePaths = useMemo(
		() => filteredNodes.filter((node) => node.kind === "file").map((node) => node.path),
		[filteredNodes],
	);

	const tree = useMemo(() => buildTree(filePaths), [filePaths]);

	const edgesForSelectedNode = useMemo(() => {
		if (!graph || !selectedNodeId) return { inbound: [], outbound: [] };
		const inbound = graph.edges.filter((edge) => edge.target === selectedNodeId);
		const outbound = graph.edges.filter((edge) => edge.source === selectedNodeId);
		return { inbound, outbound };
	}, [graph, selectedNodeId]);

	const renderTree = (node: TreeNode) => {
		const entries = Array.from(node.children.values()).sort((a, b) => {
			if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
			return a.name.localeCompare(b.name);
		});
		return (
			<ul className="ml-4 border-l border-gray-200 pl-3">
				{entries.map((entry) => {
					const nodeId = `file:${entry.path}`;
					return (
						<li key={entry.path} className="my-1">
							<button
								type="button"
								onClick={() => entry.isFile && setSelectedNodeId(nodeId)}
								className={`w-full rounded px-2 py-1 text-left text-sm ${
									selectedNodeId === nodeId
										? "bg-gray-200 text-gray-900"
										: entry.isFile
											? "hover:bg-gray-100 text-gray-700"
											: "text-gray-500"
								}`}
							>
								{entry.isFile ? "• " : "▸ "}
								{entry.name}
							</button>
							{entry.children.size > 0 ? renderTree(entry) : null}
						</li>
					);
				})}
			</ul>
		);
	};

	return (
		<div className="flex min-h-screen flex-col">
			<div className="border-b bg-white p-4">
				<Breadcrumb>
					<BreadcrumbList>
						<BreadcrumbItem>
							<a href="/desk" className="text-ink-gray-7">
								<HomeIcon size={16} />
							</a>
						</BreadcrumbItem>
						<BreadcrumbSeparator />
						<BreadcrumbItem>
							<BreadcrumbLink asChild>
								<Link to="/">Banking</Link>
							</BreadcrumbLink>
						</BreadcrumbItem>
						<BreadcrumbSeparator />
						<BreadcrumbItem>
							<BreadcrumbPage>Architecture Explorer</BreadcrumbPage>
						</BreadcrumbItem>
					</BreadcrumbList>
				</Breadcrumb>
				<div className="mt-4 flex flex-wrap items-center justify-between gap-3">
					<div>
						<h1 className="text-lg font-semibold">Full Repository Architecture</h1>
						<p className="text-sm text-gray-600">Read-only view of repository structure and dependencies.</p>
					</div>
					<div className="relative w-full max-w-sm">
						<SearchIcon className="absolute left-2 top-2.5 size-4 text-gray-400" />
						<Input
							className="pl-8"
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Filter by path, module, language, domain"
						/>
					</div>
				</div>
			</div>

			{loading ? (
				<div className="flex flex-1 items-center justify-center">
					<Loader2Icon className="size-6 animate-spin text-muted-foreground" />
				</div>
			) : error ? (
				<div className="m-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>
			) : (
				<div className="grid flex-1 grid-cols-12 gap-0">
					<section className="col-span-3 border-r p-3 overflow-auto">
						<div className="mb-2 text-xs font-semibold uppercase text-gray-500">Repository Tree</div>
						{renderTree(tree)}
					</section>

					<section className="col-span-6 border-r p-3 overflow-auto">
						<div className="mb-2 text-xs font-semibold uppercase text-gray-500">Dependency View</div>
						{selectedNode ? (
							<div className="space-y-5">
								<div className="rounded border p-3">
									<div className="text-sm font-semibold">{selectedNode.path}</div>
									<div className="mt-1 text-xs text-gray-600">Tag: {nodeTag(selectedNode)}</div>
								</div>
								<div className="grid grid-cols-2 gap-4">
									<div className="rounded border p-3">
										<h3 className="mb-2 text-sm font-semibold">Outbound (imports)</h3>
										<ul className="space-y-1 text-xs text-gray-700">
											{edgesForSelectedNode.outbound.slice(0, 200).map((edge, index) => (
												<li key={`${edge.target}-${index}`} className="break-all">
													→ {graph?.nodes.find((node) => node.id === edge.target)?.path ?? edge.target}
												</li>
											))}
											{edgesForSelectedNode.outbound.length === 0 ? <li>No outbound links.</li> : null}
										</ul>
									</div>
									<div className="rounded border p-3">
										<h3 className="mb-2 text-sm font-semibold">Inbound (used by)</h3>
										<ul className="space-y-1 text-xs text-gray-700">
											{edgesForSelectedNode.inbound.slice(0, 200).map((edge, index) => (
												<li key={`${edge.source}-${index}`} className="break-all">
													← {graph?.nodes.find((node) => node.id === edge.source)?.path ?? edge.source}
												</li>
											))}
											{edgesForSelectedNode.inbound.length === 0 ? <li>No inbound links.</li> : null}
										</ul>
									</div>
								</div>
							</div>
						) : (
							<div className="text-sm text-gray-500">Select a file to inspect dependencies.</div>
						)}
					</section>

					<section className="col-span-3 p-3 overflow-auto">
						<div className="mb-2 text-xs font-semibold uppercase text-gray-500">Node Details</div>
						{selectedNode ? (
							<div className="space-y-2 text-sm">
								<div>
									<div className="font-semibold">{selectedNode.label}</div>
									<div className="text-xs text-gray-600 break-all">{selectedNode.path}</div>
								</div>
								<div className="rounded border p-2">
									<div>Kind: {selectedNode.kind}</div>
									<div>Domain: {selectedNode.domain}</div>
									<div>Depth: {selectedNode.depth}</div>
									{selectedNode.language ? <div>Language: {selectedNode.language}</div> : null}
									{selectedNode.ext ? <div>Ext: {selectedNode.ext}</div> : null}
									{typeof selectedNode.size === "number" ? <div>Size: {selectedNode.size} bytes</div> : null}
									{selectedNode.updatedAt ? <div>Updated: {new Date(selectedNode.updatedAt).toLocaleString()}</div> : null}
								</div>
							</div>
						) : null}

						{graph ? (
							<div className="mt-5 rounded border p-2 text-xs text-gray-600">
								<div>Generated: {new Date(graph.generatedAt).toLocaleString()}</div>
								<div>Total Nodes: {graph.nodeCount}</div>
								<div>Total Edges: {graph.edgeCount}</div>
								<div>Filtered Nodes: {filteredNodes.length}</div>
							</div>
						) : null}
					</section>
				</div>
			)}
		</div>
	);
};

export default ArchitectureExplorer;
