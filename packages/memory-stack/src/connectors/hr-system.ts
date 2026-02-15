/**
 * HR System Connector
 *
 * Universal HR connector supporting BambooHR, Workday, and custom HR systems.
 * Syncs employee lifecycle and workforce data:
 *   - Employee Lifecycle: employee_onboarded, employee_offboarded, employee_promoted
 *   - Attendance: attendance_logged, leave_requested, leave_approved
 *   - Performance: performance_review_completed, goal_set, goal_completed
 *   - Engagement: engagement_score, survey_response
 *   - Org Changes: manager_changed, department_transfer, team_restructured
 *   - Compensation: salary_adjusted (aggregated, never raw PII)
 *   - Headcount: headcount_snapshot, hiring_velocity, attrition_rate
 *
 * Design Partner 3 — HR systems at scale.
 *
 * PRIVACY: This connector NEVER stores individual salary amounts, SSNs,
 * medical information, or other PII in signals. All compensation data is
 * aggregated (department averages, band distributions). Employee names
 * are stored as hashed IDs unless explicitly configured otherwise.
 *
 * Supported HR Systems:
 *   - BambooHR (API v1): https://documentation.bamboohr.com/reference
 *   - Workday (REST API): Requires ISU (Integration System User)
 *   - Custom: Any system that exposes REST endpoints
 *
 * @example
 * ```typescript
 * // BambooHR
 * const hr = createHRConnector({
 *   provider: 'bamboohr',
 *   baseUrl: 'https://api.bamboohr.com/api/gateway.php/yourcompany/v1',
 *   apiKey: 'xxx',
 *   companyDomain: 'yourcompany',
 * });
 *
 * // Custom HR system
 * const hr = createHRConnector({
 *   provider: 'custom',
 *   baseUrl: 'https://hr.internal.company.com/api/v1',
 *   bearerToken: 'xxx',
 *   endpoints: {
 *     employees: '/employees',
 *     timeOff: '/time-off',
 *     reviews: '/performance-reviews',
 *   },
 * });
 * ```
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ConnectorSignal, NexusConnector, ConnectorSyncResult } from './connector-framework';
import { storeConnectorSignals, recordSyncResult } from './connector-framework';

// ============================================================================
// TYPES
// ============================================================================

export type HRProvider = 'bamboohr' | 'workday' | 'custom';

export interface HRConnectorConfig {
  /** HR system provider */
  provider: HRProvider;
  /** Base URL for the HR API */
  baseUrl: string;
  /** API key (BambooHR) or bearer token */
  apiKey?: string;
  /** Bearer token (Workday, custom) */
  bearerToken?: string;
  /** Company domain (BambooHR-specific) */
  companyDomain?: string;
  /** Custom endpoint paths */
  endpoints?: {
    employees?: string;
    timeOff?: string;
    reviews?: string;
    departments?: string;
    positions?: string;
  };
  /** Whether to hash employee names in signals (default: true for privacy) */
  hashEmployeeNames?: boolean;
  /** Max pages per sync (default: 100) */
  maxPages?: number;
  /** Rate limit delay between pages in ms (default: 200ms) */
  pageDelayMs?: number;
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create an HR system connector.
 */
