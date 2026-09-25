import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const outputPath = path.join(__dirname, "public", "architecture-index.json");

const EXCLUDED_DIRS = new Set([
	".git",
	".cursor",
	".idea",
	".vscode",
	"node_modules",
	"dist",
	"build",
	"__pycache__",
	".pytest_cache",
	".ruff_cache",
	".mypy_cache",
	".venv",
	"venv",
	".bench",
	".next",
	".turbo",
	".parcel-cache",
	"coverage",
]);

const INCLUDED_EXTENSIONS = new Set([
	".py",
	".js",
	".jsx",
	".ts",
	".tsx",
	".json",
	".toml",
	".yml",
	".yaml",
	".md",
	".html",
	".css",
	".scss",
	".svg",
]);

const MAX_FILE_SIZE = 1_500_000;

function normalizePath(value) {
	return value.replaceAll(path.sep, "/");
}

function toNodeId(kind, relativePath) {
	return `${kind}:${relativePath}`;
}

function detectLanguage(ext) {
	switch (ext) {
		case ".py":
			return "python";
		case ".ts":
		case ".tsx":
			return "typescript";
		case ".js":
		case ".jsx":
			return "javascript";
		case ".json":
			return "json";
		case ".toml":
			return "toml";
		case ".yml":
		case ".yaml":
			return "yaml";
		case ".md":
			return "markdown";
		case ".html":
			return "html";
		case ".css":
		case ".scss":
			return "css";
		default:
			return "other";
	}
}

function detectDomain(relativePath) {
	if (relativePath.startsWith("erpnext/")) {
		const parts = relativePath.split("/");
		return parts[1] || "erpnext";
	}
	if (relativePath.startsWith("banking/")) {
		return "banking";
	}
	return "root";
}

function pythonModuleToPath(moduleName) {
	if (!moduleName) return null;
	return normalizePath(`${moduleName.replaceAll(".", "/")}.py`);
}

function parsePythonImports(content) {
	const targets = new Set();
	const importRegex = /^\s*import\s+([a-zA-Z0-9_.,\s]+)/gm;
	const fromRegex = /^\s*from\s+([a-zA-Z0-9_.]+)\s+import\s+/gm;

	for (const match of content.matchAll(importRegex)) {
		const modules = match[1]
			.split(",")
			.map((chunk) => chunk.trim().split(" ")[0])
			.filter(Boolean);
		for (const name of modules) {
			const mapped = pythonModuleToPath(name);
			if (mapped) targets.add(mapped);
		}
	}

	for (const match of content.matchAll(fromRegex)) {
		const mapped = pythonModuleToPath(match[1]?.trim());
		if (mapped) targets.add(mapped);
	}

	return Array.from(targets);
}

