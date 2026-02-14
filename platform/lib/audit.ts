/**
 * SOC2 Audit Logging Library
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Comprehensive audit logging for SOC2 compliance
 *
 * Usage:
 *   import { logAuditEvent, AuditAction } from '@/lib/audit';
 *
 *   await logAuditEvent({
 *     organizationId: org.id,
 *     userId: session.user.id,
 *     action: AuditAction.USER_LOGIN_SUCCESS,
 *     ipAddress: req.ip,
 *     userAgent: req.headers['user-agent']
 *   });
 */

import { createClient } from '@supabase/supabase-js';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export enum AuditAction {
  // Authentication
  USER_LOGIN_SUCCESS = 'user.login.success',
  USER_LOGIN_FAILURE = 'user.login.failure',
  USER_LOGOUT = 'user.logout',
  USER_MFA_ENABLED = 'user.mfa.enabled',
  USER_MFA_DISABLED = 'user.mfa.disabled',
  USER_PASSWORD_CHANGED = 'user.password.changed',

  // Data Access
  DATA_READ = 'data.read',
  DATA_CREATE = 'data.create',
  DATA_UPDATE = 'data.update',
  DATA_DELETE = 'data.delete',
  DATA_EXPORT = 'data.export',

  // Permissions
  PERMISSION_GRANT = 'permission.grant',
  PERMISSION_REVOKE = 'permission.revoke',
  ROLE_ASSIGN = 'role.assign',
  ROLE_REMOVE = 'role.remove',

  // Security
  API_KEY_CREATE = 'api_key.create',
  API_KEY_REVOKE = 'api_key.revoke',
  SECURITY_SETTINGS_UPDATE = 'settings.security.update',
  RLS_POLICY_CHANGE = 'rls.policy.change',

  // Organization
  ORGANIZATION_CREATE = 'organization.create',
  ORGANIZATION_UPDATE = 'organization.update',
  ORGANIZATION_DELETE = 'organization.delete',
  MEMBER_ADD = 'member.add',
  MEMBER_REMOVE = 'member.remove',
}

export interface AuditEventParams {
  organizationId: string;
  userId?: string;
  action: AuditAction | string;
  resourceType?: string;
  resourceId?: string;
  oldValue?: any;
  newValue?: any;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  requestId?: string;
  metadata?: Record<string, any>;
  status?: 'success' | 'failure' | 'pending';
  errorMessage?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN LOGGING FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Log an audit event
 *
 * @param params - Audit event parameters
 * @returns Audit event ID
 */
export async function logAuditEvent(params: AuditEventParams): Promise<string | null> {
  try {
    // Create Supabase client with service role (required for audit logging)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Call database function
    const { data, error } = await supabase.rpc('log_audit_event', {
      p_organization_id: params.organizationId,
      p_user_id: params.userId || null,
      p_action: params.action,
      p_resource_type: params.resourceType || null,
      p_resource_id: params.resourceId || null,
      p_old_value: params.oldValue ? JSON.stringify(params.oldValue) : null,
      p_new_value: params.newValue ? JSON.stringify(params.newValue) : null,
      p_ip_address: params.ipAddress || null,
      p_user_agent: params.userAgent || null,
      p_session_id: params.sessionId || null,
      p_request_id: params.requestId || null,
      p_metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      p_status: params.status || 'success',
      p_error_message: params.errorMessage || null,
    });

    if (error) {
      console.error('[Audit] Failed to log event:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('[Audit] Exception while logging event:', error);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CONVENIENCE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Log user login event
 */
export async function logUserLogin(params: {
  organizationId: string;
  userId: string;
  success: boolean;
  ipAddress?: string;
  userAgent?: string;
  errorMessage?: string;
}) {
  return logAuditEvent({
    organizationId: params.organizationId,
    userId: params.userId,
    action: params.success ? AuditAction.USER_LOGIN_SUCCESS : AuditAction.USER_LOGIN_FAILURE,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    status: params.success ? 'success' : 'failure',
    errorMessage: params.errorMessage,
  });
}

/**
 * Log data access event
 */
export async function logDataAccess(params: {
  organizationId: string;
  userId: string;
  action: 'read' | 'create' | 'update' | 'delete' | 'export';
  resourceType: string;
  resourceId: string;
  oldValue?: any;
  newValue?: any;
}) {
  const actionMap = {
    read: AuditAction.DATA_READ,
    create: AuditAction.DATA_CREATE,
    update: AuditAction.DATA_UPDATE,
    delete: AuditAction.DATA_DELETE,
    export: AuditAction.DATA_EXPORT,
  };

  return logAuditEvent({
    organizationId: params.organizationId,
    userId: params.userId,
    action: actionMap[params.action],
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    oldValue: params.oldValue,
    newValue: params.newValue,
  });
}

/**
 * Log permission change
 */
export async function logPermissionChange(params: {
  organizationId: string;
  userId: string;
  action: 'grant' | 'revoke';
  targetUserId: string;
  permission: string;
}) {
  return logAuditEvent({
    organizationId: params.organizationId,
    userId: params.userId,
    action: params.action === 'grant' ? AuditAction.PERMISSION_GRANT : AuditAction.PERMISSION_REVOKE,
    resourceType: 'permission',
    resourceId: params.targetUserId,
    newValue: { permission: params.permission },
  });
}

/**
 * Log API key event
 */
export async function logApiKeyEvent(params: {
  organizationId: string;
  userId: string;
  action: 'create' | 'revoke';
  apiKeyId: string;
  metadata?: Record<string, any>;
}) {
  return logAuditEvent({
    organizationId: params.organizationId,
    userId: params.userId,
    action: params.action === 'create' ? AuditAction.API_KEY_CREATE : AuditAction.API_KEY_REVOKE,
    resourceType: 'api_key',
    resourceId: params.apiKeyId,
    metadata: params.metadata,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT TRAIL RETRIEVAL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get audit trail for a resource
 */
export async function getAuditTrail(
  resourceType: string,
  resourceId: string,
  limit: number = 100
) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase.rpc('get_audit_trail', {
    p_resource_type: resourceType,
    p_resource_id: resourceId,
    p_limit: limit,
  });

  if (error) {
    console.error('[Audit] Failed to get audit trail:', error);
    return [];
  }

  return data || [];
}

/**
 * Get user activity
 */
export async function getUserActivity(limit: number = 50) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase.rpc('get_user_activity', {
    p_limit: limit,
  });

  if (error) {
    console.error('[Audit] Failed to get user activity:', error);
    return [];
  }

  return data || [];
}

/**
 * Get security events
 */
export async function getSecurityEvents(organizationId: string, hours: number = 24) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase.rpc('get_security_events', {
    p_organization_id: organizationId,
    p_hours: hours,
  });

  if (error) {
    console.error('[Audit] Failed to get security events:', error);
    return [];
  }

  return data || [];
}

// ═══════════════════════════════════════════════════════════════════════════
// MIDDLEWARE HELPER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract request context for audit logging
 *
 * Usage in API routes:
 *   const context = extractRequestContext(req);
 *   await logAuditEvent({ ...params, ...context });
 */
export function extractRequestContext(req: Request): {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
} {
  // For Next.js App Router
  const headers = req.headers;

  return {
    ipAddress: headers.get('x-forwarded-for')?.split(',')[0] || headers.get('x-real-ip') || undefined,
    userAgent: headers.get('user-agent') || undefined,
    requestId: headers.get('x-request-id') || undefined,
  };
}
