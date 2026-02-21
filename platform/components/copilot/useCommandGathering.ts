/**
 * useCommandGathering — Conversational Parameter Gathering Hook
 * =============================================================
 *
 * State machine that manages interactive parameter collection before
 * executing a command. When a user selects a slash command that has
 * gathering requirements, this hook drives the conversation:
 *
 *   idle → gathering (param by param) → confirming → executing → idle
 *
 * It emits messages and inline interactive elements for CopilotChat
 * to render within the chat stream.
 */

import { useCallback, useMemo, useRef, useState } from "react";

import type { SlashCommand } from "./SlashCommandPicker";
import {
  COMMAND_GATHERING_MAP,
  type CommandGathering,
  type GatheringParam,
} from "./command-gathering";

// ── Types ────────────────────────────────────────────────────────────────────

export type GatheringPhase =
  | "idle"
  | "gathering"
  | "confirming"
  | "executing";

export interface GatheringMessage {
  role: "assistant" | "user";
  content: string;
  /** Interactive elements to render after the text */
  interactive?: GatheringInteractive;
}

export type GatheringInteractive =
  | {
      type: "chips";
      paramId: string;
      options: { value: string; label: string; icon?: string }[];
      multiSelect: boolean;
    }
  | {
      type: "date";
      paramId: string;
      defaultValue?: string;
    }
  | {
      type: "date_range";
      paramId: string;
    }
  | {
      type: "number";
      paramId: string;
      defaultValue?: number;
      description?: string;
    }
  | {
      type: "file";
      paramId: string;
      accept?: string;
      multiple?: boolean;
      description?: string;
    }
  | {
      type: "gl_check";
      paramId: string;
      glStatusEndpoint: string;
      orgId: string;
      description?: string;
    }
  | {
      type: "confirm";
      message: string;
      params: Record<string, unknown>;
    };

export interface GatheringState {
  phase: GatheringPhase;
  command: SlashCommand | null;
  gathering: CommandGathering | null;
  collectedParams: Record<string, unknown>;
  currentParamIndex: number;
  messages: GatheringMessage[];
  currentInteractive: GatheringInteractive | null;
  /** Loading state for fetching dynamic options */
  loadingOptions: boolean;
}

export interface UseCommandGatheringReturn {
  state: GatheringState;
  /** Start gathering for a command. Returns false if no gathering needed. */
  startGathering: (cmd: SlashCommand) => boolean;
  /** Submit a value for the current parameter */
  submitParam: (value: unknown) => void;
  /** Skip the current optional parameter */
  skipParam: () => void;
  /** Confirm and build the final prompt */
  confirm: () => string | null;
  /** Cancel gathering and reset */
  cancel: () => void;
  /** Reset gathering state back to idle (call after execution completes) */
  reset: () => void;
  /** Whether gathering is active */
  isActive: boolean;
  /** Get label for a collected param value */
  getParamLabel: (paramId: string, value: unknown) => string;
}

// ── Initial State ────────────────────────────────────────────────────────────

