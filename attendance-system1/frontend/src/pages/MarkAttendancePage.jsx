import { useEffect, useRef, useState } from "react";
import * as faceapi from "face-api.js";
import api from "../api/axios";
import { AttendanceReasonBadge, AttendanceStatusBadge } from "../components/AttendanceBadges";
import PageWrapper from "../components/PageWrapper";
import { useToast } from "../components/Toast";
import { useAuth } from "../context/AuthContext";
import {
  ATTENDANCE_REASON,
  ATTENDANCE_STATUS,
  getLocationErrorMessage,
  getReasonLabel,
} from "../utils/attendance";
import {
  ensureCameraSupport,
  getCameraErrorMessage,
  getCameraPermissionState,
} from "../utils/media";

const MODEL_URL = "/models";
const FACE_MATCH_THRESHOLD = 0.6;
const LOCATION_ACQUISITION_TIMEOUT_MS = 20000;

function euclideanDistance(firstDescriptor, secondDescriptor) {
  if (!firstDescriptor || !secondDescriptor || firstDescriptor.length !== secondDescriptor.length) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.sqrt(
    firstDescriptor.reduce((total, value, index) => total + (value - secondDescriptor[index]) ** 2, 0)
  );
}

function getPermissionState() {
  if (!navigator.permissions?.query) {
    return Promise.resolve("prompt");
  }

  return navigator.permissions
    .query({ name: "geolocation" })
    .then((result) => result.state)
    .catch(() => "prompt");
}

function buildLocationPayload(position) {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    mocked: position.coords.mocked === true,
    capturedAt: new Date(position.timestamp).toISOString(),
  };
}

function formatAccuracyMeters(value) {
  return Number.isFinite(value) ? `${Math.round(value)} m` : "Unavailable";
}

function buildLocationProgressMessage(currentAccuracy, requiredAccuracy) {
  return `Improving GPS accuracy... Current: ${formatAccuracyMeters(currentAccuracy)}. Required: ${formatAccuracyMeters(requiredAccuracy)} or better.`;
}

function buildLowAccuracyMessage(responseData, accuracy) {
  if (responseData?.detail) {
    return `${responseData.message} ${responseData.detail}`;
  }

  return accuracy
    ? `Location accuracy is too low. Current accuracy: ${formatAccuracyMeters(accuracy)}. Move to an open area and try again.`
    : "Location accuracy is too low. Move to an open area and try again.";
}

function acquireBestLocation({ requiredAccuracyMeters, onProgress, timeoutMs = LOCATION_ACQUISITION_TIMEOUT_MS }) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported on this device."));
      return;
    }

    let bestPosition = null;
    let settled = false;
    let watchId = null;
    let timeoutId = null;

    const cleanup = () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    };

    const finalizeWithBest = () => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();

      if (bestPosition) {
        resolve(buildLocationPayload(bestPosition));
      } else {
        reject(new Error("Unable to retrieve your location. Move to an open area and try again."));
      }
    };

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (!bestPosition || position.coords.accuracy < bestPosition.coords.accuracy) {
          bestPosition = position;
        }

        onProgress?.(buildLocationPayload(bestPosition));

        if (
          Number.isFinite(bestPosition.coords.accuracy) &&
          Number.isFinite(requiredAccuracyMeters) &&
          bestPosition.coords.accuracy <= requiredAccuracyMeters
        ) {
          finalizeWithBest();
        }
      },
      (error) => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        reject(new Error(getLocationErrorMessage(error)));
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );

    timeoutId = setTimeout(() => {
      finalizeWithBest();
    }, timeoutMs);
  });
}

