// Zero-dependency diagnostic endpoint.
// If /api/_debug works but /api/health doesn't, the crash is in api/[...path].js imports.
export default function handler(req, res) {
  const authVars = Object.keys(process.env).filter(k =>
    /NEON|DATABASE|AUTH|STACK|POSTGRES/i.test(k)
  );
  res.setHeader('Content-Type', 'application/json');
  res.status(200).end(JSON.stringify({
    status: 'ok',
    node: process.version,
    env_keys_found: authVars,
  }));
}
