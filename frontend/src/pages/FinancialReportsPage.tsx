import { useState } from "react";
import { TabBar } from "../components/TabBar";
import { IncomeStatementPage } from "./IncomeStatementPage";
import { BalanceSheetPage } from "./BalanceSheetPage";
import { CashFlowPage } from "./CashFlowPage";

type ReportTab = "laba-rugi" | "neraca" | "arus-kas";

export function FinancialReportsPage() {
  const [tab, setTab] = useState<ReportTab>("laba-rugi");

  return (
    <div className="space-y-5">
      <TabBar
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "laba-rugi", label: "Laba Rugi" },
          { key: "neraca", label: "Neraca" },
          { key: "arus-kas", label: "Arus Kas" }
        ]}
      />

      {tab === "laba-rugi" && <IncomeStatementPage />}
      {tab === "neraca" && <BalanceSheetPage />}
      {tab === "arus-kas" && <CashFlowPage />}
    </div>
  );
}
