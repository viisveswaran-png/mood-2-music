import React, { useEffect, useRef, useState } from "react";

type Props = {
  onPhoto: (blob: Blob) => void;     // called after we capture a frame
};

export default function CameraBox({ onPhoto }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function startCamera() {
    setErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setRunning(true);
    } catch (e: any) {
      setErr(e?.message || "Camera permission denied or unavailable");
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setRunning(false);
  }

  async function captureFrame() {
    const video = videoRef.current;
    if (!video) return;
    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;

    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Draw current video frame to canvas
    ctx.drawImage(video, 0, 0, w, h);

    // Convert to Blob (JPEG ~0.9 quality)
    canvas.toBlob((blob) => {
      if (blob) onPhoto(blob);
    }, "image/jpeg", 0.9);
  }

  useEffect(() => {
    // cleanup on unmount
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="card" style={{ display:"grid", gap:10 }}>
      <div className="row" style={{ justifyContent:"space-between" }}>
        <h3 style={{ margin:0 }}>Live Camera</h3>
        <div className="row">
          {!running ? (
            <button className="btn btn-primary" onClick={startCamera}>Start Camera</button>
          ) : (
            <>
              <button className="btn" onClick={captureFrame}>Capture & Analyze</button>
              <button className="btn" onClick={stopCamera}>Stop</button>
            </>
          )}
        </div>
      </div>

      {err && <p style={{ color:"#ff9b9b", margin:0 }}>Camera Error: {err}</p>}

      <div style={{
        background:"#000",
        borderRadius:12,
        overflow:"hidden",
        border:"1px solid #26264a",
        aspectRatio: "16 / 9",
      }}>
        {/* The video element shows the live feed */}
        <video
          ref={videoRef}
          playsInline
          muted
          style={{ width:"100%", height:"100%", objectFit:"cover", display: running ? "block" : "none" }}
        />
        {!running && (
          <div style={{ height:"100%", display:"grid", placeItems:"center", color:"#9aa" }}>
            <div>Camera is off</div>
          </div>
        )}
      </div>

      <p className="muted" style={{ margin:0 }}>
        Tip: Camera works on <b>https</b> or <b>localhost</b>. On mobile, ensure permissions are allowed.
      </p>
    </div>
  );
}
