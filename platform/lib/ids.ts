import { logger } from "@/lib/logger";
/**
 * Intrusion Detection System (IDS)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Real-time threat detection to identify and block malicious requests
 *
 * Detects:
 * - SQL injection attempts
 * - XSS attacks
 * - Path traversal
 * - Command injection
 * - Suspicious patterns
 * - Scanner/bot activity
 */

// Audit logging removed — IDS runs in middleware pre-auth (no org context for audit table FK)

export interface ThreatDetection {
  blocked: boolean;
  threats: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  response?: Response;
}

/**
 * Analyze request for security threats
 */
export async function detectThreats(request: Request): Promise<ThreatDetection> {
  const threats: string[] = [];
  let severity: ThreatDetection['severity'] = 'low';

  const url = new URL(request.url);
  const userAgent = request.headers.get('user-agent') || '';
  const ip = request.headers.get('x-forwarded-for') ||
             request.headers.get('x-real-ip') ||
             'unknown';

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. SQL Injection Detection
  // ═══════════════════════════════════════════════════════════════════════════

  const sqlPatterns = [
    /(\%27)|(\')|(\-\-)|(\%23)|(#)/i,           // SQL meta-characters
    /((\%3D)|(=))[^\n]*((\%27)|(\')|(\-\-)|(\%3B)|(;))/i, // Typical SQL injection
    /\w*((\%27)|(\'))((\%6F)|o|(\%4F))((\%72)|r|(\%52))/i, // SQL 'or' operator
    /union[\s\S]*select/i,                       // UNION SELECT
    /select[\s\S]*from/i,                        // SELECT FROM
    /insert[\s\S]*into/i,                        // INSERT INTO
    /delete[\s\S]*from/i,                        // DELETE FROM
    /drop[\s\S]*table/i,                         // DROP TABLE
    /update[\s\S]*set/i,                         // UPDATE SET
    /exec(\s|\+)+(s|x)p\w+/i,                   // EXEC stored procedure
  ];

  for (const pattern of sqlPatterns) {
    if (pattern.test(url.search) || pattern.test(url.pathname)) {
      threats.push('SQL_INJECTION_ATTEMPT');
      severity = 'critical';
      break;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. XSS Detection
  // ═══════════════════════════════════════════════════════════════════════════

  const xssPatterns = [
    /<script[\s\S]*?>[\s\S]*?<\/script>/i,      // <script> tags
    /javascript:/i,                              // javascript: protocol
    /(?<![a-z])on\w+\s*=/i,                      // Event handlers (onclick, onerror, etc.) — negative lookbehind avoids matching param names like organizationId=
    /<iframe/i,                                  // <iframe> tags
    /<embed/i,                                   // <embed> tags
    /<object/i,                                  // <object> tags
    /eval\(/i,                                   // eval() function
    /expression\(/i,                             // CSS expression()
  ];

  for (const pattern of xssPatterns) {
    if (pattern.test(url.search) || pattern.test(url.pathname)) {
      threats.push('XSS_ATTEMPT');
      severity = severity === 'critical' ? 'critical' : 'high';
      break;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. Path Traversal Detection
  // ═══════════════════════════════════════════════════════════════════════════

  const traversalPatterns = [
    /\.\.\//,                                    // ../
    /\.\.\\/,                                    // ..\
    /\%2e\%2e\%2f/i,                            // URL encoded ../
    /\%2e\%2e\%5c/i,                            // URL encoded ..\
  ];

  for (const pattern of traversalPatterns) {
    if (pattern.test(url.pathname) || pattern.test(url.search)) {
      threats.push('PATH_TRAVERSAL_ATTEMPT');
      severity = severity === 'critical' ? 'critical' : 'high';
      break;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. Command Injection Detection
  // ═══════════════════════════════════════════════════════════════════════════

  const commandPatterns = [
    /;[\s]*cat[\s]/i,                           // ; cat
    /\|[\s]*ls[\s]/i,                           // | ls
    /`.*`/,                                      // Backticks
    /\$\(.*\)/,                                  // $() command substitution
    /;[\s]*rm[\s]/i,                            // ; rm
    /;[\s]*curl[\s]/i,                          // ; curl
    /;[\s]*wget[\s]/i,                          // ; wget
  ];

  for (const pattern of commandPatterns) {
    if (pattern.test(url.search) || pattern.test(url.pathname)) {
      threats.push('COMMAND_INJECTION_ATTEMPT');
      severity = 'critical';
      break;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. Scanner/Bot Detection
  // ═══════════════════════════════════════════════════════════════════════════

  const scannerPatterns = [
    /nmap/i,
    /nikto/i,
    /sqlmap/i,
    /w3af/i,
    /burp/i,
    /metasploit/i,
    /acunetix/i,
    /nessus/i,
    /openvas/i,
    /qualys/i,
  ];

  for (const pattern of scannerPatterns) {
    if (pattern.test(userAgent)) {
      threats.push('SECURITY_SCANNER_DETECTED');
      severity = severity === 'critical' ? 'critical' : 'high';
      break;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. Suspicious User Agent Detection
  // ═══════════════════════════════════════════════════════════════════════════

  if (!userAgent || userAgent.length < 10) {
    threats.push('SUSPICIOUS_USER_AGENT');
    severity = severity === 'critical' || severity === 'high' ? severity : 'medium';
  }

  // Common bot/crawler user agents that shouldn't access non-public routes
  const botPatterns = [
    /bot/i,
    /crawler/i,
    /spider/i,
    /curl/i,
    /wget/i,
    /python/i,
    /java/i,
  ];

  if (!url.pathname.startsWith('/api/public') && !url.pathname.startsWith('/_next')) {
    for (const pattern of botPatterns) {
      if (pattern.test(userAgent)) {
        threats.push('BOT_ACCESS_ATTEMPT');
        severity = severity === 'critical' || severity === 'high' ? severity : 'medium';
        break;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. Suspicious Request Patterns
  // ═══════════════════════════════════════════════════════════════════════════

  // Accessing common vulnerability paths
  const vulnPaths = [
    '/admin',
    '/phpmyadmin',
    '/wp-admin',
    '/.env',
    '/.git',
    '/config',
    '/.aws',
    '/backup',
  ];

  for (const path of vulnPaths) {
    if (url.pathname.startsWith(path)) {
      threats.push('VULNERABILITY_PROBE');
      severity = severity === 'critical' || severity === 'high' ? severity : 'medium';
      break;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Log and Block if Threats Detected
  // ═══════════════════════════════════════════════════════════════════════════

  if (threats.length > 0) {
    // Log threat to server console (IDS runs pre-auth in middleware, no org context for audit table FK)
    logger.warn('[IDS] Threat detected:', JSON.stringify({
      threats,
      severity,
      url: request.url,
      method: request.method,
      ip,
      userAgent,
      timestamp: new Date().toISOString(),
    }));

    // Block critical and high severity threats
    if (severity === 'critical' || severity === 'high') {
      return {
        blocked: true,
        threats,
        severity,
        response: new Response(
          JSON.stringify({
            error: 'Forbidden',
            message: 'Security violation detected',
          }),
          {
            status: 403,
            headers: {
              'Content-Type': 'application/json',
              'X-Security-Block': 'true',
            },
          }
        ),
      };
    }

    // Log but allow medium/low severity (with monitoring)
    return {
      blocked: false,
      threats,
      severity,
    };
  }

  // No threats detected
  return {
    blocked: false,
    threats: [],
    severity: 'low',
  };
}

/**
 * Middleware wrapper for threat detection
 * Use this in your Next.js middleware
 */
export async function securityMiddleware(request: Request): Promise<Response | null> {
  // Internal cron bypass: requests from Supabase Edge Functions (nexus-cron /
  // scheduled-jobs) carry x-internal-cron: true + the service role Bearer token.
  // Deno's fetch has no User-Agent, which would otherwise trigger SUSPICIOUS_USER_AGENT.
  const internalCron = request.headers.get('x-internal-cron') === 'true';
  const authHeader = request.headers.get('authorization') || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (internalCron && serviceKey && authHeader === `Bearer ${serviceKey}`) {
    return null; // Trusted internal cron — skip IDS
  }

  const detection = await detectThreats(request);

  if (detection.blocked && detection.response) {
    return detection.response;
  }

  return null; // Allow request to proceed
}
