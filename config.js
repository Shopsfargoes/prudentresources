// config.js
// -----------------------------------------------------------------------
// Points the frontend at the Prudent Resources LLC WordPress backend.
// All requests route through the Vercel proxy (/api/proxy) to avoid
// any CORS issues on the WordPress host.
// -----------------------------------------------------------------------

const WP_CONFIG = {
  // Root of the WordPress REST API (used server-side by the proxy only).
  BASE_URL: "https://prudentresourcesllc.com/wp-json",

  // Vercel serverless proxy — all frontend fetch() calls go here.
  PROXY_URL: "/api/proxy",

  // Custom taxonomy slug used for strategy / allocation names.
  TAXONOMY: "investment_type",

  // ACF field names exposed on the user object via the REST API.
  FIELDS: {
    amountInvested: "amount_invested",   // Capital Commitment
    currentValue: "current_value",       // Current Account Value
    valueHistory: "value_history"
  },

  AUTH_TOKEN_KEY: "prudent_portal_token",

  ENDPOINTS: {
    token: "/jwt-auth/v1/token",
    me: "/wp/v2/users/me?context=edit",
    holdings: "/custom/v1/holdings"
  }
};
