"use client";

/**
 * GatheringElements — Inline Interactive Components for Command Gathering
 * =======================================================================
 *
 * These components render inside chat message bubbles during the
 * gathering flow, providing a Claude-like interactive experience
 * with selectable chips, date pickers, number inputs, and
 * confirmation cards.
 *
 * All wrapped in Framer Motion for smooth entrance/exit.
 */

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { GatheringInteractive } from "./useCommandGathering";

// ── Shared Animation Variants ───────────────────────────────────────────────

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.04, delayChildren: 0.1 },
  },
};

const chipVariants = {
  hidden: { opacity: 0, y: 8, scale: 0.95 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring" as const, stiffness: 400, damping: 28 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 12, scale: 0.97 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring" as const, stiffness: 300, damping: 30, delay: 0.1 },
  },
  exit: {
    opacity: 0,
    y: -8,
    scale: 0.97,
    transition: { duration: 0.15 },
  },
};

// ── SelectableChips ─────────────────────────────────────────────────────────

interface SelectableChipsProps {
  options: { value: string; label: string; icon?: string }[];
  multiSelect: boolean;
  onSelect: (value: string | string[]) => void;
  onSkip?: () => void;
  disabled?: boolean;
}

function SelectableChips({
  options,
  multiSelect,
  onSelect,
  onSkip,
  disabled,
}: SelectableChipsProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const handleClick = useCallback(
    (value: string) => {
      if (disabled) return;

      if (multiSelect) {
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(value)) next.delete(value);
          else next.add(value);
          return next;
        });
      } else {
        onSelect(value);
      }
    },
    [disabled, multiSelect, onSelect]
  );

  const handleMultiConfirm = useCallback(() => {
    if (selected.size > 0) onSelect(Array.from(selected));
  }, [selected, onSelect]);

  return (
    <motion.div
      className="mt-3 space-y-2"
      variants={containerVariants}
      initial="hidden"
      animate="show"
    >
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <motion.button
            key={opt.value}
            variants={chipVariants}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => handleClick(opt.value)}
            disabled={disabled}
            className={`
              inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium
              border transition-colors cursor-pointer select-none
              ${
                selected.has(opt.value)
                  ? "bg-accent/10 border-accent/30 text-accent-dark dark:text-accent-light"
                  : "bg-surface border-border hover:bg-surface-hover hover:border-border text-foreground/80"
              }
              disabled:opacity-40 disabled:cursor-not-allowed
            `}
          >
            {opt.icon && <span className="text-sm">{opt.icon}</span>}
            {opt.label}
            {selected.has(opt.value) && (
              <motion.svg
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="w-3.5 h-3.5 text-accent"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </motion.svg>
            )}
          </motion.button>
        ))}
      </div>

      {/* Multi-select confirm / skip actions */}
      {multiSelect && (
        <motion.div
          className="flex items-center gap-2 pt-1"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { delay: 0.3 } }}
        >
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleMultiConfirm}
            disabled={disabled || selected.size === 0}
            className="px-3 py-1 rounded-md text-[12px] font-medium bg-accent text-white
                       hover:bg-accent-dark transition-colors disabled:opacity-40"
          >
            Confirm ({selected.size})
          </motion.button>
          {onSkip && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={onSkip}
              disabled={disabled}
              className="px-3 py-1 rounded-md text-[12px] text-muted hover:text-foreground
                         transition-colors"
            >
              Skip
            </motion.button>
          )}
        </motion.div>
      )}

      {/* Single-select skip */}
      {!multiSelect && onSkip && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { delay: 0.3 } }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={onSkip}
          disabled={disabled}
          className="text-[12px] text-muted hover:text-foreground transition-colors"
        >
          Skip this step
        </motion.button>
      )}
    </motion.div>
  );
}

// ── InlineDatePicker ────────────────────────────────────────────────────────

interface InlineDatePickerProps {
  defaultValue?: string;
  onSelect: (value: string) => void;
  disabled?: boolean;
}

