export type TabItem = {
  key: string;
  label: string;
};

/** Baris tab horizontal, dipakai untuk menggabungkan beberapa halaman terkait jadi satu menu sidebar. */
export function TabBar<T extends string>({
  tabs,
  active,
  onChange
}: {
  tabs: TabItem[];
  active: T;
  onChange: (key: T) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <button
            className={[
              "shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition",
              isActive ? "border-brand text-brand" : "border-transparent text-slate-500 hover:text-ink"
            ].join(" ")}
            key={tab.key}
            onClick={() => onChange(tab.key as T)}
            type="button"
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
