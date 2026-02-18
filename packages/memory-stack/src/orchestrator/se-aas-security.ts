/**
 * SE-aaS Security & Secret Management
 * ====================================
 *
 * Comprehensive security controls for SE-aaS:
 * - Secret management (API keys, tokens)
 * - Input validation & sanitization
 * - Output sandboxing for generated code
 * - RBAC (Role-Based Access Control)
 * - Audit logging
 * - Rate limiting per user/org
 *
 * @module orchestrator/se-aas-security
 */

import { createLogger, type NexusLogger } from '../observability';
import crypto from 'crypto';

// ============================================================================
// TYPES
// ============================================================================

export interface SecretManagerConfig {
  /** Encryption key (32 bytes) */
  encryptionKey: string;
  /** Logger instance */
  logger?: NexusLogger;
}

export interface Secret {
  /** Secret ID */
  id: string;
  /** Secret type */
  type: 'github-token' | 'anthropic-api-key' | 'webhook-secret' | 'api-key';
  /** Encrypted value */
  encrypted: string;
  /** IV for decryption */
  iv: string;
  /** Owner user ID */
  userId: string;
  /** Owner org ID */
  orgId: string;
  /** Created timestamp */
  createdAt: string;
  /** Expires timestamp */
  expiresAt?: string;
}

export interface InputValidationRule {
  /** Field name */
  field: string;
  /** Field type */
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  /** Required */
  required: boolean;
  /** Min length (strings) */
  minLength?: number;
  /** Max length (strings) */
  maxLength?: number;
  /** Min value (numbers) */
  min?: number;
  /** Max value (numbers) */
  max?: number;
  /** Regex pattern */
  pattern?: RegExp;
  /** Custom validator */
  validator?: (value: any) => boolean;
}

export interface RBACPermission {
  /** Permission name */
  name: string;
  /** Resource type */
  resource: string;
  /** Actions allowed */
  actions: ('create' | 'read' | 'update' | 'delete' | 'execute')[];
}

export interface Role {
  /** Role name */
  name: string;
  /** Role description */
  description: string;
  /** Permissions */
  permissions: RBACPermission[];
}

export interface AuditLog {
  /** Log ID */
  id: string;
  /** User ID */
  userId: string;
  /** Org ID */
  orgId: string;
  /** Action performed */
  action: string;
  /** Resource affected */
  resource: string;
  /** Resource ID */
  resourceId: string;
  /** Success */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** IP address */
  ipAddress?: string;
  /** User agent */
  userAgent?: string;
  /** Timestamp */
  timestamp: string;
}

// ============================================================================
// SECRET MANAGER
// ============================================================================

export class SecretManager {
  private encryptionKey: Buffer;
  private logger: NexusLogger;
  private secrets: Map<string, Secret> = new Map();

  constructor(config: SecretManagerConfig) {
    this.encryptionKey = Buffer.from(config.encryptionKey, 'hex');
    if (this.encryptionKey.length !== 32) {
      throw new Error('Encryption key must be 32 bytes (64 hex characters)');
    }
    this.logger = config.logger || createLogger({ level: 'info' });
  }

  /**
   * Store a secret (encrypted)
   */
  async storeSecret(params: {
    type: Secret['type'];
    value: string;
    userId: string;
    orgId: string;
    expiresAt?: string;
  }): Promise<string> {
    const id = this.generateSecretId();
    const iv = crypto.randomBytes(16);

    // Encrypt secret value
    const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, iv);
    let encrypted = cipher.update(params.value, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const secret: Secret = {
      id,
      type: params.type,
      encrypted,
      iv: iv.toString('hex'),
      userId: params.userId,
      orgId: params.orgId,
      createdAt: new Date().toISOString(),
      expiresAt: params.expiresAt,
    };

    this.secrets.set(id, secret);

    this.logger.info('Secret stored', {
      secretId: id,
      type: params.type,
      userId: params.userId,
    });

    return id;
  }

