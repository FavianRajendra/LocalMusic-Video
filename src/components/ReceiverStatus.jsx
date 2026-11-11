import { call } from "../bridge.js";
import { usePoll } from "../hooks.js";

/** LocalSend receiver status: the UDP multicast / HTTP port this device listens on. */
export default function ReceiverStatus({ onOpen }) {
  const [n] = usePoll(() => call("net_state"), 4000);
  const on = !!n?.enabled;
  return (
    <button className="receiver glass" onClick={onOpen} aria-label="Open Network Sync">
      <span className={"dot" + (on ? " on" : "")} />
      <span><b>LocalSend receiver</b><br /><span className="mut small">UDP 53317 · {on ? "listening" : "offline"}{on ? ` · ${n.peers?.length || 0} nearby` : ""}{n?.share ? " · incoming allowed" : ""}</span></span>
    </button>
  );
}
