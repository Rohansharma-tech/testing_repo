import { useEffect, useRef, useState } from "react";
import * as faceapi from "face-api.js";
import api from "../api/axios";
import PageWrapper from "../components/PageWrapper";
import { useToast } from "../components/Toast";
import { useAuth } from "../context/AuthContext";
import {
  ensureCameraSupport,
  getCameraErrorMessage,
  getCameraPermissionState,
} from "../utils/media";

const MODEL_URL = "/models";

export default function RegisterFacePage() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const detectionIntervalRef = useRef(null);

  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const { user, updateUser } = useAuth();
  const { showToast, ToastContainer } = useToast();

  useEffect(() => {
    if (user?.hasFace) {
      setStatusMessage("Face already registered");
      return undefined;
    }

    let cancelled = false;

    async function loadModels() {
      setStatusMessage("Loading face recognition models...");

      try {
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);

        if (!cancelled) {
          setModelsLoaded(true);
          setStatusMessage("Models are ready. Start the camera to capture your face.");
        }
      } catch (err) {
        if (!cancelled) {
          setStatusMessage("Unable to load face recognition models.");
        }
      }
    }

    loadModels();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [user?.hasFace]);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
    canvasRef.current?.getContext("2d")?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

    setCameraActive(false);
    setFaceDetected(false);
  };

  const startLiveFaceDetection = () => {
    detectionIntervalRef.current = setInterval(async () => {
      if (!videoRef.current || videoRef.current.readyState < 2) {
        return;
      }

      try {
        const detection = await faceapi
          .detectSingleFace(videoRef.current, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
          .withFaceLandmarks();

        const canvas = canvasRef.current;
        const dimensions = faceapi.matchDimensions(canvas, videoRef.current, true);
        canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
        faceapi.draw.drawDetections(canvas, faceapi.resizeResults(detection ? [detection] : [], dimensions));

        setFaceDetected(Boolean(detection));
      } catch {
        setFaceDetected(false);
      }
    }, 300);
  };

  const startCamera = async () => {
    try {
      ensureCameraSupport();

      const permissionState = await getCameraPermissionState();
      if (permissionState === "denied") {
        throw new Error("Camera access is blocked. Allow camera permission for this site in your browser settings and reload.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 960, height: 540, facingMode: "user" },
      });

      streamRef.current = stream;
      setCameraActive(true);
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => {});
      setStatusMessage("Camera is active. Center your face and capture when the detector is ready.");
      startLiveFaceDetection();
    } catch (err) {
      const message = getCameraErrorMessage(err);
      setStatusMessage(message);
      showToast(message, "error");
    }
  };

  const captureFace = async () => {
    if (!videoRef.current || !modelsLoaded || user?.hasFace) {
      return;
    }

    setSubmitting(true);
    setStatusMessage("Capturing face descriptor...");

    try {
      const detection = await faceapi
        .detectSingleFace(videoRef.current, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.6 }))
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        setStatusMessage("No face was detected clearly. Adjust your position and try again.");
        return;
      }

      const descriptor = Array.from(detection.descriptor);
      await api.put("/settings/register-face", { faceDescriptor: descriptor });
      updateUser({ hasFace: true });
      stopCamera();
      setStatusMessage("Face already registered");
      showToast("Face registered successfully.", "success");
    } catch (err) {
      const message = err.response?.data?.message || "Face registration failed. Please try again.";
      if (message === "Face already registered") {
        updateUser({ hasFace: true });
      }
      setStatusMessage(message);
      showToast(message, message === "Face already registered" ? "warning" : "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageWrapper
      title="Face Registration"
      description="A face can only be registered once. The backend blocks duplicate registration attempts."
    >
      <ToastContainer />

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="space-y-6">
          <div className="card">
            <div className="flex flex-wrap items-center gap-3">
              <span className={user?.hasFace ? "status-chip status-chip-success" : "status-chip status-chip-info"}>
                {user?.hasFace ? "Registered" : "One-Time Setup"}
              </span>
            </div>
            <h2 className="mt-5 text-2xl font-semibold text-slate-900">
              {user?.hasFace ? "Face registration is locked" : "Register your face"}
            </h2>
            <p className="mt-3 text-sm text-slate-500">{statusMessage}</p>
          </div>

          <div className="card overflow-hidden p-0">
            <div className="relative aspect-[16/10] bg-slate-950">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className={`mirror-video h-full w-full object-cover ${cameraActive ? "opacity-100" : "opacity-0"}`}
              />
              <canvas ref={canvasRef} className="face-overlay h-full w-full" />
              {cameraActive ? (
                <div className="absolute left-4 top-4">
                  <span className={faceDetected ? "status-chip status-chip-success" : "status-chip status-chip-warning"}>
                    {faceDetected ? "Face detected" : "Waiting for face"}
                  </span>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center p-8 text-center text-slate-400">
                  <div>
                    <p className="text-lg font-semibold text-slate-200">Camera preview</p>
                    <p className="mt-2 text-sm">Start the camera to capture a single face descriptor.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <div className="card">
            <p className="section-label">Controls</p>
            <div className="mt-5 grid gap-3">
              {!cameraActive ? (
                <button
                  onClick={startCamera}
                  disabled={!modelsLoaded || user?.hasFace}
                  className="btn-primary w-full"
                >
                  {user?.hasFace ? "Face already registered" : modelsLoaded ? "Start camera" : "Loading models"}
                </button>
              ) : (
                <>
                  <button
                    onClick={captureFace}
                    disabled={submitting || !faceDetected || user?.hasFace}
                    className="btn-primary w-full"
                  >
                    {submitting ? "Capturing..." : "Capture and register"}
                  </button>
                  <button onClick={stopCamera} className="btn-secondary w-full">
                    Stop camera
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="card">
            <p className="section-label">Guidelines</p>
            <div className="mt-5 space-y-3 text-sm text-slate-500">
              <p>Use a well-lit area and keep only one face inside the frame.</p>
              <p>Hold still until the detector shows a confirmed face state.</p>
              <p>Registration is locked after the first successful submission.</p>
              <p>If the backend already has a descriptor for your account, re-registration stays blocked.</p>
              <p>Camera access requires a secure URL such as https://... or http://localhost.</p>
              <p>If access is blocked, open the browser site settings and allow the camera for this app.</p>
            </div>
          </div>
        </section>
      </div>
    </PageWrapper>
  );
}