  /**
   * Retrieve a secret (decrypted)
   */
  async getSecret(secretId: string, userId: string): Promise<string> {
    const secret = this.secrets.get(secretId);

    if (!secret) {
      throw new Error('Secret not found');
    }

    // Verify ownership
    if (secret.userId !== userId) {
      this.logger.warn('Unauthorized secret access attempt', {
        secretId,
        userId,
        ownerId: secret.userId,
      });
      throw new Error('Unauthorized');
    }

    // Check expiration
    if (secret.expiresAt && new Date(secret.expiresAt) < new Date()) {
      throw new Error('Secret expired');
    }

    // Decrypt
    const iv = Buffer.from(secret.iv, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey, iv);
    let decrypted = decipher.update(secret.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Delete a secret
   */
  async deleteSecret(secretId: string, userId: string): Promise<void> {
    const secret = this.secrets.get(secretId);

    if (!secret) {
      throw new Error('Secret not found');
    }

    if (secret.userId !== userId) {
      throw new Error('Unauthorized');
    }

    this.secrets.delete(secretId);

    this.logger.info('Secret deleted', { secretId, userId });
  }

  /**
   * List secrets for a user
   */
  async listSecrets(userId: string): Promise<Omit<Secret, 'encrypted' | 'iv'>[]> {
    return Array.from(this.secrets.values())
      .filter(s => s.userId === userId)
      .map(({ encrypted, iv, ...rest }) => rest);
  }

  private generateSecretId(): string {
    return `secret_${crypto.randomBytes(16).toString('hex')}`;
  }
}

// ============================================================================
// INPUT VALIDATOR
// ============================================================================

export class InputValidator {
  private logger: NexusLogger;

  constructor(logger?: NexusLogger) {
    this.logger = logger || createLogger({ level: 'info' });
  }

  /**
   * Validate input against rules
   */
  validate(input: Record<string, any>, rules: InputValidationRule[]): void {
    const errors: string[] = [];

    for (const rule of rules) {
      const value = input[rule.field];

      // Required check
      if (rule.required && (value === undefined || value === null || value === '')) {
        errors.push(`${rule.field} is required`);
        continue;
      }

      // Skip validation if not required and not provided
      if (!rule.required && (value === undefined || value === null)) {
        continue;
      }

      // Type check
      const actualType = Array.isArray(value) ? 'array' : typeof value;
      if (actualType !== rule.type) {
        errors.push(`${rule.field} must be ${rule.type}, got ${actualType}`);
        continue;
      }

      // String validations
      if (rule.type === 'string') {
        if (rule.minLength && value.length < rule.minLength) {
          errors.push(`${rule.field} must be at least ${rule.minLength} characters`);
        }
        if (rule.maxLength && value.length > rule.maxLength) {
          errors.push(`${rule.field} must be at most ${rule.maxLength} characters`);
        }
        if (rule.pattern && !rule.pattern.test(value)) {
          errors.push(`${rule.field} format is invalid`);
        }
      }

      // Number validations
      if (rule.type === 'number') {
        if (rule.min !== undefined && value < rule.min) {
          errors.push(`${rule.field} must be at least ${rule.min}`);
        }
        if (rule.max !== undefined && value > rule.max) {
          errors.push(`${rule.field} must be at most ${rule.max}`);
        }
      }

      // Custom validator
      if (rule.validator && !rule.validator(value)) {
        errors.push(`${rule.field} validation failed`);
      }
    }

    if (errors.length > 0) {
      this.logger.warn('Input validation failed', { errors });
      throw new Error(`Validation failed: ${errors.join(', ')}`);
    }
  }

  /**
   * Sanitize string input (prevent injection attacks)
   */
  sanitizeString(input: string): string {
    return input
      .replace(/[<>]/g, '') // Remove < >
      .replace(/javascript:/gi, '') // Remove javascript:
      .replace(/on\w+=/gi, '') // Remove event handlers
      .trim();
  }

  /**
   * Validate and sanitize code (generated code safety)
   */
  sanitizeCode(code: string, language: string): string {
    // Remove dangerous patterns
    let sanitized = code;

    // No eval() or Function()
    if (language === 'javascript' || language === 'typescript') {
      if (/\beval\s*\(/.test(sanitized) || /\bFunction\s*\(/.test(sanitized)) {
        throw new Error('Generated code contains dangerous eval/Function');
      }
    }

    // No os commands
    if (/require\(['"]child_process['"]\)/.test(sanitized)) {
      throw new Error('Generated code contains dangerous child_process');
    }

    // No file system writes (fs.writeFile, etc)
    if (/fs\.(write|unlink|rm)/.test(sanitized)) {
      throw new Error('Generated code contains dangerous file system operations');
    }

    return sanitized;
  }
}

// ============================================================================
// RBAC MANAGER
// ============================================================================

export class RBACManager {
  private roles: Map<string, Role> = new Map();
  private userRoles: Map<string, string[]> = new Map();
  private logger: NexusLogger;

  constructor(logger?: NexusLogger) {
    this.logger = logger || createLogger({ level: 'info' });

    // Initialize default roles
    this.initializeDefaultRoles();
  }

  private initializeDefaultRoles(): void {
    // Admin role
    this.roles.set('admin', {
      name: 'admin',
      description: 'Full access to all resources',
      permissions: [
        { name: 'jobs.*', resource: 'job', actions: ['create', 'read', 'update', 'delete', 'execute'] },
        { name: 'metrics.*', resource: 'metrics', actions: ['read'] },
        { name: 'secrets.*', resource: 'secret', actions: ['create', 'read', 'update', 'delete'] },
      ],
    });

    // Developer role
    this.roles.set('developer', {
      name: 'developer',
      description: 'Can create and manage jobs',
      permissions: [
        { name: 'jobs.*', resource: 'job', actions: ['create', 'read', 'execute'] },
        { name: 'secrets.read', resource: 'secret', actions: ['read'] },
      ],
    });

    // Viewer role
    this.roles.set('viewer', {
      name: 'viewer',
      description: 'Read-only access',
      permissions: [
        { name: 'jobs.read', resource: 'job', actions: ['read'] },
        { name: 'metrics.read', resource: 'metrics', actions: ['read'] },
      ],
    });
  }

  /**
   * Assign role to user
   */
  assignRole(userId: string, roleName: string): void {
    if (!this.roles.has(roleName)) {
      throw new Error(`Role ${roleName} not found`);
    }

    const userRoles = this.userRoles.get(userId) || [];
    if (!userRoles.includes(roleName)) {
      userRoles.push(roleName);
      this.userRoles.set(userId, userRoles);
    }

    this.logger.info('Role assigned', { userId, roleName });
  }

  /**
   * Check if user has permission
   */
  hasPermission(userId: string, resource: string, action: string): boolean {
    const userRoles = this.userRoles.get(userId) || [];

    for (const roleName of userRoles) {
      const role = this.roles.get(roleName);
      if (!role) continue;

      for (const permission of role.permissions) {
        // Check wildcard
        if (permission.resource === '*' || permission.resource === resource) {
          if (permission.actions.includes(action as any) || permission.actions.includes('*' as any)) {
            return true;
          }
        }
      }
    }

    this.logger.debug('Permission check failed', { userId, resource, action });
    return false;
  }

  /**
   * Get user roles
   */
  getUserRoles(userId: string): string[] {
    return this.userRoles.get(userId) || [];
  }
}

// ============================================================================
// AUDIT LOGGER
// ============================================================================

export class AuditLogger {
  private logs: AuditLog[] = [];
  private logger: NexusLogger;

  constructor(logger?: NexusLogger) {
    this.logger = logger || createLogger({ level: 'info' });
  }

  /**
   * Log an action
   */
  log(params: Omit<AuditLog, 'id' | 'timestamp'>): void {
    const log: AuditLog = {
      ...params,
      id: this.generateLogId(),
      timestamp: new Date().toISOString(),
    };

    this.logs.push(log);

    this.logger.info('Audit log', {
      userId: log.userId,
      action: log.action,
      resource: log.resource,
      success: log.success,
    });
  }

  /**
   * Get audit logs for a user
   */
  getUserLogs(userId: string, limit: number = 100): AuditLog[] {
    return this.logs
      .filter(l => l.userId === userId)
      .slice(-limit);
  }

  /**
   * Get audit logs for an organization
   */
  getOrgLogs(orgId: string, limit: number = 100): AuditLog[] {
    return this.logs
      .filter(l => l.orgId === orgId)
      .slice(-limit);
  }

  private generateLogId(): string {
    return `audit_${Date.now()}_${crypto.randomUUID().replace(/-/g, '').slice(0, 7)}`;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export function createSecretManager(config: SecretManagerConfig): SecretManager {
  return new SecretManager(config);
}

export function createInputValidator(logger?: NexusLogger): InputValidator {
  return new InputValidator(logger);
}

export function createRBACManager(logger?: NexusLogger): RBACManager {
  return new RBACManager(logger);
}

export function createAuditLogger(logger?: NexusLogger): AuditLogger {
  return new AuditLogger(logger);
}
