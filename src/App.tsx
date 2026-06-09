import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Info, LogOut, X } from "lucide-react";
import { AuthProvider, ROLE_HOME, ROLE_LABEL, UserRole, useAuth } from "./auth";
import AdminConsole from "./components/AdminConsole";
import ChildTerminal from "./components/ChildSandbox";
import ElderTerminal from "./components/ElderTerminal";
import LoginPage from "./components/LoginPage";
import SafeImage from "./components/SafeImage";
import { imageAssets } from "./data/imageAssets";
import { SilverStoreProvider } from "./store";
import { ToastKind } from "./types";
import { stopSpeaking } from "./utils/speech";

type AppPath = "/login" | "/elder" | "/child" | "/guardian" | "/admin" | "/";

const routeRole: Partial<Record<AppPath, UserRole>> = {
  "/elder": "elder",
  "/child": "child",
  "/guardian": "guardian",
  "/admin": "guardian",
};

function readPath(): AppPath {
  const path = window.location.pathname || "/";
  if (["/login", "/elder", "/child", "/guardian", "/admin", "/"].includes(path)) {
    return path as AppPath;
  }
  return "/";
}

export default function App() {
  return (
    <AuthProvider>
      <SilverStoreProvider>
        <AppShell />
      </SilverStoreProvider>
    </AuthProvider>
  );
}

function AppShell() {
  const { currentUser, logout } = useAuth();
  const [path, setPath] = useState<AppPath>(readPath);
  const [textScale, setTextScale] = useState<"normal" | "large" | "super">("normal");
  const [toast, setToast] = useState<{ message: string; type: ToastKind } | null>(null);

  const navigate = useCallback((nextPath: string, replace = false) => {
    stopSpeaking();
    const safePath = nextPath as AppPath;
    if (window.location.pathname !== safePath) {
      window.history[replace ? "replaceState" : "pushState"](null, "", safePath);
    }
    setPath(readPath());
  }, []);

  const showToast = useCallback((message: string, type: ToastKind = "success") => {
    setToast({ message, type });
  }, []);

  useEffect(() => {
    function syncPath() {
      stopSpeaking();
      setPath(readPath());
    }
    window.addEventListener("popstate", syncPath);
    return () => window.removeEventListener("popstate", syncPath);
  }, []);

  useEffect(() => {
    window.addEventListener("pagehide", stopSpeaking);
    return () => window.removeEventListener("pagehide", stopSpeaking);
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (path === "/") {
      navigate(currentUser ? ROLE_HOME[currentUser.role] : "/login", true);
      return;
    }

    if (path === "/login") {
      if (currentUser) navigate(ROLE_HOME[currentUser.role], true);
      return;
    }

    const requiredRole = routeRole[path];
    if (!requiredRole) {
      navigate(currentUser ? ROLE_HOME[currentUser.role] : "/login", true);
      return;
    }

    if (!currentUser) {
      navigate("/login", true);
      return;
    }

    if (path === "/admin" && currentUser.role === "guardian") {
      navigate("/guardian", true);
      return;
    }

    if (currentUser.role !== requiredRole) {
      showToast(`当前账号是${ROLE_LABEL[currentUser.role]}账号，请使用对应账号进入其他端。`, "info");
      navigate(ROLE_HOME[currentUser.role], true);
    }
  }, [currentUser, navigate, path, showToast]);

  const content = useMemo(() => {
    if (!currentUser || path === "/login" || path === "/") {
      return <LoginPage onNavigate={navigate} onShowToast={showToast} />;
    }

    if (currentUser.role === "elder") {
      return (
        <RoleLayout path={path} onLogout={logout} onNavigate={navigate} onShowToast={showToast}>
          <ElderTerminal textScale={textScale} setTextScale={setTextScale} onShowToast={showToast} />
        </RoleLayout>
      );
    }

    if (currentUser.role === "child") {
      return (
        <RoleLayout path={path} onLogout={logout} onNavigate={navigate} onShowToast={showToast}>
          <ChildTerminal onShowToast={showToast} />
        </RoleLayout>
      );
    }

    return (
      <RoleLayout path={path} onLogout={logout} onNavigate={navigate} onShowToast={showToast}>
        <AdminConsole onShowToast={showToast} />
      </RoleLayout>
    );
  }, [currentUser, logout, navigate, path, showToast, textScale]);

  return (
    <>
      <Toast toast={toast} onClose={() => setToast(null)} />
      {content}
    </>
  );
}

