export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const response = await fetch('https://ve.dolarapi.com/v1/dolares');
    const data = await response.json();
    const bcv = data.find(d => d.fuente === 'oficial');
    const paralelo = data.find(d => d.fuente === 'paralelo');
    res.json({
      bcv: bcv?.promedio ?? null,
      usdt: paralelo?.promedio ?? null,
      fecha: new Date().toISOString()
    });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo obtener las tasas' });
  }
}
