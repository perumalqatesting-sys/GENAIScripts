import { Request, Response, NextFunction } from 'express';
import { SessionCredentials } from '../services/jiraService';

// Extend the Request interface to include session with jiraCreds
interface JiraAuthRequest extends Request {
  jiraCreds?: SessionCredentials;
}

/**
 * Middleware to validate Jira authentication
 * Checks if valid Jira credentials exist in session
 */
export function validateJiraAuth(req: JiraAuthRequest, res: Response, next: NextFunction): void {
  const creds: SessionCredentials | undefined = (req as any).session?.jiraCreds;
  
  if (!creds || !creds.baseUrl || !creds.authHeader) {
    res.status(401).json({
      message: 'Not connected to Jira. Please connect to Jira first using the Connect button.',
      code: 'JIRA_NOT_CONNECTED'
    });
    return;
  }
  
  // Add credentials to request object for easy access in route handlers
  req.jiraCreds = creds;
  next();
}

/**
 * Optional middleware that checks for Jira auth but doesn't fail
 * Used for endpoints that can work with or without Jira connection
 */
export function optionalJiraAuth(req: JiraAuthRequest, res: Response, next: NextFunction): void {
  const creds: SessionCredentials | undefined = (req as any).session?.jiraCreds;
  
  if (creds && creds.baseUrl && creds.authHeader) {
    req.jiraCreds = creds;
  }
  
  next();
}