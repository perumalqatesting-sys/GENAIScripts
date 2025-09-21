import express from 'express'
import jiraService, { SessionCredentials } from '../services/jiraService'
import { validateJiraAuth, optionalJiraAuth } from '../middleware/jiraAuth'

const router = express.Router()

// Debug: return session-stored credentials (dev only)
router.get('/_store', (req, res) => {
  const creds = (req as any).session?.jiraCreds || null
  res.json({ session: !!(req as any).session, jiraCreds: creds })
})

// Check connection status
router.get('/status', optionalJiraAuth, (req: any, res) => {
  const isConnected = !!(req.jiraCreds && req.jiraCreds.baseUrl && req.jiraCreds.authHeader);
  res.json({ 
    connected: isConnected,
    baseUrl: req.jiraCreds?.baseUrl || null
  })
})

router.post('/connect', async (req, res) => {
  try {
    const { baseUrl, email, apiToken } = req.body || {}
    if (!baseUrl || !email || !apiToken) return res.status(400).json({ message: 'baseUrl, email and apiToken are required' })

    // Save credentials in session (server-side only)
    const creds: SessionCredentials = {
      baseUrl: baseUrl.replace(/\/$/, ''),
      authHeader: `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`,
    }
  ;(req as any).session = (req as any).session || {}
  ;(req as any).session.jiraCreds = creds

    // Test connection using session creds
    await jiraService.testConnection(creds)
    return res.json({ ok: true })
  } catch (err: any) {
    console.error('Jira connect error', err?.response?.data || err.message)
    return res.status(500).json({ message: err?.response?.data?.errorMessages || err.message || 'Failed to connect to Jira' })
  }
})

router.get('/stories', validateJiraAuth, async (req: any, res) => {
  try {
    // Credentials are now guaranteed to exist thanks to middleware
    const creds = req.jiraCreds as SessionCredentials;
    const issues = await jiraService.getStories(creds)
    return res.json(issues)
  } catch (err: any) {
    console.error('Jira stories error', err?.response?.data || err.message)
    
    // Handle Jira API authentication errors
    if (err?.response?.status === 401) {
      return res.status(401).json({ 
        message: 'Jira authentication failed. Please check your credentials and reconnect.',
        code: 'JIRA_AUTH_FAILED'
      })
    }
    
    return res.status(500).json({ message: err.message || 'Failed to fetch stories' })
  }
})

router.get('/story/:key', validateJiraAuth, async (req: any, res) => {
  try {
    // Credentials are now guaranteed to exist thanks to middleware
    const creds = req.jiraCreds as SessionCredentials;
    const { key } = req.params
    const details = await jiraService.getStory(creds, key)
    return res.json(details)
  } catch (err: any) {
    console.error('Jira story detail error', err?.response?.data || err.message)
    
    // Handle Jira API authentication errors
    if (err?.response?.status === 401) {
      return res.status(401).json({ 
        message: 'Jira authentication failed. Please check your credentials and reconnect.',
        code: 'JIRA_AUTH_FAILED'
      })
    }
    
    return res.status(500).json({ message: err.message || 'Failed to fetch story details' })
  }
})

export default router
