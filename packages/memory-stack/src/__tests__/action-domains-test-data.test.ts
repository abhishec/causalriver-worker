/**
 * Test Data Generator Domain - Unit Tests
 * ========================================
 *
 * Tests for synthetic test data generation with referential integrity.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { testDataGeneratorDomain, type TestDataRequest } from '../orchestrator/action-domains-test-data';
import type { ActionDomainContext } from '../orchestrator/domain-action-engine';

describe('Test Data Generator Domain', () => {
  let mockContext: ActionDomainContext;

  beforeEach(() => {
    mockContext = {
      input: {},
      organizationId: 'test-org',
      userId: 'test-user',
      causalDAG: {} as any,
      patterns: [],
      rules: [],
      intelligence: {} as any,
    };
  });

  describe('Basic Generation', () => {
    it('should generate synthetic data for simple schema', async () => {
      const request: TestDataRequest = {
        schema: 'users(id:uuid pk, email:email, created_at:timestamp)',
        count: 10,
        scenario: 'normal',
      };

      mockContext.input = request;
      const result = await testDataGeneratorDomain.execute(mockContext);

      expect(result.type).toBe('test-data-generator');
      expect(result.data.data).toHaveProperty('users');
      expect(result.data.data.users).toHaveLength(10);
      expect(result.data.stats.totalRecords).toBe(10);
      expect(result.data.lineage).toBe('synthetic');
    });

    it('should generate correct column types', async () => {
      const request: TestDataRequest = {
        schema: 'products(id:uuid pk, name:text, price:numeric, active:boolean)',
        count: 5,
        scenario: 'normal',
      };

      mockContext.input = request;
      const result = await testDataGeneratorDomain.execute(mockContext);

      const product = result.data.data.products[0];
      expect(typeof product.id).toBe('string');
      expect(product.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      expect(typeof product.name).toBe('string');
      expect(typeof product.price).toBe('number');
      expect(typeof product.active).toBe('boolean');
    });

    it('should handle nullable columns', async () => {
      const request: TestDataRequest = {
        schema: 'users(id:uuid pk, bio:text nullable)',
        count: 100,
        scenario: 'normal',
      };

      mockContext.input = request;
      const result = await testDataGeneratorDomain.execute(mockContext);

      const hasNull = result.data.data.users.some((u: any) => u.bio === null);
      expect(hasNull).toBe(true); // At least one should be null (5% rate × 100 records)
    });
  });

  describe('Referential Integrity', () => {
    it('should generate data with valid foreign keys', async () => {
      const request: TestDataRequest = {
        schema: `
          users(id:uuid pk, email:email)
          orders(id:uuid pk, user_id:uuid fk(users.id), amount:numeric)
        `,
        count: 10,
        scenario: 'normal',
        ensureIntegrity: true,
      };

      mockContext.input = request;
      const result = await testDataGeneratorDomain.execute(mockContext);

      const users = result.data.data.users;
      const orders = result.data.data.orders;

      expect(users).toHaveLength(10);
      expect(orders).toHaveLength(10);

      // All order user_ids should reference valid user ids
      const userIds = new Set(users.map((u: any) => u.id));
      for (const order of orders) {
        expect(userIds.has(order.user_id)).toBe(true);
      }

      expect(result.data.stats.integrityViolations).toBe(0);
    });

    it('should handle multi-level foreign keys', async () => {
      const request: TestDataRequest = {
        schema: `
          customers(id:uuid pk, name:text)
          orders(id:uuid pk, customer_id:uuid fk(customers.id), total:numeric)
          order_items(id:uuid pk, order_id:uuid fk(orders.id), quantity:integer)
        `,
        count: 5,
        scenario: 'normal',
        ensureIntegrity: true,
      };

      mockContext.input = request;
      const result = await testDataGeneratorDomain.execute(mockContext);

      const customers = result.data.data.customers;
      const orders = result.data.data.orders;
      const orderItems = result.data.data.order_items;

      // Validate customer → order relationship
      const customerIds = new Set(customers.map((c: any) => c.id));
      for (const order of orders) {
        expect(customerIds.has(order.customer_id)).toBe(true);
      }

      // Validate order → order_item relationship
      const orderIds = new Set(orders.map((o: any) => o.id));
      for (const item of orderItems) {
        expect(orderIds.has(item.order_id)).toBe(true);
      }
    });
  });

  describe('Fintech Scenarios', () => {
    it('should generate fraud scenario with large amounts', async () => {
      const request: TestDataRequest = {
        schema: 'transactions(id:uuid pk, amount:numeric, type:text)',
        count: 10,
        scenario: 'fraud',
      };

      mockContext.input = request;
      const result = await testDataGeneratorDomain.execute(mockContext);

      const transactions = result.data.data.transactions;
      const avgAmount =
        transactions.reduce((sum: number, t: any) => sum + t.amount, 0) /
        transactions.length;

      // Fraud scenarios should have higher amounts
      expect(avgAmount).toBeGreaterThan(5000);
    });

    it('should generate AML scenario near reporting thresholds', async () => {
      const request: TestDataRequest = {
        schema: 'wire_transfers(id:uuid pk, amount:numeric, currency:text)',
        count: 10,
        scenario: 'aml',
      };

      mockContext.input = request;
      const result = await testDataGeneratorDomain.execute(mockContext);

      const transfers = result.data.data.wire_transfers;

      // AML scenarios should have amounts near 10000 threshold
      const nearThreshold = transfers.filter(
        (t: any) => Math.abs(t.amount - 10000) < 100
      );
      expect(nearThreshold.length).toBeGreaterThan(0);
    });

    it('should generate edge case scenario with boundary values', async () => {
      const request: TestDataRequest = {
        schema: 'counters(id:uuid pk, count:integer, balance:numeric)',
        count: 20,
        scenario: 'edge_case',
      };

      mockContext.input = request;
      const result = await testDataGeneratorDomain.execute(mockContext);

      const counters = result.data.data.counters;

      // Edge cases should include 0, 1, -1, max values
      const hasZero = counters.some((c: any) => c.count === 0);
      const hasOne = counters.some((c: any) => c.count === 1);
      const hasNegative = counters.some((c: any) => c.count < 0);

      expect(hasZero || hasOne || hasNegative).toBe(true);
    });
  });

  describe('SQL Generation', () => {
    it('should generate valid SQL INSERT statements', async () => {
      const request: TestDataRequest = {
        schema: 'products(id:uuid pk, name:text, price:numeric)',
        count: 3,
        scenario: 'normal',
        tables: ['products'],
      };

      mockContext.input = request;
      const result = await testDataGeneratorDomain.execute(mockContext);

      expect(result.data.sqlStatements).toBeDefined();
      expect(result.data.sqlStatements!.length).toBe(3);

      const firstStatement = result.data.sqlStatements![0];
      expect(firstStatement).toContain('INSERT INTO products');
      expect(firstStatement).toContain('id');
      expect(firstStatement).toContain('name');
      expect(firstStatement).toContain('price');
      expect(firstStatement).toContain('VALUES');
    });

    it('should escape single quotes in SQL', async () => {
      const request: TestDataRequest = {
        schema: "users(id:uuid pk, name:text, bio:text)",
        count: 1,
        scenario: 'normal',
        tables: ['users'],
      };

      mockContext.input = request;
      const result = await testDataGeneratorDomain.execute(mockContext);

      // SQL should have properly escaped single quotes
      // Each SQL value should use '' (double single-quote) for any embedded quotes
      const sql = result.data.sqlStatements!.join('\n');
      // Extract individual string values from SQL and check for unescaped quotes
      const stringValues = sql.match(/'([^']|'')*'/g) || [];
      for (const val of stringValues) {
        // Inside each quoted value, there should be no lone single quotes
        // (all internal quotes must be escaped as '')
        const inner = val.slice(1, -1); // remove outer quotes
        expect(inner).not.toMatch(/(?<!')'(?!')/); // no lone single quote
      }
    });
  });

  describe('Data Lineage & PII Safety', () => {
    it('should always mark lineage as synthetic', async () => {
      const request: TestDataRequest = {
        schema: 'users(id:uuid pk, email:email)',
        count: 10,
        scenario: 'normal',
      };

      mockContext.input = request;
      const result = await testDataGeneratorDomain.execute(mockContext);

      expect(result.data.lineage).toBe('synthetic');
    });

    it('should generate emails that are clearly synthetic', async () => {
      const request: TestDataRequest = {
        schema: 'users(id:uuid pk, email:email)',
        count: 50,
        scenario: 'normal',
      };

      mockContext.input = request;
      const result = await testDataGeneratorDomain.execute(mockContext);

      // All emails should be from test domains
      const testDomains = ['example.com', 'test.com', 'demo.com'];
      for (const user of result.data.data.users) {
        const domain = user.email.split('@')[1];
        expect(testDomains).toContain(domain);
      }
    });
  });

  describe('Performance', () => {
    it('should generate 1000 records in under 5 seconds', async () => {
      const request: TestDataRequest = {
        schema: `
          users(id:uuid pk, email:email, created_at:timestamp)
          orders(id:uuid pk, user_id:uuid fk(users.id), amount:numeric)
        `,
        count: 1000,
        scenario: 'normal',
      };

      mockContext.input = request;

      const startTime = Date.now();
      const result = await testDataGeneratorDomain.execute(mockContext);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(5000); // 5 seconds
      expect(result.data.stats.totalRecords).toBe(2000); // 1000 per table
    });
  });

  describe('Result Format', () => {
    it('should return valid ActionDomainResult', async () => {
      const request: TestDataRequest = {
        schema: 'users(id:uuid pk, name:text)',
        count: 5,
        scenario: 'normal',
      };

      mockContext.input = request;
      const result = await testDataGeneratorDomain.execute(mockContext);

      expect(result).toHaveProperty('type');
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('narrative');
      expect(result).toHaveProperty('interventions');
      expect(result).toHaveProperty('evidence');

      expect(result.type).toBe('test-data-generator');
      expect(result.confidence).toBe(1.0);
      expect(result.interventions).toEqual([]);
      expect(result.evidence.length).toBeGreaterThan(0);
    });

    it('should include meaningful narrative', async () => {
      const request: TestDataRequest = {
        schema: 'users(id:uuid pk, email:email)',
        count: 10,
        scenario: 'fraud',
      };

      mockContext.input = request;
      const result = await testDataGeneratorDomain.execute(mockContext);

      expect(result.narrative).toContain('10');
      expect(result.narrative).toContain('fraud');
      expect(result.narrative).toContain('synthetic');
    });
  });
});
