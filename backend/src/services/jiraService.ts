import axios from 'axios';

export type SessionCredentials = { baseUrl: string; authHeader: string };

type StorySummary = { key: string; summary: string };
type StoryDetails = {
  key: string;
  title: string;
  description?: string;         // plain text (AC removed if it lived in description)
  acceptanceCriteria?: string;  // plain text bullets
};

function requireConnection(creds?: SessionCredentials) {
  if (!creds || !creds.baseUrl || !creds.authHeader) throw new Error('Not connected to Jira');
}

async function request<T>(creds: SessionCredentials, url: string, params?: Record<string, any>) {
  const resp = await axios.get<T>(url, {
    params,
    headers: {
      'Authorization': creds.authHeader,
      'Accept': 'application/json'
    }
  });
  return resp.data;
}

/* ----------------------- Issuetype discovery (fix) ----------------------- */
/** Returns all issue type names on the site that look like "story" (case-insensitive).
 * If none are found, falls back to ["Story"] so JQL never breaks on sites without "User Story". */
async function getStoryTypeNames(creds: SessionCredentials): Promise<string[]> {
  const url = `${creds.baseUrl}/rest/api/3/issuetype`;
  const all = await request<any[]>(creds, url);
  const names = (all || [])
    .map(t => String(t?.name || '').trim())
    .filter(Boolean);
  const storyish = Array.from(new Set(names.filter(n => /story/i.test(n))));
  return storyish.length ? storyish : ['Story'];
}

/* -------------------- HTML -> plain text helpers ------------------- */

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)));
}

function htmlToPlain(html: string): string {
  if (!html) return '';
  let out = html;

  // normalize bullets & breaks before stripping tags
  out = out.replace(/<\/li>\s*<li>/gi, '</li>\n<li>');
  out = out.replace(/<li[^>]*>/gi, '\n- ');
  out = out.replace(/<\/li>/gi, '');
  out = out.replace(/<br\s*\/?>/gi, '\n');
  out = out.replace(/<\/p>\s*<p[^>]*>/gi, '\n\n');
  out = out.replace(/<p[^>]*>/gi, '');
  out = out.replace(/<\/p>/gi, '\n');

  // strip remaining tags
  out = out.replace(/<[^>]+>/g, '');

  // decode & clean
  out = decodeHtmlEntities(out)
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return out;
}

/** Find a section whose HEADING text contains the given regex (e.g., /Acceptance\s*Criteria/i).
 * Works even if heading text is nested (e.g., <h3><strong>Acceptance Criteria</strong></h3>).
 * Returns { sectionHtml, withoutSectionHtml } or null if not found. */
function extractSectionByHeading(html: string, contains: RegExp) {
  if (!html) return null;
  const headingRegex = /<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/gi;
  const headings: { start: number; end: number; text: string }[] = [];

  let m: RegExpExecArray | null;
  while ((m = headingRegex.exec(html)) !== null) {
    const raw = m[0];
    const text = htmlToPlain(raw).trim();
    headings.push({ start: m.index, end: m.index + raw.length, text });
  }

  let idx = -1;
  for (let i = 0; i < headings.length; i++) {
    if (contains.test(headings[i].text)) { idx = i; break; }
  }
  if (idx === -1) return null;

  const acHead = headings[idx];
  const sectionStart = acHead.end;
  const sectionEnd = (idx + 1 < headings.length) ? headings[idx + 1].start : html.length;

  const sectionHtml = html.slice(sectionStart, sectionEnd);
  const withoutSectionHtml = html.slice(0, acHead.start) + html.slice(sectionEnd);

  return { sectionHtml, withoutSectionHtml };
}

/* ------------------------- Public API calls ------------------------ */

export async function testConnection(creds: SessionCredentials): Promise<any> {
  requireConnection(creds);
  const url = `${creds.baseUrl}/rest/api/3/myself`;
  const me = await request<any>(creds, url);
  return { accountId: me.accountId, displayName: me.displayName, locale: me.locale };
}

