// Gmail integration (Replit connector)
import { google } from 'googleapis';

let gmailConnectionSettings: any;

function extractAccessToken(settings: any): string | undefined {
  return settings?.settings?.access_token || settings?.settings?.oauth?.credentials?.access_token;
}

async function getGmailAccessToken() {
  if (gmailConnectionSettings && gmailConnectionSettings.settings?.expires_at && new Date(gmailConnectionSettings.settings.expires_at).getTime() > Date.now()) {
    const cached = extractAccessToken(gmailConnectionSettings);
    if (cached) return cached;
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error('X-Replit-Token not found');
  }

  gmailConnectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-mail',
    {
      headers: {
        'Accept': 'application/json',
        'X-Replit-Token': xReplitToken
      }
    }
  ).then(res => res.json()).then((data: any) => data.items?.[0]);

  const accessToken = extractAccessToken(gmailConnectionSettings);

  if (!gmailConnectionSettings || !accessToken) {
    throw new Error('Gmail not connected');
  }
  return accessToken;
}

export async function getUncachableGmailClient() {
  const accessToken = await getGmailAccessToken();
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.gmail({ version: 'v1', auth: oauth2Client });
}

// Google Drive integration (Replit connectors-sdk proxy)
import { ReplitConnectors } from "@replit/connectors-sdk";

const connectors = new ReplitConnectors();

export async function driveProxyJson(endpoint: string, options?: { method?: string; body?: any }) {
  const response = await connectors.proxy("google-drive", endpoint, {
    method: options?.method || "GET",
    ...(options?.body ? { body: JSON.stringify(options.body) } : {}),
  });
  return response.json();
}

export async function driveProxyText(endpoint: string, options?: { method?: string }) {
  const response = await connectors.proxy("google-drive", endpoint, {
    method: options?.method || "GET",
  });
  return response.text();
}
