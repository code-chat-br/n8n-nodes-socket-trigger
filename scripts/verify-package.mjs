import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
assert.match(pkg.name, /^n8n-nodes-[a-z0-9-]+$/);
assert.equal(pkg.name, 'n8n-nodes-socket-trigger');
assert.equal(pkg.private, undefined);
assert.equal(pkg.license, 'MIT');
assert.equal(Object.keys(pkg.dependencies ?? {}).length, 0);
assert(pkg.keywords.includes('n8n-community-node-package'));
assert.equal(pkg.peerDependencies['n8n-workflow'], '*');
const qualifiedType = `${pkg.name}.socketTrigger`;
const codex = JSON.parse(
	await readFile('dist/nodes/SocketTrigger/SocketTrigger.node.json', 'utf8'),
);
assert.equal(codex.node, qualifiedType);
const nodeClass = Object.values(require(resolve(pkg.n8n.nodes[0])))[0];
const credentialClass = Object.values(require(resolve(pkg.n8n.credentials[0])))[0];
const node = new nodeClass();
const credential = new credentialClass();
assert.equal(node.description.name, 'socketTrigger');
assert.equal(node.description.displayName, 'Socket Trigger');
assert.equal(credential.name, 'socketTriggerWebSocketApi');
assert.equal(node.description.credentials[0].name, credential.name);
assert(!pkg.keywords.includes('flow'));
for (const filename of ['codechat-bearer.workflow.json', 'generic-websocket.workflow.json']) {
	const workflow = JSON.parse(await readFile(`examples/${filename}`, 'utf8'));
	assert(workflow.nodes.some((entry) => entry.type === qualifiedType));
	assert(!JSON.stringify(workflow).includes('flowWebSocket'));
}
for (const path of [...pkg.n8n.nodes, ...pkg.n8n.credentials]) {
	await access(path);
	const classes = Object.values(require(resolve(path)));
	assert.equal(classes.length, 1);
	const instance = new classes[0]();
	const icons = (instance.description ?? instance).icon;
	for (const theme of ['light', 'dark']) {
		assert(icons[theme].startsWith('file:'));
		const svg = await readFile(resolve(dirname(path), icons[theme].slice(5)), 'utf8');
		assert(svg.includes('viewBox="0 0 64 64"'));
		assert(!/<script|<image|href=|onload=/i.test(svg));
	}
}
await access('dist/nodes/SocketTrigger/SocketTrigger.node.json');
await access('dist/nodes/SocketTrigger/transport/ws-LICENSE');
const transport = await readFile('dist/nodes/SocketTrigger/transport/session.js', 'utf8');
assert(!/require\(["']ws["']\)/.test(transport), 'The WebSocket library must be bundled');
for (const path of [
	'README.md',
	'LICENSE',
	'CHANGELOG.md',
	'docs/PUBLISHING.md',
	'examples/codechat-bearer.workflow.json',
])
	await access(path);
console.log('Package metadata, exports, theme icons, documentation and bundled license verified.');