/** Lists recent stories using only issuetype names that actually exist on your site. */
export async function getStories(creds: SessionCredentials): Promise<StorySummary[]> {
  requireConnection(creds);
  const url = `${creds.baseUrl}/rest/api/3/search`;

  // Build JQL only with valid issue types (fixes: "The value 'User Story' does not exist for 'issuetype'")
  const storyNames = await getStoryTypeNames(creds);
  const quoted = storyNames.map(n => `"${n.replace(/"/g, '\\"')}"`).join(', ');
  const jql = `issuetype in (${quoted}) ORDER BY created DESC`;
  const params = { jql, maxResults: 50, fields: 'summary,issuetype' };

  try {
    const data = await request<any>(creds, url, params);
    const issues = Array.isArray(data.issues) ? data.issues : [];
    return issues.map((i: any) => ({ key: i.key, summary: i.fields?.summary ?? '' }));
  } catch {
    // Fallback: broad search then filter client-side for story-like types
    const fallbackParams = { jql: 'ORDER BY created DESC', maxResults: 100, fields: 'summary,issuetype' };
    const data = await request<any>(creds, url, fallbackParams);
    const issues = (data.issues || []).filter((i: any) =>
      /story/i.test(String(i?.fields?.issuetype?.name || ''))
    );
    return issues.map((i: any) => ({ key: i.key, summary: i.fields?.summary ?? '' }));
  }
}

/** Returns a story with plain-text description and acceptanceCriteria (also plain text).
 * If AC is inside Description, we extract it and remove it from Description to avoid duplication. */
export async function getStory(creds: SessionCredentials, key: string): Promise<StoryDetails> {
  requireConnection(creds);
  const url = `${creds.baseUrl}/rest/api/3/issue/${encodeURIComponent(key)}`;
  const params = { expand: 'renderedFields,names', fields: '*all' };
  const data = await request<any>(creds, url, params);

  const title: string = data.fields?.summary ?? key;

  // Prefer rendered HTML description from Jira
  let renderedDesc: string | undefined = data.renderedFields?.description;

  // 1) Specific AC custom field (if configured)
  const configuredKey = process.env.JIRA_AC_FIELD_KEY; // e.g., "customfield_12345"
  let acPlain: string | undefined;

  if (configuredKey && data.fields?.hasOwnProperty(configuredKey)) {
    const v = data.fields[configuredKey];
    acPlain = (typeof v === 'string') ? htmlToPlain(v) : htmlToPlain(JSON.stringify(v));
  }

  // 2) Auto-discover AC field by visible name
  if (!acPlain) {
    const names = data.names || {};
    for (const fieldId of Object.keys(names)) {
      const label = String(names[fieldId] || '').toLowerCase();
      if (label.includes('acceptance') && label.includes('criteria')) {
        const v = data.fields?.[fieldId];
        if (v != null) {
          acPlain = typeof v === 'string' ? htmlToPlain(v) : htmlToPlain(JSON.stringify(v));
          break;
        }
      }
    }
  }

  // 3) Else extract AC from description HTML and strip it from description
  let descriptionPlain: string | undefined;
  if (!acPlain && renderedDesc) {
    const picked = extractSectionByHeading(renderedDesc, /acceptance\s*criteria/i);
    if (picked && picked.sectionHtml) {
      acPlain = htmlToPlain(picked.sectionHtml);
      renderedDesc = picked.withoutSectionHtml;
    }
  }

  // If still no AC and description is plain/adf, try plain-text extraction
  if (!acPlain && !renderedDesc && typeof data.fields?.description === 'string') {
    const text = data.fields.description as string;
    const lines = text.split(/\r?\n/);
    const startIdx = lines.findIndex(l => /(^|\b)Acceptance\s*Criteria\b/i.test(l));
    if (startIdx !== -1) {
      const kept: string[] = [];
      for (let i = 0; i < startIdx; i++) kept.push(lines[i]);
      const ac: string[] = [];
      let i = startIdx + 1;
      for (; i < lines.length; i++) {
        const line = lines[i];
        if (/^\s*#{1,6}\s+\w+/.test(line)) break;
        if (/^\s*[A-Z][A-Za-z ]{2,}:\s*$/.test(line)) break;
        ac.push(line);
      }
      acPlain = ac.join('\n').trim();
      const rest = lines.slice(i).join('\n');
      descriptionPlain = (kept.join('\n') + '\n' + rest).trim();
    } else {
      descriptionPlain = text.trim();
    }
  }

  // Finalize description: from rendered HTML (clean + AC removed) OR plain already
  if (!descriptionPlain) {
    if (renderedDesc) descriptionPlain = htmlToPlain(renderedDesc);
    else if (typeof data.fields?.description === 'string') descriptionPlain = data.fields.description.trim();
    else if (data.fields?.description) descriptionPlain = htmlToPlain(JSON.stringify(data.fields.description));
  }

  return {
    key,
    title,
    description: descriptionPlain,
    acceptanceCriteria: acPlain || ''
  };
}

export default {
  testConnection,
  getStories,
  getStory
};
