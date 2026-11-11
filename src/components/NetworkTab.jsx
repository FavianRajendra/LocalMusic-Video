import NetworkSync from "./NetworkSync.jsx";
import ReceiverStatus from "./ReceiverStatus.jsx";

const NET = /Incoming|Received|Sending|Receiving|Sent |Sync from|LocalSend|multicast|Pulling|Asking them|They already have/i;

/** Network Sync tab: receiver status, devices + transfers, and the LocalSend transfer log, kept apart from the download console. */
export default function NetworkTab({ jobs, logs }) {
  const lines = logs.filter((l) => NET.test(l)).slice(-80);
  return (
    <div className="page">
      <ReceiverStatus />
      <NetworkSync jobs={jobs} />
      <section className="glass stack">
        <h3>Transfer log</h3>
        {lines.length ? <pre className="console static">{lines.join("\n")}</pre> : <p className="mut small">Nothing yet. Files you send or receive over Wi-Fi are listed here.</p>}
      </section>
    </div>
  );
}
