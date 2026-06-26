// Zero-dependency diagnostic endpoint (uses native Node http.ServerResponse API).
// Tests whether Vercel can invoke ANY function at all.
export default function handler(req, res) {
  const authVars = Object.keys(process.env).filter(k =>
    /NEON|DATABASE|AUTH|STACK|POSTGRES/i.test(k)
  );
  res.setHeader('Content-Type', 'application/json');
  res.statusCode = 200;
  res.end(JSON.stringify({
    status: 'ok',
    node: process.version,
    env_keys_found: authVars,
  }));
}