function InlineDatePicker({
  defaultValue,
  onSelect,
  disabled,
}: InlineDatePickerProps) {
  const today = useMemo(() => new Date().toISOString().split("T")[0], []);
  const [value, setValue] = useState(defaultValue || today);

  return (
    <motion.div
      className="mt-3 flex items-center gap-2"
      variants={cardVariants}
      initial="hidden"
      animate="show"
    >
      <input
        type="date"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled}
        className="px-3 py-1.5 rounded-lg text-[13px] bg-surface border border-border
                   text-foreground focus:border-accent focus:ring-1 focus:ring-accent/20
                   outline-none transition-all"
      />
      <motion.button
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        onClick={() => onSelect(value)}
        disabled={disabled}
        className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-accent text-white
                   hover:bg-accent-dark transition-colors disabled:opacity-40"
      >
        Confirm
      </motion.button>
      {defaultValue && (
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => onSelect(defaultValue)}
          disabled={disabled}
          className="text-[12px] text-muted hover:text-foreground transition-colors"
        >
          Use default ({defaultValue === today ? "today" : defaultValue})
        </motion.button>
      )}
    </motion.div>
  );
}

// ── InlineDateRangeSelector ─────────────────────────────────────────────────

interface InlineDateRangeSelectorProps {
  onSelect: (value: string) => void;
  disabled?: boolean;
}

const DATE_RANGE_PRESETS = [
  { value: "last_7d", label: "Last 7 days" },
  { value: "last_30d", label: "Last 30 days" },
  { value: "last_quarter", label: "Last quarter" },
  { value: "ytd", label: "Year to date" },
  { value: "last_year", label: "Last year" },
];

function InlineDateRangeSelector({
  onSelect,
  disabled,
}: InlineDateRangeSelectorProps) {
  const [mode, setMode] = useState<"presets" | "custom">("presets");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  return (
    <motion.div
      className="mt-3 space-y-2"
      variants={containerVariants}
      initial="hidden"
      animate="show"
    >
      {mode === "presets" ? (
        <>
          <div className="flex flex-wrap gap-2">
            {DATE_RANGE_PRESETS.map((preset) => (
              <motion.button
                key={preset.value}
                variants={chipVariants}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => onSelect(preset.label)}
                disabled={disabled}
                className="px-3 py-1.5 rounded-full text-[13px] font-medium border
                           bg-surface border-border hover:bg-surface-hover hover:border-border
                           text-foreground/80 transition-colors cursor-pointer"
              >
                {preset.label}
              </motion.button>
            ))}
          </div>
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { delay: 0.25 } }}
            onClick={() => setMode("custom")}
            className="text-[12px] text-accent hover:text-accent-dark transition-colors"
          >
            Pick custom dates
          </motion.button>
        </>
      ) : (
        <motion.div
          className="flex items-center gap-2"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            disabled={disabled}
            className="px-2 py-1.5 rounded-lg text-[13px] bg-surface border border-border
                       text-foreground outline-none focus:border-accent"
          />
          <span className="text-muted text-[12px]">to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            disabled={disabled}
            className="px-2 py-1.5 rounded-lg text-[13px] bg-surface border border-border
                       text-foreground outline-none focus:border-accent"
          />
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() =>
              startDate && endDate && onSelect(`${startDate} to ${endDate}`)
            }
            disabled={disabled || !startDate || !endDate}
            className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-accent text-white
                       hover:bg-accent-dark transition-colors disabled:opacity-40"
          >
            Apply
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setMode("presets")}
            className="text-[12px] text-muted hover:text-foreground transition-colors"
          >
            Presets
          </motion.button>
        </motion.div>
      )}
    </motion.div>
  );
}

// ── InlineNumberInput ───────────────────────────────────────────────────────

interface InlineNumberInputProps {
  defaultValue?: number;
  description?: string;
  onSelect: (value: number) => void;
  onSkip?: () => void;
  disabled?: boolean;
}