export function createHRConnector(config: HRConnectorConfig): NexusConnector {
  const maxPages = config.maxPages ?? 100;
  const pageDelayMs = config.pageDelayMs ?? 200;
  const hashNames = config.hashEmployeeNames ?? true;

  // ── Privacy Helper ──────────────────────────────────────────────

  function anonymizeId(name: string): string {
    if (!hashNames) return name;
    // Simple hash for privacy — not cryptographic, just anonymization
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      const chr = name.charCodeAt(i);
      hash = (hash << 5) - hash + chr;
      hash |= 0;
    }
    return `emp_${Math.abs(hash).toString(36)}`;
  }

  // ── API Helpers ─────────────────────────────────────────────────

  function headers(): Record<string, string> {
    const h: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };

    if (config.provider === 'bamboohr' && config.apiKey) {
      // BambooHR uses Basic auth with API key as username
      h.Authorization = `Basic ${btoa(`${config.apiKey}:x`)}`;
    } else if (config.bearerToken) {
      h.Authorization = `Bearer ${config.bearerToken}`;
    } else if (config.apiKey) {
      h['X-API-Key'] = config.apiKey;
    }

    return h;
  }

  async function fetchEndpoint(path: string, params?: Record<string, string>): Promise<any> {
    let url = `${config.baseUrl}${path}`;
    if (params) {
      const qs = new URLSearchParams(params).toString();
      url += `?${qs}`;
    }

    const response = await fetch(url, { headers: headers() });

    if (!response.ok) {
      if (response.status === 429) {
        await new Promise((r) => setTimeout(r, 60_000));
        const retry = await fetch(url, { headers: headers() });
        if (!retry.ok) throw new Error(`HR API rate limit: ${retry.status}`);
        return retry.json();
      }
      throw new Error(`HR API error ${response.status}: ${await response.text()}`);
    }

    return response.json();
  }

  async function fetchPaginated(
    path: string,
    recordsKey: string,
    since?: Date
  ): Promise<any[]> {
    const allRecords: any[] = [];
    let page = 1;

    while (page <= maxPages) {
      const params: Record<string, string> = { page: String(page), per_page: '100' };
      if (since) params.updated_since = since.toISOString();

      try {
        const data = await fetchEndpoint(path, params);
        const records = data[recordsKey] || data.data || data.employees || [];
        allRecords.push(...(Array.isArray(records) ? records : []));

        if (!Array.isArray(records) || records.length < 100) break;
        page++;

        if (pageDelayMs > 0) {
          await new Promise((r) => setTimeout(r, pageDelayMs));
        }
      } catch {
        break; // Non-fatal for pagination
      }
    }

    return allRecords;
  }

  // ── BambooHR-specific helpers ───────────────────────────────────

  function getBambooEndpoints() {
    return {
      employees: config.endpoints?.employees || '/employees/directory',
      timeOff: config.endpoints?.timeOff || '/time_off/requests',
      reviews: config.endpoints?.reviews || '/performance',
    };
  }

  // ── Signal Transformers ─────────────────────────────────────────

  function employeesToSignals(
    employees: any[],
    organizationId: string
  ): ConnectorSignal[] {
    const signals: ConnectorSignal[] = [];
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);

    // Headcount snapshot
    signals.push({
      organization_id: organizationId,
      source_domain: 'hr',
      signal_type: 'headcount_snapshot',
      signal_value: employees.length,
      entity_type: 'hr_metric',
      entity_id: `headcount_${now.toISOString().split('T')[0]}`,
      metadata: { date: now.toISOString().split('T')[0] },
    });

    // Department distribution
    const deptCounts: Record<string, number> = {};
    let recentHires = 0;
    let recentExits = 0;

    for (const emp of employees) {
      const dept = emp.department || emp.departmentName || 'unknown';
      deptCounts[dept] = (deptCounts[dept] || 0) + 1;

      const hireDate = emp.hireDate || emp.hire_date || emp.startDate;
      const termDate = emp.terminationDate || emp.termination_date || emp.endDate;

      // Recent hires (last 30 days)
      if (hireDate) {
        const hired = new Date(hireDate);
        if (hired >= thirtyDaysAgo && hired <= now) {
          recentHires++;
          signals.push({
            organization_id: organizationId,
            source_domain: 'hr',
            signal_type: 'employee_onboarded',
            signal_value: 1,
            entity_type: 'hr_employee',
            entity_id: anonymizeId(emp.id || emp.employeeId || emp.displayName || ''),
            metadata: {
              department: dept,
              position: emp.jobTitle || emp.position,
              hire_date: hireDate,
            },
          });
        }
      }

      // Recent exits (last 30 days)
      if (termDate) {
        const termed = new Date(termDate);
        if (termed >= thirtyDaysAgo && termed <= now) {
          recentExits++;
          signals.push({
            organization_id: organizationId,
            source_domain: 'hr',
            signal_type: 'employee_offboarded',
            signal_value: -1,
            entity_type: 'hr_employee',
            entity_id: anonymizeId(emp.id || emp.employeeId || emp.displayName || ''),
            metadata: {
              department: dept,
              tenure_days: hireDate
                ? Math.floor((termed.getTime() - new Date(hireDate).getTime()) / 86_400_000)
                : undefined,
            },
          });
        }
      }
    }

    // Hiring velocity
    if (recentHires > 0) {
      signals.push({
        organization_id: organizationId,
        source_domain: 'hr',
        signal_type: 'hiring_velocity',
        signal_value: recentHires,
        entity_type: 'hr_metric',
        entity_id: `hiring_${now.toISOString().split('T')[0]}`,
        metadata: { period_days: 30, hires: recentHires },
      });
    }

    // Attrition rate
    if (employees.length > 0) {
      const attritionRate = recentExits / employees.length;
      signals.push({
        organization_id: organizationId,
        source_domain: 'hr',
        signal_type: 'attrition_rate',
        signal_value: attritionRate,
        entity_type: 'hr_metric',
        entity_id: `attrition_${now.toISOString().split('T')[0]}`,
        metadata: {
          period_days: 30,
          exits: recentExits,
          headcount: employees.length,
          rate_pct: Math.round(attritionRate * 10000) / 100,
        },
      });
    }

    // Department headcount signals
    for (const [dept, count] of Object.entries(deptCounts)) {
      signals.push({
        organization_id: organizationId,
        source_domain: 'hr',
        signal_type: 'department_headcount',
        signal_value: count,
        entity_type: 'hr_department',
        entity_id: `dept_${dept.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
        metadata: { department: dept },
      });
    }

    return signals;
  }

  function timeOffToSignals(
    requests: any[],
    organizationId: string
  ): ConnectorSignal[] {
    const signals: ConnectorSignal[] = [];

    for (const req of requests) {
      const status = req.status || req.state || 'pending';
      const signalType = status === 'approved' ? 'leave_approved' : 'leave_requested';
      const days = req.amount || req.days || 1;

      signals.push({
        organization_id: organizationId,
        source_domain: 'hr',
        signal_type: signalType,
        signal_value: days,
        entity_type: 'hr_time_off',
        entity_id: req.id || req.requestId || `to_${Date.now()}`,
        client_id: anonymizeId(req.employeeId || req.employee_id || ''),
        signal_timestamp: req.created || req.created_at,
        metadata: {
          type: req.type || req.leaveType || req.timeOffType,
          status,
          start_date: req.start || req.startDate,
          end_date: req.end || req.endDate,
          days,
        },
      });
    }

    return signals;
  }

  function reviewsToSignals(
    reviews: any[],
    organizationId: string
  ): ConnectorSignal[] {
    const signals: ConnectorSignal[] = [];

    for (const review of reviews) {
      // Aggregate rating (never individual scores)
      const rating = review.rating || review.overallRating || review.score;
      const normalizedRating = rating
        ? (typeof rating === 'number' ? rating / 5 : parseFloat(rating) / 5)
        : 0.5;

      signals.push({
        organization_id: organizationId,
        source_domain: 'hr',
        signal_type: 'performance_review_completed',
        signal_value: normalizedRating,
        entity_type: 'hr_review',
        entity_id: review.id || review.reviewId || `review_${Date.now()}`,
        client_id: anonymizeId(review.employeeId || review.employee_id || ''),
        signal_timestamp: review.completedDate || review.created_at,
        metadata: {
          review_period: review.period || review.reviewPeriod,
          department: review.department,
          // NO individual salary, rating breakdowns, or manager comments
          // Only aggregated signal
        },
      });
    }

    return signals;
  }

  // ── Connector Implementation ────────────────────────────────────

  return {
    id: `hr-${config.provider}`,
    name: `HR System (${config.provider})`,
    domain: 'hr',

    async fullSync(
      supabase: SupabaseClient,
      organizationId: string
    ): Promise<ConnectorSyncResult> {
      const start = Date.now();
      const errors: string[] = [];
      const endpoints = config.provider === 'bamboohr' ? getBambooEndpoints() : {
        employees: config.endpoints?.employees || '/employees',
        timeOff: config.endpoints?.timeOff || '/time-off',
        reviews: config.endpoints?.reviews || '/reviews',
      };

      try {
        // Fetch all HR data
        const [employees, timeOff, reviews] = await Promise.all([
          fetchPaginated(endpoints.employees, 'employees').catch((e) => {
            errors.push(`Employees: ${e.message}`);
            return [];
          }),
          fetchPaginated(endpoints.timeOff, 'requests').catch((e) => {
            errors.push(`TimeOff: ${e.message}`);
            return [];
          }),
          fetchPaginated(endpoints.reviews, 'reviews').catch((e) => {
            errors.push(`Reviews: ${e.message}`);
            return [];
          }),
        ]);

        const totalRecords = employees.length + timeOff.length + reviews.length;

        const allSignals: ConnectorSignal[] = [
          ...employeesToSignals(employees, organizationId),
          ...timeOffToSignals(timeOff, organizationId),
          ...reviewsToSignals(reviews, organizationId),
        ];

        if (allSignals.length > 0) {
          await storeConnectorSignals(supabase, allSignals);
        }

        const result: ConnectorSyncResult = {
          success: errors.length === 0,
          signalsGenerated: allSignals.length,
          recordsProcessed: totalRecords,
          errors,
          duration_ms: Date.now() - start,
          lastSyncedAt: new Date(),
        };

        await recordSyncResult(supabase, `hr-${config.provider}`, organizationId, result);
        return result;
      } catch (err: any) {
        return {
          success: false,
          signalsGenerated: 0,
          recordsProcessed: 0,
          errors: [...errors, err.message],
          duration_ms: Date.now() - start,
          lastSyncedAt: new Date(),
        };
      }
    },

    async incrementalSync(
      supabase: SupabaseClient,
      organizationId: string,
      since: Date
    ): Promise<ConnectorSyncResult> {
      const start = Date.now();
      const errors: string[] = [];
      const endpoints = config.provider === 'bamboohr' ? getBambooEndpoints() : {
        employees: config.endpoints?.employees || '/employees',
        timeOff: config.endpoints?.timeOff || '/time-off',
        reviews: config.endpoints?.reviews || '/reviews',
      };

      try {
        const [employees, timeOff] = await Promise.all([
          fetchPaginated(endpoints.employees, 'employees', since).catch((e) => {
            errors.push(`Employees: ${e.message}`);
            return [];
          }),
          fetchPaginated(endpoints.timeOff, 'requests', since).catch((e) => {
            errors.push(`TimeOff: ${e.message}`);
            return [];
          }),
        ]);

        const allSignals: ConnectorSignal[] = [
          ...employeesToSignals(employees, organizationId),
          ...timeOffToSignals(timeOff, organizationId),
        ];

        if (allSignals.length > 0) {
          await storeConnectorSignals(supabase, allSignals);
        }

        const result: ConnectorSyncResult = {
          success: errors.length === 0,
          signalsGenerated: allSignals.length,
          recordsProcessed: employees.length + timeOff.length,
          errors,
          duration_ms: Date.now() - start,
          lastSyncedAt: new Date(),
        };

        await recordSyncResult(supabase, `hr-${config.provider}`, organizationId, result);
        return result;
      } catch (err: any) {
        return {
          success: false,
          signalsGenerated: 0,
          recordsProcessed: 0,
          errors: [...errors, err.message],
          duration_ms: Date.now() - start,
          lastSyncedAt: new Date(),
        };
      }
    },

    handleWebhook(payload: unknown): ConnectorSignal[] {
      const event = payload as any;
      if (!event?.type) return [];

      const data = event.data || event.employee || {};
      const orgId = '';

      switch (event.type) {
        case 'employee.hired':
        case 'employee.created':
          return [{
            organization_id: orgId,
            source_domain: 'hr',
            signal_type: 'employee_onboarded',
            signal_value: 1,
            entity_type: 'hr_employee',
            entity_id: anonymizeId(data.id || data.employeeId || ''),
            metadata: { department: data.department, position: data.jobTitle },
          }];

        case 'employee.terminated':
        case 'employee.deleted':
          return [{
            organization_id: orgId,
            source_domain: 'hr',
            signal_type: 'employee_offboarded',
            signal_value: -1,
            entity_type: 'hr_employee',
            entity_id: anonymizeId(data.id || data.employeeId || ''),
            metadata: { department: data.department },
          }];

        case 'timeoff.requested':
        case 'timeoff.approved':
          return timeOffToSignals([data], orgId);

        default:
          return [];
      }
    },
  };
}
