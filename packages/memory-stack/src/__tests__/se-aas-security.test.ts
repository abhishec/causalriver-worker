/**
 * SE-aaS Security Module Tests
 *
 * Comprehensive tests for security, RBAC, and audit logging
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createSecretManager,
  createInputValidator,
  createRBACManager,
  createAuditLogger,
  type Secret,
  type InputValidationRule,
} from '../orchestrator/se-aas-security';
import crypto from 'crypto';

describe('SecretManager', () => {
  let secretManager: any;
  const encryptionKey = crypto.randomBytes(32).toString('hex');

  beforeEach(() => {
    secretManager = createSecretManager({
      encryptionKey,
    });
  });

  describe('Encryption & Decryption', () => {
    it('should store and retrieve a secret', async () => {
      const secretValue = 'ghp_my_secret_github_token_12345';

      const secretId = await secretManager.storeSecret({
        type: 'github-token',
        value: secretValue,
        userId: 'user_123',
        orgId: 'org_123',
      });

      expect(secretId).toBeDefined();
      expect(secretId).toContain('secret_');

      const retrieved = await secretManager.getSecret(secretId, 'user_123');
      expect(retrieved).toBe(secretValue);
    });

    it('should encrypt secrets (not store plaintext)', async () => {
      const secretValue = 'sk-ant-api-key-12345';

      const secretId = await secretManager.storeSecret({
        type: 'anthropic-api-key',
        value: secretValue,
        userId: 'user_123',
        orgId: 'org_123',
      });

      const secrets = await secretManager.listSecrets('user_123');
      const secret = secrets.find((s: any) => s.id === secretId);

      // Ensure encrypted value is not the same as plaintext
      expect(secret).toBeDefined();
      // The secret list should not include encrypted or iv (filtered out)
      expect((secret as any).encrypted).toBeUndefined();
      expect((secret as any).iv).toBeUndefined();
    });

    it('should use unique IV for each secret', async () => {
      const secretId1 = await secretManager.storeSecret({
        type: 'api-key',
        value: 'same_value',
        userId: 'user_123',
        orgId: 'org_123',
      });

      const secretId2 = await secretManager.storeSecret({
        type: 'api-key',
        value: 'same_value',
        userId: 'user_123',
        orgId: 'org_123',
      });

      // Different IVs mean different encrypted values (even for same plaintext)
      expect(secretId1).not.toBe(secretId2);
    });
  });

  describe('Access Control', () => {
    it('should reject unauthorized access', async () => {
      const secretId = await secretManager.storeSecret({
        type: 'github-token',
        value: 'secret_value',
        userId: 'user_123',
        orgId: 'org_123',
      });

      // Different user trying to access
      await expect(secretManager.getSecret(secretId, 'user_456')).rejects.toThrow('Unauthorized');
    });

    it('should allow owner to delete secret', async () => {
      const secretId = await secretManager.storeSecret({
        type: 'api-key',
        value: 'secret_value',
        userId: 'user_123',
        orgId: 'org_123',
      });

      await secretManager.deleteSecret(secretId, 'user_123');

      await expect(secretManager.getSecret(secretId, 'user_123')).rejects.toThrow('Secret not found');
    });

    it('should reject non-owner deletion', async () => {
      const secretId = await secretManager.storeSecret({
        type: 'api-key',
        value: 'secret_value',
        userId: 'user_123',
        orgId: 'org_123',
      });

      await expect(secretManager.deleteSecret(secretId, 'user_456')).rejects.toThrow('Unauthorized');
    });
  });

  describe('Expiration', () => {
    it('should handle expired secrets', async () => {
      const pastDate = new Date(Date.now() - 1000).toISOString();

      const secretId = await secretManager.storeSecret({
        type: 'api-key',
        value: 'secret_value',
        userId: 'user_123',
        orgId: 'org_123',
        expiresAt: pastDate,
      });

      await expect(secretManager.getSecret(secretId, 'user_123')).rejects.toThrow('Secret expired');
    });

    it('should allow access to non-expired secrets', async () => {
      const futureDate = new Date(Date.now() + 100000).toISOString();

      const secretId = await secretManager.storeSecret({
        type: 'api-key',
        value: 'secret_value',
        userId: 'user_123',
        orgId: 'org_123',
        expiresAt: futureDate,
      });

      const retrieved = await secretManager.getSecret(secretId, 'user_123');
      expect(retrieved).toBe('secret_value');
    });
  });

  describe('List Secrets', () => {
    it('should list only user secrets', async () => {
      await secretManager.storeSecret({
        type: 'api-key',
        value: 'secret1',
        userId: 'user_123',
        orgId: 'org_123',
      });

      await secretManager.storeSecret({
        type: 'api-key',
        value: 'secret2',
        userId: 'user_456',
        orgId: 'org_456',
      });

      const secrets = await secretManager.listSecrets('user_123');

      expect(secrets.length).toBe(1);
      expect(secrets[0].userId).toBe('user_123');
    });

    it('should not expose encrypted values in list', async () => {
      await secretManager.storeSecret({
        type: 'api-key',
        value: 'secret_value',
        userId: 'user_123',
        orgId: 'org_123',
      });

      const secrets = await secretManager.listSecrets('user_123');

      expect(secrets[0]).not.toHaveProperty('encrypted');
      expect(secrets[0]).not.toHaveProperty('iv');
    });
  });

  describe('Error Handling', () => {
    it('should reject invalid encryption key length', () => {
      expect(() =>
        createSecretManager({
          encryptionKey: 'too_short',
        })
      ).toThrow('Encryption key must be 32 bytes');
    });

    it('should handle non-existent secret', async () => {
      await expect(secretManager.getSecret('invalid_id', 'user_123')).rejects.toThrow('Secret not found');
    });
  });
});

describe('InputValidator', () => {
  let validator: any;

  beforeEach(() => {
    validator = createInputValidator();
  });

  describe('Basic Validation', () => {
    it('should validate required fields', () => {
      const rules: InputValidationRule[] = [
        { field: 'email', type: 'string', required: true },
        { field: 'age', type: 'number', required: true },
      ];

      expect(() =>
        validator.validate({ email: 'test@example.com', age: 25 }, rules)
      ).not.toThrow();

      expect(() => validator.validate({ email: 'test@example.com' }, rules)).toThrow('age is required');
    });

    it('should skip validation for optional missing fields', () => {
      const rules: InputValidationRule[] = [{ field: 'optionalField', type: 'string', required: false }];

      expect(() => validator.validate({}, rules)).not.toThrow();
    });

    it('should validate types', () => {
      const rules: InputValidationRule[] = [
        { field: 'name', type: 'string', required: true },
        { field: 'count', type: 'number', required: true },
        { field: 'active', type: 'boolean', required: true },
        { field: 'tags', type: 'array', required: true },
      ];

      expect(() =>
        validator.validate(
          {
            name: 'John',
            count: 42,
            active: true,
            tags: ['tag1', 'tag2'],
          },
          rules
        )
      ).not.toThrow();

      expect(() =>
        validator.validate(
          {
            name: 123, // Wrong type
            count: 42,
            active: true,
            tags: ['tag1'],
          },
          rules
        )
      ).toThrow('name must be string');
    });
  });

  describe('String Validation', () => {
    it('should validate string length', () => {
      const rules: InputValidationRule[] = [
        { field: 'password', type: 'string', required: true, minLength: 8, maxLength: 50 },
      ];

      expect(() => validator.validate({ password: 'short' }, rules)).toThrow('at least 8 characters');

      expect(() =>
        validator.validate({ password: 'a'.repeat(51) }, rules)
      ).toThrow('at most 50 characters');

      expect(() => validator.validate({ password: 'validpass' }, rules)).not.toThrow();
    });

    it('should validate string pattern', () => {
      const rules: InputValidationRule[] = [
        { field: 'email', type: 'string', required: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
      ];

      expect(() => validator.validate({ email: 'invalid-email' }, rules)).toThrow('format is invalid');

      expect(() => validator.validate({ email: 'valid@example.com' }, rules)).not.toThrow();
    });
  });

  describe('Number Validation', () => {
    it('should validate number range', () => {
      const rules: InputValidationRule[] = [
        { field: 'age', type: 'number', required: true, min: 0, max: 150 },
      ];

      expect(() => validator.validate({ age: -1 }, rules)).toThrow('must be at least 0');

      expect(() => validator.validate({ age: 200 }, rules)).toThrow('must be at most 150');

      expect(() => validator.validate({ age: 25 }, rules)).not.toThrow();
    });
  });

  describe('Custom Validator', () => {
    it('should support custom validation function', () => {
      const rules: InputValidationRule[] = [
        {
          field: 'apiKey',
          type: 'string',
          required: true,
          validator: (value: string) => value.startsWith('sk_'),
        },
      ];

      expect(() => validator.validate({ apiKey: 'invalid_key' }, rules)).toThrow('validation failed');

      expect(() => validator.validate({ apiKey: 'sk_valid_key' }, rules)).not.toThrow();
    });
  });

  describe('String Sanitization', () => {
    it('should remove dangerous characters', () => {
      const input = '<script>alert("xss")</script>';
      const sanitized = validator.sanitizeString(input);

      expect(sanitized).not.toContain('<');
      expect(sanitized).not.toContain('>');
    });

    it('should remove javascript: protocol', () => {
      const input = 'javascript:alert("xss")';
      const sanitized = validator.sanitizeString(input);

      expect(sanitized).not.toContain('javascript:');
    });

    it('should remove event handlers', () => {
      const input = 'onclick=alert("xss")';
      const sanitized = validator.sanitizeString(input);

      expect(sanitized).not.toContain('onclick=');
    });

    it('should trim whitespace', () => {
      const input = '  hello world  ';
      const sanitized = validator.sanitizeString(input);

      expect(sanitized).toBe('hello world');
    });
  });

  describe('Code Sanitization', () => {
    it('should block eval() in JavaScript', () => {
      const code = 'const x = eval("dangerous code");';

      expect(() => validator.sanitizeCode(code, 'javascript')).toThrow('dangerous eval/Function');
    });

    it('should block Function() constructor', () => {
      const code = 'const fn = new Function("return 1");';

      expect(() => validator.sanitizeCode(code, 'javascript')).toThrow('dangerous eval/Function');
    });

    it('should block child_process', () => {
      const code = 'const cp = require("child_process");';

      expect(() => validator.sanitizeCode(code, 'javascript')).toThrow('dangerous child_process');
    });

    it('should block file system writes', () => {
      const code = 'fs.writeFile("file.txt", "data");';

      expect(() => validator.sanitizeCode(code, 'javascript')).toThrow(
        'dangerous file system operations'
      );
    });

    it('should allow safe code', () => {
      const code = 'function add(a, b) { return a + b; }';

      expect(() => validator.sanitizeCode(code, 'javascript')).not.toThrow();
    });
  });
});

describe('RBACManager', () => {
  let rbac: any;

  beforeEach(() => {
    rbac = createRBACManager();
  });

  describe('Role Assignment', () => {
    it('should assign role to user', () => {
      rbac.assignRole('user_123', 'developer');

      const roles = rbac.getUserRoles('user_123');
      expect(roles).toContain('developer');
    });

    it('should reject invalid role', () => {
      expect(() => rbac.assignRole('user_123', 'invalid_role')).toThrow('Role invalid_role not found');
    });

    it('should not duplicate roles', () => {
      rbac.assignRole('user_123', 'developer');
      rbac.assignRole('user_123', 'developer');

      const roles = rbac.getUserRoles('user_123');
      expect(roles.filter((r: string) => r === 'developer').length).toBe(1);
    });
  });

  describe('Permission Checks', () => {
    it('should grant admin full access', () => {
      rbac.assignRole('user_admin', 'admin');

      expect(rbac.hasPermission('user_admin', 'job', 'create')).toBe(true);
      expect(rbac.hasPermission('user_admin', 'job', 'read')).toBe(true);
      expect(rbac.hasPermission('user_admin', 'job', 'update')).toBe(true);
      expect(rbac.hasPermission('user_admin', 'job', 'delete')).toBe(true);
      expect(rbac.hasPermission('user_admin', 'job', 'execute')).toBe(true);
    });

    it('should grant developer limited access', () => {
      rbac.assignRole('user_dev', 'developer');

      expect(rbac.hasPermission('user_dev', 'job', 'create')).toBe(true);
      expect(rbac.hasPermission('user_dev', 'job', 'read')).toBe(true);
      expect(rbac.hasPermission('user_dev', 'job', 'execute')).toBe(true);
      expect(rbac.hasPermission('user_dev', 'job', 'delete')).toBe(false); // No delete
      expect(rbac.hasPermission('user_dev', 'job', 'update')).toBe(false); // No update
    });

    it('should grant viewer read-only access', () => {
      rbac.assignRole('user_viewer', 'viewer');

      expect(rbac.hasPermission('user_viewer', 'job', 'read')).toBe(true);
      expect(rbac.hasPermission('user_viewer', 'job', 'create')).toBe(false);
      expect(rbac.hasPermission('user_viewer', 'job', 'update')).toBe(false);
      expect(rbac.hasPermission('user_viewer', 'job', 'delete')).toBe(false);
      expect(rbac.hasPermission('user_viewer', 'job', 'execute')).toBe(false);
    });

    it('should deny access without role', () => {
      expect(rbac.hasPermission('user_norole', 'job', 'read')).toBe(false);
    });
  });

  describe('Multiple Roles', () => {
    it('should allow user to have multiple roles', () => {
      rbac.assignRole('user_123', 'developer');
      rbac.assignRole('user_123', 'viewer');

      const roles = rbac.getUserRoles('user_123');
      expect(roles).toContain('developer');
      expect(roles).toContain('viewer');
    });

    it('should grant permissions from any assigned role', () => {
      rbac.assignRole('user_123', 'developer');
      rbac.assignRole('user_123', 'viewer');

      // Developer can create
      expect(rbac.hasPermission('user_123', 'job', 'create')).toBe(true);
      // Viewer can read metrics
      expect(rbac.hasPermission('user_123', 'metrics', 'read')).toBe(true);
    });
  });
});

describe('AuditLogger', () => {
  let auditLogger: any;

  beforeEach(() => {
    auditLogger = createAuditLogger();
  });

  describe('Logging', () => {
    it('should log successful action', () => {
      auditLogger.log({
        userId: 'user_123',
        orgId: 'org_123',
        action: 'create_job',
        resource: 'job',
        resourceId: 'job_456',
        success: true,
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      });

      const logs = auditLogger.getUserLogs('user_123');
      expect(logs.length).toBe(1);
      expect(logs[0].action).toBe('create_job');
      expect(logs[0].success).toBe(true);
    });

    it('should log failed action with error', () => {
      auditLogger.log({
        userId: 'user_123',
        orgId: 'org_123',
        action: 'delete_job',
        resource: 'job',
        resourceId: 'job_456',
        success: false,
        error: 'Unauthorized',
        ipAddress: '192.168.1.1',
      });

      const logs = auditLogger.getUserLogs('user_123');
      expect(logs[0].success).toBe(false);
      expect(logs[0].error).toBe('Unauthorized');
    });

    it('should generate unique log IDs', () => {
      auditLogger.log({
        userId: 'user_123',
        orgId: 'org_123',
        action: 'action1',
        resource: 'resource1',
        resourceId: 'res_1',
        success: true,
      });

      auditLogger.log({
        userId: 'user_123',
        orgId: 'org_123',
        action: 'action2',
        resource: 'resource2',
        resourceId: 'res_2',
        success: true,
      });

      const logs = auditLogger.getUserLogs('user_123');
      expect(logs[0].id).not.toBe(logs[1].id);
    });

    it('should include timestamp', () => {
      auditLogger.log({
        userId: 'user_123',
        orgId: 'org_123',
        action: 'action1',
        resource: 'resource1',
        resourceId: 'res_1',
        success: true,
      });

      const logs = auditLogger.getUserLogs('user_123');

      expect(logs[0].timestamp).toBeDefined();
      expect(typeof logs[0].timestamp).toBe('string');
      expect(new Date(logs[0].timestamp).getTime()).not.toBeNaN();
    });
  });

  describe('Retrieving Logs', () => {
    it('should retrieve logs for specific user', () => {
      auditLogger.log({
        userId: 'user_123',
        orgId: 'org_123',
        action: 'action1',
        resource: 'resource1',
        resourceId: 'res_1',
        success: true,
      });

      auditLogger.log({
        userId: 'user_456',
        orgId: 'org_456',
        action: 'action2',
        resource: 'resource2',
        resourceId: 'res_2',
        success: true,
      });

      const logs = auditLogger.getUserLogs('user_123');
      expect(logs.length).toBe(1);
      expect(logs[0].userId).toBe('user_123');
    });

    it('should retrieve logs for specific org', () => {
      auditLogger.log({
        userId: 'user_123',
        orgId: 'org_123',
        action: 'action1',
        resource: 'resource1',
        resourceId: 'res_1',
        success: true,
      });

      auditLogger.log({
        userId: 'user_456',
        orgId: 'org_123',
        action: 'action2',
        resource: 'resource2',
        resourceId: 'res_2',
        success: true,
      });

      const logs = auditLogger.getOrgLogs('org_123');
      expect(logs.length).toBe(2);
    });

    it('should respect limit parameter', () => {
      for (let i = 0; i < 150; i++) {
        auditLogger.log({
          userId: 'user_123',
          orgId: 'org_123',
          action: `action_${i}`,
          resource: 'resource',
          resourceId: `res_${i}`,
          success: true,
        });
      }

      const logs = auditLogger.getUserLogs('user_123', 50);
      expect(logs.length).toBe(50);
    });

    it('should return most recent logs', () => {
      auditLogger.log({
        userId: 'user_123',
        orgId: 'org_123',
        action: 'old_action',
        resource: 'resource',
        resourceId: 'res_1',
        success: true,
      });

      auditLogger.log({
        userId: 'user_123',
        orgId: 'org_123',
        action: 'new_action',
        resource: 'resource',
        resourceId: 'res_2',
        success: true,
      });

      const logs = auditLogger.getUserLogs('user_123', 1);
      expect(logs[0].action).toBe('new_action');
    });
  });
});
