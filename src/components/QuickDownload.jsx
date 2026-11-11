import SourcePanel from "./SourcePanel.jsx";

export default function QuickDownload({ busy, onOpenSettings }) {
  return (
    <div className="page">
      <h2>Quick Download</h2>
      <SourcePanel mode="quick" busy={busy} onOpenSettings={onOpenSettings} />
    </div>
  );
}
