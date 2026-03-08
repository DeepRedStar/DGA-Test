const privateRanges = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^::1$/,
  /^fc/i,
  /^fd/i
];

function getIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return xff.split(',')[0].trim();
  return req.ip || req.connection.remoteAddress || '';
}

function restrictToPrivateNetworks(req, res, next) {
  const ip = getIp(req).replace('::ffff:', '');
  if (privateRanges.some((re) => re.test(ip))) return next();
  return res.status(403).send('Zugriff nur aus privaten Netzwerken erlaubt.');
}

module.exports = { restrictToPrivateNetworks, getIp };