export default function MarkAttendancePage() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const detectionIntervalRef = useRef(null);

  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("loading");
  const [statusMessage, setStatusMessage] = useState("Loading face recognition models...");
  const [geofenceInfo, setGeofenceInfo] = useState(null);
  const [locationPayload, setLocationPayload] = useState(null);
  const [todayState, setTodayState] = useState({
    status: ATTENDANCE_STATUS.NOT_MARKED,
    record: null,
    marked: false,
    canRetry: true,
  });

  const { user } = useAuth();
  const { showToast, ToastContainer } = useToast();

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      try {
        const [geofenceRes, todayRes] = await Promise.all([
          api.get("/settings/geofence"),
          api.get("/attendance/today"),
        ]);

        if (cancelled) {
          return;
        }

        setGeofenceInfo(geofenceRes.data);
        setTodayState(todayRes.data);

        if (todayRes.data.status === ATTENDANCE_STATUS.PRESENT) {
          setStage("done");
          setStatusMessage(`Attendance already marked at ${todayRes.data.record?.time || "--:--"}.`);
          return;
        }

        if (todayRes.data.record?.reason === ATTENDANCE_REASON.OUTSIDE_LOCATION) {
          setStage("blocked");
          setStatusMessage("You are not in the allowed location");
        } else {
          setStage("idle");
          setStatusMessage("Location and face verification are ready.");
        }

        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);

        if (!cancelled) {
          setModelsLoaded(true);
        }
      } catch (err) {
        if (!cancelled) {
          setStage("error");
          setStatusMessage("Unable to initialize attendance verification.");
        }
      }
    }

    initialize();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, []);

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

  const startCamera = async () => {
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

    detectionIntervalRef.current = setInterval(async () => {
      if (!videoRef.current || videoRef.current.readyState < 2) {
        return;
      }

      const detection = await faceapi
        .detectSingleFace(videoRef.current, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
        .withFaceLandmarks();

      const canvas = canvasRef.current;
      const dimensions = faceapi.matchDimensions(canvas, videoRef.current, true);
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
      faceapi.draw.drawDetections(canvas, faceapi.resizeResults(detection ? [detection] : [], dimensions));
      setFaceDetected(Boolean(detection));
    }, 300);
  };

  const requestLocation = async () => {
    if (!window.isSecureContext) {
      throw new Error("Location services require a secure context.");
    }

    const permissionState = await getPermissionState();

    if (permissionState === "denied") {
      throw new Error("Location access was denied. Allow location permission and try again.");
    }

    const requiredAccuracyMeters = geofenceInfo?.maxAccuracyMeters;

    return acquireBestLocation({
      requiredAccuracyMeters,
      onProgress: (payload) => {
        setLocationPayload(payload);
        setStatusMessage(
          Number.isFinite(requiredAccuracyMeters)
            ? buildLocationProgressMessage(payload.accuracy, requiredAccuracyMeters)
            : "Retrieving current GPS location..."
        );
      },
    });
  };

  const handleBlockedAttempt = (responseData) => {
    stopCamera();
    setTodayState({
      status: responseData.record?.status || ATTENDANCE_STATUS.ABSENT,
      record: responseData.record || null,
      marked: false,
      canRetry: true,
    });
    setStage("blocked");
    setStatusMessage(responseData.message || "You are not in the allowed location");
  };

  const startAttendanceFlow = async () => {
    if (!user?.hasFace) {
      showToast("Register your face before marking attendance.", "warning");
      return;
    }

    if (todayState.status === ATTENDANCE_STATUS.PRESENT) {
      setStage("done");
      setStatusMessage(`Attendance already marked at ${todayState.record?.time || "--:--"}.`);
      return;
    }

    setBusy(true);
    setStatusMessage("Retrieving current GPS location...");
    setStage("locating");

    try {
      const currentLocation = await requestLocation();
      setLocationPayload(currentLocation);

      setStatusMessage("Validating your location against the allowed geofence...");
      const validation = await api.post("/attendance/location-check", currentLocation);

      if (validation.data.alreadyMarked) {
        setTodayState({
          status: validation.data.record?.status || ATTENDANCE_STATUS.PRESENT,
          record: validation.data.record || null,
          marked: true,
          canRetry: false,
        });
        setStage("done");
        setStatusMessage(`Attendance already marked at ${validation.data.record?.time || "--:--"}.`);
        return;
      }

      await startCamera();
      setStage("camera");
      setStatusMessage("Location validated. Complete face verification to submit attendance.");
    } catch (err) {
      const responseData = err.response?.data;
      const lowAccuracyMessage =
        responseData?.code === ATTENDANCE_REASON.LOCATION_UNRELIABLE
          ? buildLowAccuracyMessage(responseData, locationPayload?.accuracy)
          : null;
      const message =
        lowAccuracyMessage ||
        responseData?.message ||
        getCameraErrorMessage(err) ||
        "Unable to validate attendance.";

      if (responseData?.message === "You are not in the allowed location") {
        handleBlockedAttempt(responseData);
      } else {
        setStage("error");
        setStatusMessage(message);
      }

      showToast(message, "error");
    } finally {
      setBusy(false);
    }
  };

  const verifyAndSubmit = async () => {
    if (!faceDetected || !locationPayload) {
      showToast("Position your face clearly before submitting.", "warning");
      return;
    }

    setBusy(true);
    setStage("verifying");
    setStatusMessage("Matching live face data with your registered descriptor...");

    try {
      const faceDescriptorRes = await api.get("/settings/face-descriptor");
      const storedDescriptor = faceDescriptorRes.data.faceDescriptor;

      const detection = await faceapi
        .detectSingleFace(videoRef.current, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.6 }))
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        setStage("camera");
        setStatusMessage("No face was detected clearly. Adjust your position and try again.");
        showToast("No clear face detected.", "warning");
        return;
      }

      const liveDescriptor = Array.from(detection.descriptor);
      const distance = euclideanDistance(liveDescriptor, storedDescriptor);

      if (distance > FACE_MATCH_THRESHOLD) {
        setStage("camera");
        setStatusMessage("Face verification failed. The live capture does not match the registered descriptor.");
        showToast("Face verification failed.", "error");
        return;
      }

      setStage("submitting");
      setStatusMessage("Face verified. Submitting attendance...");

      const response = await api.post("/attendance/mark", locationPayload);

      stopCamera();
      setTodayState({
        status: response.data.record?.status || ATTENDANCE_STATUS.PRESENT,
        record: response.data.record || null,
        marked: true,
        canRetry: false,
      });
      setStage("done");
      setStatusMessage(`Attendance marked successfully at ${response.data.record?.time || "--:--"}.`);
      showToast("Attendance marked successfully.", "success");
    } catch (err) {
      const responseData = err.response?.data;
      const message = responseData?.message || err.message || "Attendance submission failed.";

      if (responseData?.message === "You are not in the allowed location") {
        handleBlockedAttempt(responseData);
      } else if (responseData?.alreadyMarked) {
        stopCamera();
        setTodayState({
          status: responseData.record?.status || ATTENDANCE_STATUS.PRESENT,
          record: responseData.record || null,
          marked: true,
          canRetry: false,
        });
        setStage("done");
        setStatusMessage(`Attendance already marked at ${responseData.record?.time || "--:--"}.`);
      } else {
        setStage("error");
        setStatusMessage(message);
      }

      showToast(message, "error");
    } finally {
      setBusy(false);
    }
  };

  const resetFlow = () => {
    stopCamera();
    setLocationPayload(null);
    setStage(todayState.status === ATTENDANCE_STATUS.ABSENT ? "blocked" : "idle");
    setStatusMessage(
      todayState.record?.reason === ATTENDANCE_REASON.OUTSIDE_LOCATION
        ? "You are not in the allowed location"
        : "Location and face verification are ready."
    );
  };

  const stageTone =
    stage === "done"
      ? "status-chip status-chip-success"
      : stage === "blocked"
        ? "status-chip status-chip-warning"
        : stage === "error"
          ? "status-chip status-chip-danger"
          : "status-chip status-chip-info";

  return (
    <PageWrapper
      title="Mark Attendance"
      description="Attendance submission is accepted only after geofence validation and face verification both succeed."
    >
      <ToastContainer />

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="space-y-6">
          <div className="card">
            <div className="flex flex-wrap items-center gap-3">
              <span className={stageTone}>
                {stage === "done"
                  ? "Completed"
                  : stage === "blocked"
                    ? "Blocked"
                    : stage === "error"
                      ? "Needs Attention"
                      : "Ready"}
              </span>
              <AttendanceStatusBadge status={todayState.status} />
              <AttendanceReasonBadge reason={todayState.record?.reason} />
            </div>

            <h2 className="mt-5 text-2xl font-semibold text-slate-900">Attendance verification</h2>
            <p className="mt-3 text-sm text-slate-500">{statusMessage}</p>

            {todayState.record?.reason && todayState.record.reason !== ATTENDANCE_REASON.OUTSIDE_LOCATION && (
              <p className="mt-3 text-sm text-slate-500">{getReasonLabel(todayState.record.reason)}</p>
            )}
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
                <div className="flex h-full items-center justify-center px-8 text-center text-slate-400">
                  <div>
                    <p className="text-lg font-semibold text-slate-200">Verification camera</p>
                    <p className="mt-2 text-sm">The camera activates only after the backend confirms your location is inside the allowed geofence.</p>
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
              {stage === "camera" ? (
                <>
                  <button onClick={verifyAndSubmit} disabled={busy || !faceDetected} className="btn-primary w-full">
                    {busy ? "Submitting..." : "Verify face and submit"}
                  </button>
                  <button onClick={resetFlow} className="btn-secondary w-full">
                    Cancel verification
                  </button>
                </>
              ) : (
                <button
                  onClick={startAttendanceFlow}
                  disabled={busy || !modelsLoaded || todayState.status === ATTENDANCE_STATUS.PRESENT}
                  className="btn-primary w-full"
                >
                  {busy ? "Processing..." : todayState.status === ATTENDANCE_STATUS.PRESENT ? "Attendance completed" : "Start attendance"}
                </button>
              )}
            </div>
          </div>

          <div className="card">
            <p className="section-label">Current Reading</p>
            <div className="mt-5 space-y-3 text-sm text-slate-500">
              {locationPayload ? (
                <>
                  <p>Latitude: {locationPayload.latitude.toFixed(6)}</p>
                  <p>Longitude: {locationPayload.longitude.toFixed(6)}</p>
                  <p>
                    Best accuracy:{" "}
                    {locationPayload.accuracy !== null && locationPayload.accuracy !== undefined
                      ? `${Math.round(locationPayload.accuracy)} m`
                      : "Not available"}
                  </p>
                </>
              ) : (
                <p>No location has been captured in this session.</p>
              )}
              {todayState.record?.distanceMeters !== null && todayState.record?.distanceMeters !== undefined && (
                <p>Recorded distance from geofence: {todayState.record.distanceMeters} m</p>
              )}
            </div>
          </div>

          <div className="card">
            <p className="section-label">Geofence</p>
            <div className="mt-5 space-y-3 text-sm text-slate-500">
              <p>Radius: {geofenceInfo?.radius ?? "--"} m</p>
              <p>Required GPS accuracy: {geofenceInfo?.maxAccuracyMeters ?? "--"} m or better</p>
              <p>
                Allowed location time window:{" "}
                {geofenceInfo?.maxLocationAgeMs
                  ? `${Math.round(geofenceInfo.maxLocationAgeMs / 1000)} seconds`
                  : "--"}
              </p>
            </div>
          </div>

          <div className="card">
            <p className="section-label">Verification Rules</p>
            <div className="mt-5 space-y-3 text-sm text-slate-500">
              <p>Attendance is blocked immediately when the location falls outside the configured geofence.</p>
              <p>Outside-location attempts are synced to the backend as absent records for the day.</p>
              <p>Low-accuracy, stale, or tampered GPS payloads are rejected before submission.</p>
              <p>If an absent outside-location record exists, returning to the correct site allows a fresh retry.</p>
              <p>Camera verification requires a secure URL and explicit browser camera permission.</p>
              <p>For the most accurate reading, use a GPS-enabled mobile device or move near a window/open area before retrying.</p>
            </div>
          </div>
        </section>
      </div>
    </PageWrapper>
  );
}
