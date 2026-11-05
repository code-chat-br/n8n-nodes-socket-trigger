import { Resvg } from '@resvg/resvg-js';
import { readFile, writeFile } from 'node:fs/promises';

const load = async (theme) => {
	const svg = await readFile(`nodes/SocketTrigger/socket-trigger.${theme}.svg`, 'utf8');
	return svg
		.replace(/<svg[^>]*>/, '')
		.replace('</svg>', '')
		.replace(/<title>.*?<\/title>/s, '');
};
const [light, dark] = await Promise.all([load('light'), load('dark')]);
const preview = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="370" viewBox="0 0 800 370">
  <rect width="800" height="370" fill="#edf2f7"/>
  <text x="40" y="43" font-family="Segoe UI,Arial,sans-serif" font-size="15" font-weight="700" letter-spacing="2" fill="#17334d">SOCKET / WEBSOCKET TRIGGER</text>
  <rect x="32" y="70" width="356" height="265" rx="20" fill="#ffffff"/>
  <rect x="412" y="70" width="356" height="265" rx="20" fill="#1b1c23"/>
  <g fill="none" transform="translate(146 110) scale(2)">${light}</g>
  <g fill="none" transform="translate(526 110) scale(2)">${dark}</g>
  <text x="210" y="284" text-anchor="middle" font-family="Segoe UI,Arial,sans-serif" font-size="18" font-weight="600" fill="#17334d">Light theme</text>
  <text x="590" y="284" text-anchor="middle" font-family="Segoe UI,Arial,sans-serif" font-size="18" font-weight="600" fill="#e4f1fc">Dark theme</text>
  <text x="210" y="308" text-anchor="middle" font-family="Segoe UI,Arial,sans-serif" font-size="12" fill="#64748b">64 × 64 / SVG</text>
  <text x="590" y="308" text-anchor="middle" font-family="Segoe UI,Arial,sans-serif" font-size="12" fill="#94a3b8">64 × 64 / SVG</text>
</svg>`;
const png = new Resvg(preview, { font: { loadSystemFonts: true, defaultFontFamily: 'Segoe UI' } })
	.render()
	.asPng();
await writeFile('docs/icons-preview.png', png);
console.log('Rendered docs/icons-preview.png from both original SVG assets.');
