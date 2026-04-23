const { obfuscate } = require('./_obfuscator');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'SOLI Obfuscator API',
      version: '2.0',
      usage: 'POST { "code": "print(\'hello\')" }'
    });
  }

  if (req.method === 'POST') {
    try {
      const { code } = req.body;
      if (!code || typeof code !== 'string') {
        return res.status(400).json({ error: 'Invalid code' });
      }

      const output = obfuscate(code);

      return res.status(200).json({ success: true, output });
    } catch (e) {
      console.error('Error:', e);
      return res.status(500).json({ error: 'Server Error', message: e.message });
    }
  }

  res.setHeader('Allow', 'GET, POST, OPTIONS');
  return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
}
