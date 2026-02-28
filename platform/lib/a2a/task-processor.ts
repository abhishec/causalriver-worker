/**
 * A2A Task Processor
 * ===================
 * Previously contained processA2ATasks, processA2AAasTasks, processA2APmAasTasks.
 *
 * These 3 functions were DELETED (BUG B fix) because they raced with the primary
 * service processors (processSeAaSJobs, processAaSJobs, processPmAaSJobs) for the
 * same agent_queue rows (agent_type='se-aas'|'aas'|'pm-aas'). When the A2A
 * processor won the claim race, the FSM/backpressure/RL steps inside the primary
 * processors were silently skipped.
 *
 * The primary service processors already handle all A2A-origin jobs — A2A jobs
 * have agent_type='se-aas'|'aas'|'pm-aas', NOT 'a2a', so they flow through the
 * exact same queue path as non-A2A jobs. No separate processor is needed.
 *
 * This file is kept (not deleted) to avoid breaking any dynamic imports that may
 * reference the path. It exports nothing.
 */
