import React, { useMemo, useState } from "react";
import { Baby, Camera, HeartHandshake, ShieldCheck, Users } from "lucide-react";
import {
  DEMO_USERS,
  ROLE_HOME,
  ROLE_LABEL,
  UserRole,
  useAuth,
} from "../auth";
import { imageAssets } from "../data/imageAssets";
import { ToastKind } from "../types";
import SafeImage from "./SafeImage";

type LoginPageProps = {
  onNavigate: (path: string, replace?: boolean) => void;
  onShowToast: (message: string, type?: ToastKind) => void;
};

type LoginFormState = Record<UserRole, { username: string; password: string }>;

const roleCards: {
  role: UserRole;
  title: string;
  description: string;
  button: string;
  avatar: string;
  icon: React.ReactNode;
}[] = [
  {
    role: "elder",
    title: "长辈记录端",
    description: "录声音、传照片，给孩子留下故事",
    button: "进入长辈端",
    avatar: imageAssets.avatars.grandpa,
    icon: <Users className="h-5 w-5" />,
  },
  {
    role: "child",
    title: "儿童探索端",
    description: "听爷爷讲故事，完成小任务",
    button: "进入儿童端",
    avatar: imageAssets.avatars.childGirl,
    icon: <Baby className="h-5 w-5" />,
  },
  {
    role: "guardian",
    title: "家属守护后台",
    description: "查看互动记录，守护家庭陪伴",
    button: "进入家属后台",
    avatar: imageAssets.avatars.father,
    icon: <ShieldCheck className="h-5 w-5" />,
  },
];

const registerRoleText: Record<UserRole, string> = {
  elder: "我是长辈",
  child: "我是孩子",
  guardian: "我是家属",
};

