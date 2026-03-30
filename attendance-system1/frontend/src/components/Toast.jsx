import { useCallback, useEffect, useState } from "react";

function Toast({ message, type = "success", onClose }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onClose, 220);
    }, 3200);

    return () => clearTimeout(timer);
  }, [onClose]);

  const styles = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    error: "border-red-200 bg-red-50 text-red-800",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
    info: "border-blue-200 bg-blue-50 text-blue-800",
  };

  return (
    <div
      className={`fixed right-4 top-20 z-[60] w-[min(420px,calc(100vw-2rem))] rounded-2xl border px-4 py-3 shadow-lg transition duration-200 ${
        styles[type]
      } ${visible ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"}`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-1 h-2.5 w-2.5 rounded-full bg-current opacity-70" />
        <p className="text-sm font-medium leading-6">{message}</p>
      </div>
    </div>
  );
}

export function useToast() {
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = "success") => {
    setToast({ id: Date.now(), message, type });
  }, []);

  const ToastContainer = () =>
    toast ? (
      <Toast
        key={toast.id}
        message={toast.message}
        type={toast.type}
        onClose={() => setToast(null)}
      />
    ) : null;

  return { showToast, ToastContainer };
}
