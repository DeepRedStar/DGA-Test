function ensureAuthenticated(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  return next();
}

function ensureRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user) return res.redirect('/login');
    if (!roles.includes(req.session.user.role)) return res.status(403).render('error', { message: 'Keine Berechtigung.' });
    return next();
  };
}

module.exports = { ensureAuthenticated, ensureRole };
