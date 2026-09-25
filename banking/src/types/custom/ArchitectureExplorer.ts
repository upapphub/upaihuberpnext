export type ArchitectureNodeKind = "directory" | "file";
export type ArchitectureEdgeType = "contains" | "imports";

export interface ArchitectureNode {
	id: string;
	kind: ArchitectureNodeKind;
	path: string;
	label: string;
	depth: number;
	domain: string;
	language?: string;
	ext?: string;
	size?: number;
	updatedAt?: string;
}

export interface ArchitectureEdge {
	source: string;
	target: string;
	type: ArchitectureEdgeType;
}

export interface ArchitectureGraph {
	generatedAt: string;
	repoRoot: string;
	nodeCount: number;
	edgeCount: number;
	nodes: ArchitectureNode[];
	edges: ArchitectureEdge[];
}