function InlineNumberInput({
  defaultValue,
  description,
  onSelect,
  onSkip,
  disabled,
}: InlineNumberInputProps) {
  const [value, setValue] = useState(String(defaultValue ?? ""));

  return (
    <motion.div
      className="mt-3 flex items-center gap-2"
      variants={cardVariants}
      initial="hidden"
      animate="show"
    >
      <div className="relative">
        <input
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={disabled}
          placeholder={description || "Enter a number"}
          className="w-40 px-3 py-1.5 rounded-lg text-[13px] bg-surface border border-border
                     text-foreground focus:border-accent focus:ring-1 focus:ring-accent/20
                     outline-none transition-all tabular-nums"
        />
      </div>
      <motion.button
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        onClick={() => onSelect(Number(value))}
        disabled={disabled || !value}
        className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-accent text-white
                   hover:bg-accent-dark transition-colors disabled:opacity-40"
      >
        Set
      </motion.button>
      {onSkip && (
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onSkip}
          disabled={disabled}
          className="text-[12px] text-muted hover:text-foreground transition-colors"
        >
          Skip
        </motion.button>
      )}
    </motion.div>
  );
}

// ── ConfirmationCard ────────────────────────────────────────────────────────

interface ConfirmationCardProps {
  message: string;
  params: Record<string, unknown>;
  onConfirm: () => void;
  onModify: () => void;
  disabled?: boolean;
}

function ConfirmationCard({
  message,
  params,
  onConfirm,
  onModify,
  disabled,
}: ConfirmationCardProps) {
  return (
    <motion.div
      className="mt-4 rounded-xl border border-accent/20 bg-accent/[0.03] overflow-hidden"
      variants={cardVariants}
      initial="hidden"
      animate="show"
      exit="exit"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-accent/10 bg-accent/[0.04]">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-accent/10 flex items-center justify-center">
            <svg
              className="w-3 h-3 text-accent"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <span className="text-[13px] font-semibold text-foreground">
            Ready to execute
          </span>
        </div>
      </div>

      {/* Params summary */}
      <div className="px-4 py-3 space-y-1.5">
        {Object.entries(params).map(([key, val]) => {
          if (val === undefined || val === null || val === "") return null;
          const display = Array.isArray(val) ? val.join(", ") : String(val);
          return (
            <div key={key} className="flex items-center gap-2 text-[12px]">
              <span className="text-muted capitalize">
                {key.replace(/_/g, " ")}:
              </span>
              <span className="font-medium text-foreground">{display}</span>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="px-4 py-3 border-t border-accent/10 flex items-center gap-2">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={onConfirm}
          disabled={disabled}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold
                     bg-accent text-white hover:bg-accent-dark transition-all
                     shadow-sm hover:shadow-md disabled:opacity-40"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 3l14 9-14 9V3z"
            />
          </svg>
          Go ahead
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={onModify}
          disabled={disabled}
          className="px-3 py-2 rounded-lg text-[13px] text-muted hover:text-foreground
                     hover:bg-surface transition-all"
        >
          Modify
        </motion.button>
      </div>
    </motion.div>
  );
}

// ── InlineFileUpload ────────────────────────────────────────────────────

interface InlineFileUploadProps {
  accept?: string;
  multiple?: boolean;
  description?: string;
  onSelect: (value: unknown) => void;
  onSkip?: () => void;
  disabled?: boolean;
}

function InlineFileUpload({
  accept,
  multiple,
  description,
  onSelect,
  onSkip,
  disabled,
}: InlineFileUploadProps) {
  const [files, setFiles] = useState<File[]>([]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files;
      if (!selected) return;
      const arr = Array.from(selected);
      setFiles(arr);
      if (!multiple && arr.length === 1) {
        onSelect(arr[0].name);
      }
    },
    [multiple, onSelect]
  );

  return (
    <motion.div
      className="mt-3 space-y-2"
      variants={cardVariants}
      initial="hidden"
      animate="show"
    >
      <label
        className={`
          flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed
          border-border hover:border-accent/30 bg-surface/50 hover:bg-accent/[0.02]
          transition-all cursor-pointer group
          ${disabled ? "opacity-40 cursor-not-allowed" : ""}
        `}
      >
        <svg
          className="w-5 h-5 text-muted group-hover:text-accent transition-colors"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
          />
        </svg>
        <span className="text-[13px] text-muted group-hover:text-foreground transition-colors">
          {description || "Drop a file or click to upload"}
        </span>
        <input
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleChange}
          disabled={disabled}
          className="hidden"
        />
      </label>

      {files.length > 0 && (
        <div className="space-y-1">
          {files.map((f, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent/[0.04] border border-accent/10 text-[12px]"
            >
              <svg
                className="w-3.5 h-3.5 text-accent shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                />
              </svg>
              <span className="truncate text-foreground/80">{f.name}</span>
              <span className="text-muted ml-auto shrink-0">
                {(f.size / 1024).toFixed(0)} KB
              </span>
            </div>
          ))}
          {multiple && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onSelect(files.map((f) => f.name))}
              className="px-3 py-1 rounded-md text-[12px] font-medium bg-accent text-white
                         hover:bg-accent-dark transition-colors"
            >
              Upload {files.length} file{files.length > 1 ? "s" : ""}
            </motion.button>
          )}
        </div>
      )}

      {onSkip && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { delay: 0.3 } }}
          whileTap={{ scale: 0.97 }}
          onClick={onSkip}
          disabled={disabled}
          className="text-[12px] text-muted hover:text-foreground transition-colors"
        >
          Skip — use existing data
        </motion.button>
      )}
    </motion.div>
  );
}

