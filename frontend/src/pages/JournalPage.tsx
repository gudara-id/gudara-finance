import { useState } from "react";
import { FileText, Repeat } from "lucide-react";
import { JournalEntryPage } from "./JournalEntryPage";
import { JournalTemplatesPage } from "./JournalTemplatesPage";

type JournalTab = "jurnal-umum" | "template";

const tabs: { key: JournalTab; label: string; icon: typeof FileText; description: string }[] = [
  {
    key: "jurnal-umum",
    label: "Jurnal Umum",
    icon: FileText,
    description: "Catat transaksi yang tidak tercakup di menu transaksi lainnya."
  },
  {
    key: "template",
    label: "Template Berulang",
    icon: Repeat,
    description: "Simpan pola jurnal rutin (sewa, gaji, langganan) dan generate satu klik tiap bulan."
  }
];

export function JournalPage() {
  const [activeTab, setActiveTab] = useState<JournalTab>("jurnal-umum");

  return (
    <div className="space-y-5">
      <section className="rounded-md border border-line bg-white shadow-sm">
        <div className="flex flex-wrap gap-2 border-b border-line px-4 pt-3">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = tab.key === activeTab;

            return (
              <button
                className={[
                  "inline-flex items-center gap-2 rounded-t-md border-b-2 px-4 py-2.5 text-sm font-medium transition",
                  isActive ? "border-brand text-brand" : "border-transparent text-slate-500 hover:text-ink"
                ].join(" ")}
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                type="button"
              >
                <Icon size={16} aria-hidden="true" />
                {tab.label}
              </button>
            );
          })}
        </div>
        <p className="border-b border-line px-4 py-2.5 text-xs text-slate-500">
          {tabs.find((tab) => tab.key === activeTab)?.description}
        </p>
      </section>

      {activeTab === "jurnal-umum" ? <JournalEntryPage /> : <JournalTemplatesPage />}
    </div>
  );
}
