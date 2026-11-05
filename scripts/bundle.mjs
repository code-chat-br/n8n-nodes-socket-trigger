import { build } from 'esbuild';
import { copyFile } from 'node:fs/promises';

// Only the transport has a runtime ws import. Bundle it so installations need no runtime dependency.
await build({
	entryPoints: ['dist/nodes/SocketTrigger/transport/session.js'],
	outfile: 'dist/nodes/SocketTrigger/transport/session.js',
	allowOverwrite: true,
	bundle: true,
	platform: 'node',
	format: 'cjs',
	target: 'node22',
	external: ['bufferutil', 'utf-8-validate'],
	sourcemap: true,
	legalComments: 'eof',
});
await copyFile(
	'nodes/SocketTrigger/SocketTrigger.node.json',
	'dist/nodes/SocketTrigger/SocketTrigger.node.json',
);
await copyFile('node_modules/ws/LICENSE', 'dist/nodes/SocketTrigger/transport/ws-LICENSE');
console.log('Bundled WebSocket transport, node metadata and third-party license.');
