import { readFileSync } from 'node:fs';

function getWebserverPort() {
	try {
		const common_site_config = JSON.parse(
			readFileSync(new URL('../../../sites/common_site_config.json', import.meta.url), 'utf8')
		) as { webserver_port: string | number };
		return common_site_config.webserver_port;
	} catch {
		return 8000;
	}
}

const webserver_port = getWebserverPort();

export default {
	'^/(app|api|assets|files|private)': {
		target: `http://127.0.0.1:${webserver_port}`,
		ws: true,
		router: function (req) {
			const site_name = req.headers?.host?.split(':')[0];
			return `http://${site_name ?? 'localhost'}:${webserver_port}`;
		}
	}
};
