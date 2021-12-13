(async () => {
  const express = require('express');
  const fetch = require('node-fetch');
  const FormData = require('form-data');
  const { inspect } = require('util');
  const fs = require('fs');

  require('dotenv').config()
  const {STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET} = process.env;
  if (!STRAVA_CLIENT_ID) { throw "STRAVA_CLIENT_ID missing from env"; }
  if (!STRAVA_CLIENT_SECRET) { throw "STRAVA_CLIENT_SECRET missing from env"; }

  const indexTemplate = fs.readFileSync('public/index-template.html').toString();
  const index = indexTemplate.replace('<!-- EXTRA_HEAD -->', process.env.EXTRA_HEAD || '');
  fs.writeFileSync('public/index.html', index);

  function addSearchParamsFromPairs(url, pairs) {
    const searchParams = url.searchParams;
    for (let [key, value] of Object.entries(pairs)) {
      searchParams.append(key, value);
    }
  }

  function formDataFromPairs(pairs) {
    const formData = new FormData();
    for (let [key, value] of Object.entries(pairs)) {
      formData.append(key, value);
    }
    return formData
  }


  const app = express();

  app.enable('trust proxy')  // for herokuapp.com

  let PORT = process.env.PORT;

  if (process.env.NODE_ENV !== 'production') {
    if (!PORT) {
      PORT = await require('portfinder').getPortPromise();
    }
    console.log(`running in development mode: http://localhost:${PORT}/`);

    const config = require('./webpack.config.js');
    const compiler = require('webpack')(config);
    app.use(require('webpack-dev-middleware')(compiler));
    app.use(require('webpack-hot-middleware')(compiler));
  } else {
    if (!PORT) {
      console.error('running in production mode, but no PORT env variable! exiting')
      console.error('  [ did you mean to `yarn dev`? ]')
      process.exit(1)
    }
    console.log(`running in production mode on ${PORT}`);
  }

  app.use(express.static('public'));

  app.get('/api/redirect-to-auth', (req, res) => {
    let redirectURL = new URL('https://www.strava.com/oauth/authorize');
    addSearchParamsFromPairs(redirectURL, {
      client_id: STRAVA_CLIENT_ID,
      response_type: 'code',
      redirect_uri: `${req.protocol}://${req.headers.host}/api/receive-auth-code`,
      approval_prompt: 'force',
      scope: 'read,activity:read,activity:read_all',
    });
    res.redirect(redirectURL.toString());
  });

  app.get('/api/receive-auth-code', async (req, res) => {
    const authCode = req.query.code;
    const resp = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      body: formDataFromPairs({
        grant_type: 'authorization_code',
        client_id: STRAVA_CLIENT_ID,
        client_secret: STRAVA_CLIENT_SECRET,
        code: authCode,
      })
    })
    let token = await resp.json();

    delete token.athlete;

    let redirectURL = new URL(`${req.protocol}://${req.headers.host}/`);
    addSearchParamsFromPairs(redirectURL, {
      token: JSON.stringify(token),
    });
    res.redirect(redirectURL.toString());
  });


  app.get('/api/submit-refresh-token', async (req, res) => {
    const refresh_token = req.query.refresh_token;

    const resp = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      body: formDataFromPairs({
        grant_type: 'refresh_token',
        client_id: STRAVA_CLIENT_ID,
        client_secret: STRAVA_CLIENT_SECRET,
        refresh_token,
      })
    })
    let token = await resp.json();
    res.send(token);
  });


  app.listen(PORT, function () {
    console.log('app.listen');
  });
})();