const INITIAL_STATE: GatheringState = {
  phase: "idle",
  command: null,
  gathering: null,
  collectedParams: {},
  currentParamIndex: 0,
  messages: [],
  currentInteractive: null,
  loadingOptions: false,
};

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useCommandGathering(
  customGatheringMap?: Record<string, CommandGathering>
): UseCommandGatheringReturn {
  const [state, setState] = useState<GatheringState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);

  // ── Merged gathering map (system + custom templates) ──────────────────
  const effectiveMap = useMemo(
    () =>
      customGatheringMap
        ? { ...COMMAND_GATHERING_MAP, ...customGatheringMap }
        : COMMAND_GATHERING_MAP,
    [customGatheringMap]
  );

  // ── Helpers ──────────────────────────────────────────────────────────────

  const resolveEndpoint = useCallback(
    (endpoint: string, params: Record<string, unknown>): string => {
      return endpoint.replace(/\{\{(\w+)\}\}/g, (_, key) =>
        encodeURIComponent(String(params[key] ?? ""))
      );
    },
    []
  );

  const fetchOptions = useCallback(
    async (
      param: GatheringParam,
      params: Record<string, unknown>
    ): Promise<{ value: string; label: string }[]> => {
      if (param.staticOptions) return param.staticOptions;
      if (!param.optionsEndpoint) return [];

      const endpoint = resolveEndpoint(param.optionsEndpoint, params);
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        setState((s) => ({ ...s, loadingOptions: true }));
        const res = await fetch(endpoint, { signal: controller.signal });
        if (!res.ok) return [];
        const data = await res.json();
        const key = param.optionsKey || "items";
        const items = data[key] || data || [];
        return Array.isArray(items)
          ? items.map((item: { id?: string; name?: string; slug?: string; label?: string; value?: string }) => ({
              value: String(item.id ?? item.slug ?? item.value ?? item.name ?? ""),
              label: String(item.name ?? item.label ?? item.id ?? ""),
            }))
          : [];
      } catch {
        return [];
      } finally {
        if (!controller.signal.aborted) {
          setState((s) => ({ ...s, loadingOptions: false }));
        }
      }
    },
    [resolveEndpoint]
  );

  const buildInteractive = useCallback(
    (
      param: GatheringParam,
      options: { value: string; label: string; icon?: string }[],
      collectedParams?: Record<string, unknown>
    ): GatheringInteractive | null => {
      switch (param.type) {
        case "select":
        case "chips":
          return {
            type: "chips",
            paramId: param.id,
            options,
            multiSelect: param.type === "chips",
          };
        case "date":
          return {
            type: "date",
            paramId: param.id,
            defaultValue:
              param.defaultValue === "today"
                ? new Date().toISOString().split("T")[0]
                : String(param.defaultValue ?? ""),
          };
        case "date_range":
          return { type: "date_range", paramId: param.id };
        case "number":
          return {
            type: "number",
            paramId: param.id,
            defaultValue:
              typeof param.defaultValue === "number"
                ? param.defaultValue
                : undefined,
            description: param.description,
          };
        case "file":
          return {
            type: "file",
            paramId: param.id,
            accept: param.accept,
            multiple: param.multiple,
            description: param.description,
          };
        case "gl_check":
          return {
            type: "gl_check",
            paramId: param.id,
            glStatusEndpoint: param.glStatusEndpoint || "/api/aaas/gl-status",
            orgId: String(collectedParams?.["org"] || ""),
            description: param.description,
          };
        case "text":
          return null; // Free text — no interactive element needed
        default:
          return null;
      }
    },
    []
  );

  const resolveConfirmationMessage = useCallback(
    (template: string, params: Record<string, unknown>): string => {
      return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
        const val = params[key];
        if (val === undefined || val === null || val === "") return "";
        if (Array.isArray(val)) return ` filtering by ${val.join(", ")}`;
        if (val === "none") return "";
        return String(val);
      });
    },
    []
  );

  // ── Actions ──────────────────────────────────────────────────────────────

  const advanceToParam = useCallback(
    async (
      gathering: CommandGathering,
      paramIndex: number,
      params: Record<string, unknown>,
      prevMessages: GatheringMessage[]
    ) => {
      // If we've collected all params, move to confirming
      if (paramIndex >= gathering.params.length) {
        const confirmMsg = resolveConfirmationMessage(
          gathering.confirmationMessage,
          params
        );
        setState((s) => ({
          ...s,
          phase: "confirming",
          currentParamIndex: paramIndex,
          messages: [
            ...prevMessages,
            { role: "assistant", content: confirmMsg },
          ],
          currentInteractive: {
            type: "confirm",
            message: confirmMsg,
            params,
          },
        }));
        return;
      }

      const param = gathering.params[paramIndex];

      // Skip params whose dependency isn't met yet (shouldn't happen with sequential flow)
      if (param.dependsOn && !params[param.dependsOn]) {
        advanceToParam(gathering, paramIndex + 1, params, prevMessages);
        return;
      }

      // Fetch options for this param
      const options = await fetchOptions(param, params);

      // Build the gathering prompt
      let prompt =
        gathering.gatheringPrompts[param.id] ?? `What is the ${param.label}?`;

      // Replace {{count}} with actual count
      prompt = prompt.replace("{{count}}", String(options.length));

      const interactive = buildInteractive(param, options, params);

      setState((s) => ({
        ...s,
        phase: "gathering",
        currentParamIndex: paramIndex,
        messages: [
          ...prevMessages,
          {
            role: "assistant",
            content: prompt,
            interactive: interactive ?? undefined,
          },
        ],
        currentInteractive: interactive,
        loadingOptions: false,
      }));
    },
    [fetchOptions, buildInteractive, resolveConfirmationMessage]
  );

  const startGathering = useCallback(
    (cmd: SlashCommand): boolean => {
      const gathering = effectiveMap[cmd.id];
      if (!gathering || gathering.params.length === 0) return false;

      const initialState: GatheringState = {
        phase: "gathering",
        command: cmd,
        gathering,
        collectedParams: {},
        currentParamIndex: 0,
        messages: [],
        currentInteractive: null,
        loadingOptions: false,
      };

      setState(initialState);

      // Start gathering from the first param
      advanceToParam(gathering, 0, {}, []);

      return true;
    },
    [advanceToParam]
  );

  const submitParam = useCallback(
    (value: unknown) => {
      setState((prev) => {
        if (prev.phase !== "gathering" || !prev.gathering) return prev;

        const param = prev.gathering.params[prev.currentParamIndex];
        if (!param) return prev;

        const newParams = { ...prev.collectedParams, [param.id]: value };
        const userLabel =
          typeof value === "string" ? value : JSON.stringify(value);

        const newMessages: GatheringMessage[] = [
          ...prev.messages,
          { role: "user", content: userLabel },
        ];

        // Advance to next param asynchronously
        const nextIndex = prev.currentParamIndex + 1;
        advanceToParam(prev.gathering, nextIndex, newParams, newMessages);

        return {
          ...prev,
          collectedParams: newParams,
          messages: newMessages,
          currentInteractive: null,
        };
      });
    },
    [advanceToParam]
  );

  const skipParam = useCallback(() => {
    setState((prev) => {
      if (prev.phase !== "gathering" || !prev.gathering) return prev;

      const param = prev.gathering.params[prev.currentParamIndex];
      if (!param) return prev;

      const defaultVal = param.defaultValue;
      const newParams = defaultVal
        ? { ...prev.collectedParams, [param.id]: defaultVal }
        : prev.collectedParams;

      const newMessages: GatheringMessage[] = [
        ...prev.messages,
        {
          role: "user",
          content: defaultVal ? `Using default: ${defaultVal}` : "Skipped",
        },
      ];

      const nextIndex = prev.currentParamIndex + 1;
      advanceToParam(prev.gathering, nextIndex, newParams, newMessages);

      return {
        ...prev,
        collectedParams: newParams,
        messages: newMessages,
        currentInteractive: null,
      };
    });
  }, [advanceToParam]);

  const confirm = useCallback((): string | null => {
    if (state.phase !== "confirming" || !state.gathering || !state.command)
      return null;

    // Build the enriched prompt
    const promptBuilder = state.gathering.promptBuilder;
    const prompt = promptBuilder
      ? promptBuilder(state.collectedParams)
      : state.command.prompt;

    setState((s) => ({ ...s, phase: "executing" }));

    return prompt;
  }, [state]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setState(INITIAL_STATE);
  }, []);

  const getParamLabel = useCallback(
    (paramId: string, value: unknown): string => {
      if (!state.gathering) return String(value);
      const param = state.gathering.params.find((p) => p.id === paramId);
      if (!param) return String(value);
      const opt = param.staticOptions?.find((o) => o.value === value);
      return opt?.label ?? String(value);
    },
    [state.gathering]
  );

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  // ── Derived State ────────────────────────────────────────────────────────

  const isActive = useMemo(
    () => state.phase !== "idle",
    [state.phase]
  );

  return {
    state,
    startGathering,
    submitParam,
    skipParam,
    confirm,
    cancel,
    reset,
    isActive,
    getParamLabel,
  };
}
