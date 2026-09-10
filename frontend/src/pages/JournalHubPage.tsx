import { useState } from "react";
import { TabBar } from "../components/TabBar";
import { JournalEntryPage } from "./JournalEntryPage";
import { JournalTemplatesPage } from "./JournalTemplatesPage";

type JournalTab = "jurnal" | "template";

export function JournalHubPage() {
  const [tab, setTab] = useState<JournalTab>("jurnal");

  return (
    <div className="space-y-5">
      <TabBar
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "jurnal", label: "Jurnal Umum" },
          { key: "template", label: "Template Berulang" }
        ]}
      />

      {tab === "jurnal" && <JournalEntryPage />}
      {tab === "template" && <JournalTemplatesPage />}
    </div>
  );
}
