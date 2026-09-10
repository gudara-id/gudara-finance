import { useState } from "react";
import { FileSpreadsheet, FileText as FileIcon, Loader2 } from "lucide-react";
import { downloadReportExport } from "../lib/api";
import type { ExportFormat, ReportSlug } from "../lib/api";

export function ExportButtons({
  reportSlug,
  params,
  onExport
}: {
  reportSlug?: ReportSlug;
  params?: Record<string, string>;
  /** Handler kustom, dipakai kalau bukan export laporan bawaan (reportSlug). */
  onExport?: (format: ExportFormat) => Promise<void>;
}) {
  const [loadingFormat, setLoadingFormat] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleExport(format: ExportFormat) {
    setLoadingFormat(format);
    setError(null);

    try {
      if (onExport) {
        await onExport(format);
      } else if (reportSlug) {
        await downloadReportExport(reportSlug, format, params ?? {});
      }
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Gagal mengunduh laporan.");
    } finally {
      setLoadingFormat(null);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={loadingFormat !== null}
        onClick={() => handleExport("xlsx")}
        type="button"
      >
        {loadingFormat === "xlsx" ? (
          <Loader2 size={16} className="animate-spin" aria-hidden="true" />
        ) : (
          <FileSpreadsheet size={16} aria-hidden="true" />
        )}
        Excel
      </button>

      <button
        className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={loadingFormat !== null}
        onClick={() => handleExport("pdf")}
        type="button"
      >
        {loadingFormat === "pdf" ? (
          <Loader2 size={16} className="animate-spin" aria-hidden="true" />
        ) : (
          <FileIcon size={16} aria-hidden="true" />
        )}
        PDF
      </button>

      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