// ── Loading State ───────────────────────────────────────────────────────────

function GatheringLoader() {
  return (
    <motion.div
      className="mt-3 flex items-center gap-2"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-accent/40"
            animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }}
            transition={{
              duration: 0.8,
              repeat: Infinity,
              delay: i * 0.15,
            }}
          />
        ))}
      </div>
      <span className="text-[12px] text-muted">Loading options...</span>
    </motion.div>
  );
}

// ── GLCheckElement ──────────────────────────────────────────────────────────
// Checks for existing GL data, shows "use existing" or "upload new" options,
// and handles the full S3 upload flow inline in the chat.

type GLCheckPhase =
  | "checking"
  | "has_data"
  | "no_data"
  | "show_upload"
  | "uploading"
  | "uploaded"
  | "error";

interface GLCheckMeta {
  transactionCount: number;
  accountCount: number;
  period: string;
  uploadedAt: string | null;
  filename: string;
}

interface GLCheckElementProps {
  glStatusEndpoint: string;
  orgId: string;
  description?: string;
  onSelect: (value: unknown) => void;
  disabled?: boolean;
}

function GLCheckElement({
  glStatusEndpoint,
  orgId,
  onSelect,
  disabled,
}: GLCheckElementProps) {
  const [phase, setPhase] = useState<GLCheckPhase>("checking");
  const [meta, setMeta] = useState<GLCheckMeta | null>(null);
  const [uploadMeta, setUploadMeta] = useState<{
    transactionCount: number;
    accountCount: number;
    filename: string;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Check GL status on mount
  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const url = orgId
          ? `${glStatusEndpoint}?orgId=${encodeURIComponent(orgId)}`
          : glStatusEndpoint;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        if (data.exists && data.metadata) {
          setMeta(data.metadata);
          setPhase("has_data");
        } else {
          setPhase("no_data");
        }
      } catch (err) {
        if (cancelled) return;
        console.warn("[GLCheck] Status check failed:", err);
        setPhase("no_data");
      }
    }
    check();
    return () => {
      cancelled = true;
    };
  }, [glStatusEndpoint, orgId]);

  // Handle file upload to S3
  const handleFileSelect = useCallback(
    async (file: File) => {
      setPhase("uploading");
      setErrorMsg("");
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("fileType", "gl-data");

        const res = await fetch("/api/connectors/s3-upload", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(
            (errData as Record<string, string>).error ||
              `Upload failed (${res.status})`
          );
        }

        const data = await res.json();
        const ingestion = data.brainIngestion || data.brainTriggerResult || {};
        setUploadMeta({
          transactionCount: ingestion.transactionCount || 0,
          accountCount: ingestion.accountCount || 0,
          filename: file.name,
        });
        setPhase("uploaded");

        // Auto-advance after showing feedback
        setTimeout(() => {
          onSelect("uploaded");
        }, 1800);
      } catch (err: unknown) {
        console.error("[GLCheck] Upload failed:", err);
        setErrorMsg(
          err instanceof Error ? err.message : "Upload failed. Please try again."
        );
        setPhase("error");
      }
    },
    [onSelect]
  );

  // ── Render: Checking ──────────────────────────────────────────────────
  if (phase === "checking") {
    return (
      <motion.div
        className="mt-3 flex items-center gap-2.5"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-emerald-400/60"
              animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }}
              transition={{
                duration: 0.8,
                repeat: Infinity,
                delay: i * 0.15,
              }}
            />
          ))}
        </div>
        <span className="text-[12px] text-muted">
          Checking for General Ledger data...
        </span>
      </motion.div>
    );
  }

  // ── Render: Existing GL found ─────────────────────────────────────────
  if (phase === "has_data" && meta) {
    return (
      <motion.div
        className="mt-3 space-y-2"
        variants={cardVariants}
        initial="hidden"
        animate="show"
      >
        {/* Info banner */}
        <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/15">
          <svg
            className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-medium text-emerald-400">
              GL data found
            </div>
            <div className="text-[11px] text-muted mt-0.5 leading-relaxed">
              <span className="text-foreground/70 font-medium">
                {meta.filename}
              </span>{" "}
              &mdash; {meta.transactionCount.toLocaleString()} transactions,{" "}
              {meta.accountCount} accounts, {meta.period}
            </div>
          </div>
        </div>

        {/* Action chips */}
        <div className="flex flex-wrap gap-2">
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onSelect("existing")}
            disabled={disabled}
            className="px-3.5 py-2 rounded-xl text-[12px] font-medium bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/15 hover:border-emerald-500/30 transition-all disabled:opacity-40"
          >
            Use existing data
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setPhase("show_upload")}
            disabled={disabled}
            className="px-3.5 py-2 rounded-xl text-[12px] font-medium bg-surface border border-border-subtle text-muted hover:text-foreground hover:border-border transition-all disabled:opacity-40"
          >
            Upload new file
          </motion.button>
        </div>
      </motion.div>
    );
  }

  // ── Render: No data / Show upload ─────────────────────────────────────
  if (phase === "no_data" || phase === "show_upload") {
    return (
      <motion.div
        className="mt-3 space-y-2"
        variants={cardVariants}
        initial="hidden"
        animate="show"
      >
        {phase === "no_data" && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/[0.06] border border-amber-500/15">
            <svg
              className="w-3.5 h-3.5 text-amber-500 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
            <span className="text-[11px] text-amber-400/80">
              No GL data found. Please upload your General Ledger file to
              continue.
            </span>
          </div>
        )}

        <label
          className={`
            flex flex-col items-center justify-center gap-2 px-4 py-5 rounded-xl border-2 border-dashed
            border-border hover:border-emerald-500/30 bg-surface/50 hover:bg-emerald-500/[0.02]
            transition-all cursor-pointer group
            ${disabled ? "opacity-40 cursor-not-allowed" : ""}
          `}
        >
          <svg
            className="w-6 h-6 text-muted group-hover:text-emerald-500 transition-colors"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
            />
          </svg>
          <span className="text-[12px] text-muted group-hover:text-foreground transition-colors">
            Drop your General Ledger file here, or click to browse
          </span>
          <span className="text-[10px] text-muted/60">
            Supports Excel (.xlsx, .xls), CSV, and JSON
          </span>
          <input
            type="file"
            accept=".xlsx,.xls,.csv,.json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileSelect(file);
            }}
            disabled={disabled}
            className="hidden"
          />
        </label>
      </motion.div>
    );
  }

  // ── Render: Uploading ─────────────────────────────────────────────────
  if (phase === "uploading") {
    return (
      <motion.div
        className="mt-3 space-y-2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-500/[0.04] border border-emerald-500/10">
          <div className="relative w-5 h-5 shrink-0">
            <motion.div
              className="absolute inset-0 rounded-full border-2 border-emerald-500/30 border-t-emerald-500"
              animate={{ rotate: 360 }}
              transition={{
                duration: 1,
                repeat: Infinity,
                ease: "linear",
              }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-medium text-emerald-400">
              Uploading & parsing...
            </div>
            <div className="text-[10px] text-muted mt-0.5">
              Detecting columns, classifying accounts, validating entries
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  // ── Render: Upload complete ───────────────────────────────────────────
  if (phase === "uploaded" && uploadMeta) {
    return (
      <motion.div
        className="mt-3"
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-emerald-500/[0.08] border border-emerald-500/20">
          <svg
            className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-medium text-emerald-400">
              Parsed successfully
            </div>
            <div className="text-[11px] text-muted mt-0.5 leading-relaxed">
              <span className="text-foreground/70 font-medium">
                {uploadMeta.filename}
              </span>{" "}
              &mdash;{" "}
              {uploadMeta.transactionCount.toLocaleString()} transactions
              across {uploadMeta.accountCount} accounts
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  // ── Render: Error ─────────────────────────────────────────────────────
  if (phase === "error") {
    return (
      <motion.div
        className="mt-3 space-y-2"
        variants={cardVariants}
        initial="hidden"
        animate="show"
      >
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/[0.06] border border-red-500/15">
          <svg
            className="w-3.5 h-3.5 text-red-500 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
            />
          </svg>
          <span className="text-[11px] text-red-400/80">{errorMsg}</span>
        </div>
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => setPhase("show_upload")}
          className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-muted hover:text-foreground transition-colors"
        >
          Try again
        </motion.button>
      </motion.div>
    );
  }

  return null;
}

// ── Main Dispatcher ─────────────────────────────────────────────────────────

export interface GatheringElementProps {
  interactive: GatheringInteractive;
  onSelect: (value: unknown) => void;
  onSkip?: () => void;
  onConfirm?: () => void;
  onModify?: () => void;
  loading?: boolean;
  disabled?: boolean;
}

export function GatheringElement({
  interactive,
  onSelect,
  onSkip,
  onConfirm,
  onModify,
  loading,
  disabled,
}: GatheringElementProps) {
  if (loading) return <GatheringLoader />;

  return (
    <AnimatePresence mode="wait">
      {interactive.type === "chips" && (
        <SelectableChips
          key="chips"
          options={interactive.options}
          multiSelect={interactive.multiSelect}
          onSelect={onSelect}
          onSkip={onSkip}
          disabled={disabled}
        />
      )}
      {interactive.type === "date" && (
        <InlineDatePicker
          key="date"
          defaultValue={interactive.defaultValue}
          onSelect={(v) => onSelect(v)}
          disabled={disabled}
        />
      )}
      {interactive.type === "date_range" && (
        <InlineDateRangeSelector
          key="date_range"
          onSelect={(v) => onSelect(v)}
          disabled={disabled}
        />
      )}
      {interactive.type === "number" && (
        <InlineNumberInput
          key="number"
          defaultValue={interactive.defaultValue}
          description={interactive.description}
          onSelect={(v) => onSelect(v)}
          onSkip={onSkip}
          disabled={disabled}
        />
      )}
      {interactive.type === "file" && (
        <InlineFileUpload
          key="file"
          accept={interactive.accept}
          multiple={interactive.multiple}
          description={interactive.description}
          onSelect={onSelect}
          onSkip={onSkip}
          disabled={disabled}
        />
      )}
      {interactive.type === "gl_check" && (
        <GLCheckElement
          key="gl_check"
          glStatusEndpoint={interactive.glStatusEndpoint}
          orgId={interactive.orgId}
          description={interactive.description}
          onSelect={onSelect}
          disabled={disabled}
        />
      )}
      {interactive.type === "confirm" && onConfirm && onModify && (
        <ConfirmationCard
          key="confirm"
          message={interactive.message}
          params={interactive.params}
          onConfirm={onConfirm}
          onModify={onModify}
          disabled={disabled}
        />
      )}
    </AnimatePresence>
  );
}

export default GatheringElement;
