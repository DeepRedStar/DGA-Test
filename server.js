const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const path = require('path');
const morgan = require('morgan');
const helmet = require('helmet');
require('./database/init');

const { restrictToPrivateNetworks } = require('./middleware/network');
const authRoutes = require('./routes/authRoutes');
const appRoutes = require('./routes/appRoutes');

const app = express();
const isProd = process.env.NODE_ENV === 'production';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan('combined'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.set('trust proxy', 1);
app.use(restrictToPrivateNetworks);

app.use(
  session({
    store: new SQLiteStore({ db: 'sessions.sqlite', dir: path.join(__dirname, 'data') }),
    secret: process.env.SESSION_SECRET || 'change-me-in-prod',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict',
      maxAge: 1000 * 60 * 60 * 8
    }
  })
);

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

app.use(authRoutes);
app.use(appRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', { message: 'Interner Serverfehler' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`DGA läuft auf Port ${port}`);
});
