const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const VIMEO_AUTH_BASE = 'https://api.vimeo.com';
const VIMEO_AUTHORIZE_URL = 'https://api.vimeo.com/oauth/authorize';
const VIMEO_TOKEN_URL = `${VIMEO_AUTH_BASE}/oauth/access_token`;

// Validates that a returnTo value is a safe relative path (no open redirects).
function isSafeReturnTo(value) {
  if (!value || typeof value !== 'string') return false;
  // Must start with / but not // (protocol-relative URL) or /\
  return /^\/[^/\\]/.test(value) || value === '/';
}

// GET /auth/vimeo/start
// Initiates the OAuth Authorization Code flow.
router.get('/vimeo/start', (req, res) => {
  const clientId = process.env.VIMEO_CLIENT_ID;
  const redirectUri = process.env.VIMEO_REDIRECT_URI;
  const scopes = process.env.VIMEO_SCOPES || 'public private';

  if (!clientId || !redirectUri) {
    console.error('[auth-vimeo] Missing VIMEO_CLIENT_ID or VIMEO_REDIRECT_URI');
    return res.status(500).render('pages/error', {
      title: 'OAuth Not Configured',
      statusCode: 500,
      message: 'Vimeo OAuth is not fully configured on this server.',
    });
  }

  const returnTo = isSafeReturnTo(req.query.returnTo)
    ? req.query.returnTo
    : '/';
  const state = crypto.randomBytes(32).toString('hex');

  req.session.oauth = {
    state,
    stateExpiresAt: Date.now() + 10 * 60 * 1000,
    returnTo,
  };

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes,
    state,
  });

  console.log('[auth-vimeo] OAuth flow started');
  res.redirect(`${VIMEO_AUTHORIZE_URL}?${params}`);
});

// GET /auth/vimeo/callback
// Handles the redirect back from Vimeo after user grants/denies authorization.
router.get('/vimeo/callback', async (req, res) => {
  const { code, state, error } = req.query;
  const oauthSession = req.session.oauth;
  const returnTo =
    oauthSession && isSafeReturnTo(oauthSession.returnTo)
      ? oauthSession.returnTo
      : '/';

  // User denied authorization
  if (error) {
    console.log('[auth-vimeo] User denied authorization');
    req.session.oauth = null;
    return res.redirect(`${returnTo}?vimeo_auth=denied`);
  }

  // Missing code
  if (!code) {
    req.session.oauth = null;
    return res.status(400).render('pages/error', {
      title: 'Authorization Failed',
      statusCode: 400,
      message: 'Authorization code missing from Vimeo callback.',
    });
  }

  // Validate state — must match, must exist, must not be expired
  const stateValid =
    oauthSession &&
    oauthSession.state &&
    oauthSession.stateExpiresAt > Date.now() &&
    state === oauthSession.state;

  if (!stateValid) {
    req.session.oauth = null;
    return res.status(400).render('pages/error', {
      title: 'Authorization Failed',
      statusCode: 400,
      message:
        'Invalid or expired authorization state. Please try connecting again.',
    });
  }

  // Clear the one-time OAuth state immediately after validation
  req.session.oauth = null;

  // Exchange authorization code for access token (server-to-server)
  let tokenData;
  try {
    const credentials = Buffer.from(
      `${process.env.VIMEO_CLIENT_ID}:${process.env.VIMEO_CLIENT_SECRET}`,
    ).toString('base64');

    const tokenRes = await fetch(VIMEO_TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/vnd.vimeo.*+json;version=3.4',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.VIMEO_REDIRECT_URI,
      }),
    });

    if (!tokenRes.ok) {
      console.error(
        `[auth-vimeo] Token exchange failed: HTTP ${tokenRes.status}`,
      );
      return res.status(502).render('pages/error', {
        title: 'Authorization Failed',
        statusCode: 502,
        message:
          'Failed to exchange authorization code with Vimeo. Please try again.',
      });
    }

    tokenData = await tokenRes.json();
  } catch (err) {
    console.error('[auth-vimeo] Token exchange error:', err.message);
    return res.status(502).render('pages/error', {
      title: 'Authorization Failed',
      statusCode: 502,
      message:
        'Could not reach Vimeo to complete authorization. Please try again.',
    });
  }

  const accessToken = tokenData.access_token;
  if (!accessToken) {
    console.error('[auth-vimeo] Token exchange returned no access_token');
    return res.status(502).render('pages/error', {
      title: 'Authorization Failed',
      statusCode: 502,
      message: 'Vimeo did not return an access token. Please try again.',
    });
  }

  // Fetch safe user info using the new token
  let userInfo;
  try {
    const meRes = await fetch(`${VIMEO_AUTH_BASE}/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.vimeo.*+json;version=3.4',
      },
    });

    if (!meRes.ok) {
      console.error(`[auth-vimeo] /me fetch failed: HTTP ${meRes.status}`);
      return res.status(502).render('pages/error', {
        title: 'Authorization Failed',
        statusCode: 502,
        message: 'Could not retrieve your Vimeo profile. Please try again.',
      });
    }

    userInfo = await meRes.json();
  } catch (err) {
    console.error('[auth-vimeo] /me fetch error:', err.message);
    return res.status(502).render('pages/error', {
      title: 'Authorization Failed',
      statusCode: 502,
      message: 'Could not retrieve your Vimeo profile. Please try again.',
    });
  }

  // Regenerate session ID to prevent session fixation
  req.session.regenerate((err) => {
    if (err) {
      console.error('[auth-vimeo] Session regeneration error:', err.message);
      return res.status(500).render('pages/error', {
        title: 'Server Error',
        statusCode: 500,
        message: 'Something went wrong completing authorization.',
      });
    }

    req.session.vimeoAuth = {
      accessToken,
      userUri: userInfo.uri,
      userName: userInfo.name,
      userProfileLink: userInfo.link,
    };

    // Persist before redirecting — the browser's follow-up GET must be able to
    // read this session, so don't rely on the implicit save at response end.
    req.session.save((saveErr) => {
      if (saveErr) {
        console.error('[auth-vimeo] Session save error on connect:', saveErr.message);
        return res.status(500).render('pages/error', {
          title: 'Server Error',
          statusCode: 500,
          message: 'Something went wrong completing authorization.',
        });
      }

      console.log(`[auth-vimeo] Token exchange succeeded for ${userInfo.uri}`);
      res.redirect(returnTo);
    });
  });
});

// POST /auth/vimeo/logout
// Disconnects the user's Vimeo account from the current session.
router.post('/vimeo/logout', (req, res) => {
  const userUri = req.session?.vimeoAuth?.userUri;
  delete req.session.vimeoAuth;

  // Stop the development VIMEO_TOKEN fallback from re-connecting on the next
  // request, which would make this button look like it did nothing. Cleared
  // automatically on a real connect, since that regenerates the session.
  req.session.suppressDevToken = true;

  req.session.save((err) => {
    if (err)
      console.error('[auth-vimeo] Session save error on logout:', err.message);
    if (userUri) console.log(`[auth-vimeo] Logout for ${userUri}`);

    if (req.accepts('json') && !req.accepts('html')) {
      return res.json({ disconnected: true });
    }
    res.redirect('/');
  });
});

// GET /auth/vimeo/status
// Returns safe auth status — never exposes tokens.
router.get('/vimeo/status', (req, res) => {
  const auth = req.session?.vimeoAuth;
  if (auth) {
    return res.json({
      connected: true,
      userName: auth.userName,
      userUri: auth.userUri,
      userProfileLink: auth.userProfileLink,
    });
  }
  res.json({ connected: false });
});

module.exports = router;
