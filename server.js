(async () => {
  const express = require("express");
  const compression = require("compression");
  const fetch = require("node-fetch");
  const FormData = require("form-data");
  const http = require("http");
  const path = require("path");

  require("dotenv").config();
  const { STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET } = process.env;
  if (!STRAVA_CLIENT_ID) {
    throw "STRAVA_CLIENT_ID missing from env";
  }
  if (!STRAVA_CLIENT_SECRET) {
    throw "STRAVA_CLIENT_SECRET missing from env";
  }

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
    return formData;
  }

  const app = express();

  app.use(compression());

  app.enable("trust proxy"); // for herokuapp.com

  let PORT = process.env.PORT;

  // Origins that other front-ends (e.g. ride-merge) may authorize from - the
  // callback redirects back to whichever one started the flow, token in hand.
  // Comma-separated exact origins in ALLOWED_RETURN_ORIGINS; in development
  // any localhost origin is also allowed.
  const ALLOWED_RETURN_ORIGINS = (process.env.ALLOWED_RETURN_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const isDev = process.env.NODE_ENV !== "production";
  function isAllowedOrigin(origin) {
    if (ALLOWED_RETURN_ORIGINS.includes(origin)) return true;
    return isDev && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  }

  // CORS for cross-origin front-ends; same-origin (Strava Atlas itself) is
  // unaffected.
  app.use("/api", (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && isAllowedOrigin(origin)) {
      res.set("Access-Control-Allow-Origin", origin);
      res.set("Vary", "Origin");
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  const DEFAULT_SCOPE = "read,activity:read,activity:read_all";

  // Optional query params:
  //   return_to - absolute URL to send the token to after auth (must be on an
  //               allowed origin); defaults to this server's root
  //   scope     - Strava scopes to request; defaults to Strava Atlas's read-only set
  app.get("/api/redirect-to-auth", (req, res) => {
    const { return_to, scope } = req.query;
    if (return_to) {
      let origin;
      try {
        origin = new URL(return_to).origin;
      } catch {
        return res.status(400).send("bad return_to");
      }
      if (!isAllowedOrigin(origin)) {
        return res.status(400).send("return_to origin not allowed");
      }
    }

    let redirectURL = new URL("https://www.strava.com/oauth/authorize");
    addSearchParamsFromPairs(redirectURL, {
      client_id: STRAVA_CLIENT_ID,
      response_type: "code",
      redirect_uri: `${req.protocol}://${req.headers.host}/api/receive-auth-code`,
      approval_prompt: "force",
      scope: scope || DEFAULT_SCOPE,
      // Strava echoes `state` back to redirect_uri untouched.
      state: JSON.stringify({ return_to: return_to || null }),
    });
    res.redirect(redirectURL.toString());
  });

  app.get("/api/receive-auth-code", async (req, res) => {
    let redirectURL = new URL(`${req.protocol}://${req.headers.host}/`);

    // Re-validate: `state` comes back from the browser, so trust it no more
    // than the original query param.
    try {
      const { return_to } = JSON.parse(req.query.state || "{}");
      if (return_to && isAllowedOrigin(new URL(return_to).origin)) {
        redirectURL = new URL(return_to);
      }
    } catch {}

    const authCode = req.query.code;
    if (authCode) {
      const resp = await fetch("https://www.strava.com/oauth/token", {
        method: "POST",
        body: formDataFromPairs({
          grant_type: "authorization_code",
          client_id: STRAVA_CLIENT_ID,
          client_secret: STRAVA_CLIENT_SECRET,
          code: authCode,
        }),
      });
      let token = await resp.json();

      delete token.athlete;

      addSearchParamsFromPairs(redirectURL, {
        token: JSON.stringify(token),
      });
    }

    res.redirect(redirectURL.toString());
  });

  app.get("/api/submit-refresh-token", async (req, res) => {
    const refresh_token = req.query.refresh_token;

    const resp = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      body: formDataFromPairs({
        grant_type: "refresh_token",
        client_id: STRAVA_CLIENT_ID,
        client_secret: STRAVA_CLIENT_SECRET,
        refresh_token,
      }),
    });
    let token = await resp.json();
    res.send(token);
  });

  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== "production") {
    if (!PORT) {
      PORT = await require("portfinder").getPortPromise();
    }
    console.log(`running in development mode: http://localhost:${PORT}/`);

    const { createServer } = await import("vite");
    const vite = await createServer({
      server: { middlewareMode: true, hmr: { server: httpServer } },
      appType: "spa",
    });

    app.use(vite.middlewares);
  } else {
    if (!PORT) {
      console.error(
        "running in production mode, but no PORT env variable! exiting",
      );
      console.error("  [ did you mean to `npm run dev`? ]");
      process.exit(1);
    }
    console.log(`running in production mode on ${PORT}`);
    app.use(express.static(path.resolve(__dirname, "dist")));
  }

  httpServer.listen(PORT, function () {
    console.log("app.listen");
  });
})();
