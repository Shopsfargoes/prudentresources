// api/proxy.js
// Vercel serverless proxy — forwards requests to the Prudent Resources
// WordPress backend server-to-server, avoiding any browser CORS issues.

const WP_BASE = 'https://prudentresourcesllc.com/wp-json';

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const path = req.query.path;

    if (!path) {
        return res.status(400).json({ error: 'Missing path parameter' });
    }

    const wpUrl = `${WP_BASE}${path}`;

    try {
        const forwardHeaders = { 'Content-Type': 'application/json' };
        if (req.headers.authorization) {
            forwardHeaders['Authorization'] = req.headers.authorization;
        }

        const wpResponse = await fetch(wpUrl, {
            method: req.method === 'OPTIONS' ? 'GET' : req.method,
            headers: forwardHeaders,
            body: req.method === 'POST' ? JSON.stringify(req.body) : undefined,
        });

        const text = await wpResponse.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch {
            data = { raw: text };
        }

        return res.status(wpResponse.status).json(data);
    } catch (err) {
        console.error('Proxy error:', err);
        return res.status(500).json({ error: 'Proxy request failed', detail: err.message, wpUrl });
    }
};
