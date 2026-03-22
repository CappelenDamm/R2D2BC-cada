import dynamic from "next/dynamic";

/**
 * D2Reader requires `window` and `document` at import time,
 * so it MUST be loaded with `ssr: false` to prevent Next.js
 * from attempting to render it on the server.
 */
const EpubReader = dynamic(() => import("./EpubReader"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        fontFamily: "system-ui, sans-serif",
        color: "#49454f",
      }}
    >
      Loading reader...
    </div>
  ),
});

export default function ReaderPage() {
  return <EpubReader />;
}