function parseJsTsImports(content) {
	const targets = new Set();
	const importRegex = /(?:import|export)\s+(?:[^'"]+?\s+from\s+)?['"]([^'"]+)['"]/g;
	const dynamicImportRegex = /import\(\s*['"]([^'"]+)['"]\s*\)/g;

	for (const match of content.matchAll(importRegex)) {
		if (match[1]) targets.add(match[1]);
	}
	for (const match of content.matchAll(dynamicImportRegex)) {
		if (match[1]) targets.add(match[1]);
	}

	return Array.from(targets);
}

function resolveJsImport(currentFile, specifier) {
	if (!specifier || !specifier.startsWith(".")) return null;
	const baseDir = path.dirname(currentFile);
	const candidate = path.resolve(baseDir, specifier);
	const attempts = [
		candidate,
		`${candidate}.ts`,
		`${candidate}.tsx`,
		`${candidate}.js`,
		`${candidate}.jsx`,
		path.join(candidate, "index.ts"),
		path.join(candidate, "index.tsx"),
		path.join(candidate, "index.js"),
		path.join(candidate, "index.jsx"),
	];

	for (const resolved of attempts) {
		const normalized = normalizePath(path.relative(repoRoot, resolved));
		if (!normalized.startsWith("..")) return normalized;
	}
	return null;
}

async function walk(dirPath, directories, files) {
	const entries = await fs.readdir(dirPath, { withFileTypes: true });
	for (const entry of entries) {
		const fullPath = path.join(dirPath, entry.name);
		const relativePath = normalizePath(path.relative(repoRoot, fullPath));
		if (relativePath.startsWith("..")) continue;

		if (entry.isDirectory()) {
			if (EXCLUDED_DIRS.has(entry.name)) continue;
			directories.push({ fullPath, relativePath });
			await walk(fullPath, directories, files);
			continue;
		}

		if (!entry.isFile()) continue;
		const ext = path.extname(entry.name).toLowerCase();
		if (!INCLUDED_EXTENSIONS.has(ext)) continue;

		files.push({ fullPath, relativePath, ext });
	}
}

async function main() {
	const directories = [{ fullPath: repoRoot, relativePath: "." }];
	const files = [];
	await walk(repoRoot, directories, files);

	const nodes = [];
	const edges = [];
	const fileNodeIds = new Set();

	for (const directory of directories) {
		const dirId = toNodeId("dir", directory.relativePath);
		const depth = directory.relativePath === "." ? 0 : directory.relativePath.split("/").length;
		nodes.push({
			id: dirId,
			kind: "directory",
			path: directory.relativePath,
			label: directory.relativePath === "." ? "repo-root" : path.basename(directory.relativePath),
			depth,
			domain: detectDomain(directory.relativePath),
		});

		if (directory.relativePath !== ".") {
			const parentRelative =
				directory.relativePath.includes("/")
					? directory.relativePath.split("/").slice(0, -1).join("/")
					: ".";
			edges.push({
				source: toNodeId("dir", parentRelative),
				target: dirId,
				type: "contains",
			});
		}
	}

	for (const file of files) {
		const stats = await fs.stat(file.fullPath);
		const fileId = toNodeId("file", file.relativePath);
		fileNodeIds.add(fileId);
		const depth = file.relativePath.split("/").length;

		nodes.push({
			id: fileId,
			kind: "file",
			path: file.relativePath,
			label: path.basename(file.relativePath),
			depth,
			ext: file.ext,
			language: detectLanguage(file.ext),
			domain: detectDomain(file.relativePath),
			size: stats.size,
			updatedAt: stats.mtime.toISOString(),
		});

		const parentDir = file.relativePath.includes("/") ? file.relativePath.split("/").slice(0, -1).join("/") : ".";
		edges.push({
			source: toNodeId("dir", parentDir),
			target: fileId,
			type: "contains",
		});
	}

	for (const file of files) {
		if (file.ext !== ".py" && file.ext !== ".js" && file.ext !== ".jsx" && file.ext !== ".ts" && file.ext !== ".tsx") {
			continue;
		}

		const stats = await fs.stat(file.fullPath);
		if (stats.size > MAX_FILE_SIZE) continue;

		const raw = await fs.readFile(file.fullPath, "utf8");
		const sourceId = toNodeId("file", file.relativePath);
		let imports = [];

		if (file.ext === ".py") {
			imports = parsePythonImports(raw);
		} else {
			imports = parseJsTsImports(raw)
				.map((specifier) => resolveJsImport(file.fullPath, specifier))
				.filter(Boolean);
		}

		for (const targetRelativePath of imports) {
			const targetId = toNodeId("file", targetRelativePath);
			if (!fileNodeIds.has(targetId)) continue;
			edges.push({
				source: sourceId,
				target: targetId,
				type: "imports",
			});
		}
	}

	await fs.mkdir(path.dirname(outputPath), { recursive: true });
	const payload = {
		generatedAt: new Date().toISOString(),
		repoRoot: normalizePath(repoRoot),
		nodeCount: nodes.length,
		edgeCount: edges.length,
		nodes,
		edges,
	};
	await fs.writeFile(outputPath, JSON.stringify(payload, null, 2), "utf8");
	console.log(`Architecture index written to ${outputPath}`);
	console.log(`Nodes: ${nodes.length} | Edges: ${edges.length}`);
}

main().catch((error) => {
	console.error("Failed to build architecture index.");
	console.error(error);
	process.exit(1);
});