export default function LoginPage({ onNavigate, onShowToast }: LoginPageProps) {
  const { login, registerUser } = useAuth();
  const initialForms = useMemo(
    () =>
      DEMO_USERS.reduce((forms, user) => {
        forms[user.role] = { username: user.username, password: user.password };
        return forms;
      }, {} as LoginFormState),
    []
  );
  const [forms, setForms] = useState<LoginFormState>(initialForms);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerRole, setRegisterRole] = useState<UserRole>("elder");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [registerError, setRegisterError] = useState("");

  function updateForm(role: UserRole, field: "username" | "password", value: string) {
    setForms((current) => ({
      ...current,
      [role]: {
        ...current[role],
        [field]: value,
      },
    }));
  }

  function submitLogin(event: React.FormEvent, role: UserRole) {
    event.preventDefault();
    const result = login(forms[role].username, forms[role].password, role);
    if (!result.ok || !result.user) {
      onShowToast(result.message ?? "登录失败，请稍后再试。", "error");
      return;
    }
    onShowToast(`${result.user.name}，欢迎回到${ROLE_LABEL[result.user.role]}。`, "success");
    onNavigate(ROLE_HOME[result.user.role], true);
  }

  function submitRegister(event: React.FormEvent) {
    event.preventDefault();
    const result = registerUser({
      role: registerRole,
      name,
      username,
      password,
      confirmPassword,
    });
    if (!result.ok || !result.user) {
      const message = result.message ?? "注册失败，请检查表单。";
      setRegisterError(message);
      onShowToast(message, "error");
      return;
    }
    setRegisterError("");
    onShowToast(`${result.user.name}，账号已创建。`, "success");
    onNavigate(ROLE_HOME[result.user.role], true);
  }

  return (
    <main className="min-h-screen bg-[#FAF8F2] text-[#3F2D1F]">
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-8 lg:px-8">
        <header className="flex flex-col gap-6 border-b border-[#E1D3BF] pb-7 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0E9F6E] text-2xl font-black text-white">
              银
            </div>
            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-[#8A6A45]">
                SILVER-CHILD INTERGENERATIONAL HARMONY
              </p>
              <h1 className="mt-1 text-4xl font-black text-[#2C2118]">银童共育</h1>
              <p className="mt-2 max-w-2xl text-lg font-bold leading-8 text-[#6B4F35]">
                把爷爷奶奶的声音和照片，变成孩子愿意听的小故事
              </p>
            </div>
          </div>
          <button
            onClick={() => setRegisterOpen((value) => !value)}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-[#B99568] bg-white px-5 font-black text-[#6B4F35] shadow-sm hover:bg-[#FFF7ED]"
          >
            <HeartHandshake className="h-5 w-5" />
            注册家庭账号
          </button>
        </header>

        <div className="grid flex-1 grid-cols-1 gap-6 py-8 xl:grid-cols-[1fr_360px]">
          <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            {roleCards.map((card) => {
              const form = forms[card.role];
              return (
                <form
                  key={card.role}
                  onSubmit={(event) => submitLogin(event, card.role)}
                  className="flex min-h-[520px] flex-col overflow-hidden rounded-2xl border border-[#E1D3BF] bg-[#FFFDF8] shadow-[0_16px_40px_rgba(99,72,39,0.10)]"
                >
                  <div className="relative h-48 bg-[#F7F0E4]">
                    <SafeImage
                      src={card.avatar}
                      fallbackSrc={imageAssets.placeholders.avatar}
                      alt={card.title}
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-2 text-sm font-black text-[#6B4F35] shadow-sm">
                      {card.icon}
                      {card.title}
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <h2 className="text-2xl font-black text-[#2C2118]">{card.title}</h2>
                    <p className="mt-2 min-h-14 text-base font-bold leading-7 text-[#6B4F35]">{card.description}</p>
                    <div className="mt-5 space-y-3">
                      <label className="block">
                        <span className="text-sm font-black text-[#3F2D1F]">账号</span>
                        <input
                          value={form.username}
                          onChange={(event) => updateForm(card.role, "username", event.target.value)}
                          className="mt-1 h-12 w-full rounded-xl border border-[#D8C8B0] bg-white px-4 font-black outline-none focus:border-[#0E9F6E]"
                        />
                      </label>
                      <label className="block">
                        <span className="text-sm font-black text-[#3F2D1F]">密码</span>
                        <input
                          value={form.password}
                          onChange={(event) => updateForm(card.role, "password", event.target.value)}
                          className="mt-1 h-12 w-full rounded-xl border border-[#D8C8B0] bg-white px-4 font-black outline-none focus:border-[#0E9F6E]"
                        />
                      </label>
                    </div>
                    <p className="mt-3 rounded-xl bg-[#F7F0E4] px-3 py-2 text-sm font-bold text-[#8A6A45]">
                      路演账号已预填，可直接点击登录。
                    </p>
                    <button className="mt-auto flex h-12 items-center justify-center gap-2 rounded-xl bg-[#0E9F6E] px-5 font-black text-white hover:bg-[#0C8F62]">
                      {card.icon}
                      {card.button}
                    </button>
                  </div>
                </form>
              );
            })}
          </section>

          <aside className="space-y-5">
            <section className="rounded-2xl border border-[#E1D3BF] bg-[#FFF7ED] p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <Camera className="h-7 w-7 text-[#FD8603]" />
                <div>
                  <h2 className="text-xl font-black text-[#2C2118]">同一个家庭</h2>
                  <p className="mt-1 text-sm font-bold leading-6 text-[#6B4F35]">
                    三个角色各进各的端，故事、任务和互动仍在一个家庭相册里同步。
                  </p>
                </div>
              </div>
            </section>

            {registerOpen && (
              <section className="rounded-2xl border border-[#E1D3BF] bg-white p-5 shadow-[0_14px_34px_rgba(99,72,39,0.10)]">
                <h2 className="text-xl font-black text-[#2C2118]">注册新家庭账号</h2>
                <form onSubmit={submitRegister} className="mt-4 space-y-4">
                  <div>
                    <p className="text-sm font-black text-[#3F2D1F]">选择角色</p>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      {(["elder", "child", "guardian"] as UserRole[]).map((role) => (
                        <button
                          type="button"
                          key={role}
                          onClick={() => setRegisterRole(role)}
                          className={`min-h-11 rounded-xl border px-2 text-sm font-black ${
                            registerRole === role
                              ? "border-[#0E9F6E] bg-[#EAF5F0] text-[#0E6F52]"
                              : "border-[#D8C8B0] bg-[#FAF8F2] text-[#6B4F35]"
                          }`}
                        >
                          {registerRoleText[role]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="block">
                    <span className="text-sm font-black text-[#3F2D1F]">昵称</span>
                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      className="mt-1 h-11 w-full rounded-xl border border-[#D8C8B0] px-3 font-bold outline-none focus:border-[#0E9F6E]"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-black text-[#3F2D1F]">手机号或账号</span>
                    <input
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      className="mt-1 h-11 w-full rounded-xl border border-[#D8C8B0] px-3 font-bold outline-none focus:border-[#0E9F6E]"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-black text-[#3F2D1F]">密码</span>
                    <input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="mt-1 h-11 w-full rounded-xl border border-[#D8C8B0] px-3 font-bold outline-none focus:border-[#0E9F6E]"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-black text-[#3F2D1F]">确认密码</span>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      className="mt-1 h-11 w-full rounded-xl border border-[#D8C8B0] px-3 font-bold outline-none focus:border-[#0E9F6E]"
                    />
                  </label>
                  {registerError && (
                    <p className="rounded-xl border border-[#B42318] bg-[#FEE2E2] px-3 py-2 text-sm font-black text-[#B42318]">
                      {registerError}
                    </p>
                  )}
                  <button className="h-12 w-full rounded-xl bg-[#7A4E2D] font-black text-white hover:bg-[#633D23]">
                    创建并进入{ROLE_LABEL[registerRole]}
                  </button>
                </form>
              </section>
            )}
          </aside>
        </div>
      </section>
    </main>
  );
}