function RoleLayout({
  children,
  onLogout,
  onNavigate,
  onShowToast,
}: {
  path: AppPath;
  children: React.ReactNode;
  onLogout: () => void;
  onNavigate: (path: string, replace?: boolean) => void;
  onShowToast: (message: string, type?: ToastKind) => void;
}) {
  const { currentUser } = useAuth();
  if (!currentUser) return null;

  return (
    <div className="flex min-h-screen flex-col bg-[#FAF8F2] text-[#111827]">
      <header className="sticky top-0 z-50 border-b border-[#D1D5DB] bg-[#FAF8F2]/95 px-4 backdrop-blur lg:px-8">
        <div className="mx-auto flex min-h-20 max-w-7xl flex-col justify-between gap-4 py-3 lg:flex-row lg:items-center">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0E9F6E] text-xl font-black text-white">
              银
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight">银童共育 / {ROLE_LABEL[currentUser.role]}</h1>
              <p className="text-xs font-bold text-[#4B5563]">
                把爷爷奶奶的声音和照片，变成孩子愿意听的小故事
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-3 rounded-2xl border border-[#D1D5DB] bg-white px-3 py-2">
              <SafeImage
                src={currentUser.avatar}
                fallbackSrc={imageAssets.placeholders.avatar}
                alt={currentUser.name}
                className="h-10 w-10 rounded-full object-cover"
              />
              <div>
                <p className="text-sm font-black text-[#111827]">{currentUser.name}</p>
                <p className="text-xs font-bold text-[#6B7280]">{ROLE_LABEL[currentUser.role]}</p>
              </div>
            </div>
            <button
              onClick={() => {
                stopSpeaking();
                onLogout();
                onShowToast("已退出登录，可选择另一个角色账号。", "info");
                onNavigate("/login", true);
              }}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-[#D1D5DB] bg-white px-4 font-black text-[#4B5563] hover:bg-[#F3F4F6]"
            >
              <LogOut className="h-4 w-4" />
              退出登录
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 pb-24 lg:px-8">{children}</main>

      <footer className="border-t border-[#D1D5DB] bg-[#F4F2EB] px-4 py-6 text-center">
        <p className="text-sm font-black text-[#111827]">银童共育家庭回忆本</p>
        <p className="mt-1 text-xs font-bold text-[#4B5563]">
          回忆、声音、照片和家人留言会保存在这台设备里，方便一家人继续看、继续听。
        </p>
      </footer>
    </div>
  );
}

function Toast({
  toast,
  onClose,
}: {
  toast: { message: string; type: ToastKind } | null;
  onClose: () => void;
}) {
  if (!toast) return null;
  return (
    <div
      className={`fixed right-4 top-4 z-[200] flex max-w-sm items-start gap-3 rounded-xl border px-4 py-3 shadow-lg ${
        toast.type === "success"
          ? "border-[#0E9F6E] bg-[#EAF5F0] text-[#0E9F6E]"
          : toast.type === "error"
            ? "border-[#B42318] bg-[#FEE2E2] text-[#B42318]"
            : "border-[#D1D5DB] bg-white text-[#111827]"
      }`}
    >
      {toast.type === "success" ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <Info className="h-5 w-5 shrink-0" />}
      <p className="text-sm font-black leading-6">{toast.message}</p>
      <button onClick={onClose} className="ml-auto opacity-70 hover:opacity-100" aria-label="关闭提示">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
