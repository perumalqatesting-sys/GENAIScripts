import express from 'express'
import jiraService, { SessionCredentials } from '../services/jiraService'

const router = express.Router()

// Debug: return session-stored credentials (dev only)
router.get('/_store', (req, res) => {
  const creds = (req as any).session?.jiraCreds || null
  res.json({ session: !!(req as any).session, jiraCreds: creds })
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

router.get('/stories', async (req, res) => {
  try {
  const creds: SessionCredentials | undefined = (req as any).session?.jiraCreds
    const issues = await jiraService.getStories(creds as SessionCredentials)
    return res.json(issues)
  } catch (err: any) {
    console.error('Jira stories error', err?.response?.data || err.message)
    return res.status(500).json({ message: err.message || 'Failed to fetch stories' })
  }
})

router.get('/story/:key', async (req, res) => {
  try {
  const creds: SessionCredentials | undefined = (req as any).session?.jiraCreds
    const { key } = req.params
    const details = await jiraService.getStory(creds as SessionCredentials, key)
    return res.json(details)
  } catch (err: any) {
    console.error('Jira story detail error', err?.response?.data || err.message)
    return res.status(500).json({ message: err.message || 'Failed to fetch story details' })
  }
})

export default router
