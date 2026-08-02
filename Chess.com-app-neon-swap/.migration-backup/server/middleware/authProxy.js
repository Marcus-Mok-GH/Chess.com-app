import { neonAuth } from '../services/neonAuth.js';

export const neonAuthProxy = async (req, res) => {
  try {
    const url = new URL(req.url, \`http://\${req.headers.host}\`);
    const searchParams = url.searchParams;

    // Convert Headers object to a plain object
    const headers = {};
    for (const [key, value] of Object.entries(req.headers)) {
      headers[key] = value;
    }

    const response = await neonAuth.handler({
      method: req.method,
      path: req.path,
      query: Object.fromEntries(searchParams.entries()),
      headers: headers,
      body: req.body,
    });

    res.status(response.status).set(response.headers).send(response.body);
  } catch (error) {
    console.error('[NeonAuth Proxy] Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
