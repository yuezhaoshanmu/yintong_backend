import React, { createContext, useContext, useMemo, useState } from "react";
import { imageAssets } from "./data/imageAssets";
import { DEFAULT_FAMILY_ID } from "./types";

export type UserRole = "elder" | "child" | "guardian";

export type AppUser = {
  id: string;
  role: UserRole;
  name: string;
  username: string;
  password: string;
  avatar?: string;
  familyId: string;
};

type AuthState = {
  currentUser: AppUser | null;
  users: AppUser[];
};

type AuthResult = {
  ok: boolean;
  user?: AppUser;
  message?: string;
};

type RegisterPayload = {
  role: UserRole;
  name: string;
  username: string;
  password: string;
  confirmPassword: string;
};

type AuthContextValue = AuthState & {
  login: (username: string, password: string, role?: UserRole) => AuthResult;
  registerUser: (payload: RegisterPayload) => AuthResult;
  logout: () => void;
};

const AUTH_USERS_KEY = "silver-child-auth-users-v1";
const AUTH_CURRENT_USER_KEY = "silver-child-auth-current-user-v1";

export const DEMO_USERS: AppUser[] = [
  {
    id: "demo-elder",
    role: "elder",
    name: "王爷爷",
    username: "elder_demo",
    password: "123456",
    avatar: imageAssets.avatars.grandpa,
    familyId: DEFAULT_FAMILY_ID,
  },
  {
    id: "demo-child",
    role: "child",
    name: "萌萌",
    username: "child_demo",
    password: "123456",
    avatar: imageAssets.avatars.childGirl,
    familyId: DEFAULT_FAMILY_ID,
  },
  {
    id: "demo-guardian",
    role: "guardian",
    name: "王女士",
    username: "guardian_demo",
    password: "123456",
    avatar: imageAssets.avatars.father,
    familyId: DEFAULT_FAMILY_ID,
  },
];

export const ROLE_HOME: Record<UserRole, "/elder" | "/child" | "/guardian"> = {
  elder: "/elder",
  child: "/child",
  guardian: "/guardian",
};

export const ROLE_LABEL: Record<UserRole, string> = {
  elder: "长辈记录端",
  child: "儿童探索端",
  guardian: "家属守护后台",
};

function defaultAvatar(role: UserRole): string {
  if (role === "elder") return imageAssets.avatars.grandpa;
  if (role === "child") return imageAssets.avatars.childGirl;
  return imageAssets.avatars.father;
}

function loadRegisteredUsers(): AppUser[] {
  try {
    const raw = window.localStorage.getItem(AUTH_USERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<AppUser>[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((user): user is AppUser =>
        Boolean(user.id && user.role && user.name && user.username && user.password)
      )
      .map((user) => ({
        ...user,
        avatar: user.avatar ?? defaultAvatar(user.role),
        familyId: user.familyId ?? DEFAULT_FAMILY_ID,
      }));
  } catch {
    return [];
  }
}

function mergeUsers(registeredUsers: AppUser[]): AppUser[] {
  const demoUsernames = new Set(DEMO_USERS.map((user) => user.username));
  return [...DEMO_USERS, ...registeredUsers.filter((user) => !demoUsernames.has(user.username))];
}

function loadInitialAuth(): AuthState {
  const users = mergeUsers(loadRegisteredUsers());
  try {
    const raw = window.localStorage.getItem(AUTH_CURRENT_USER_KEY);
    if (!raw) return { users, currentUser: null };
    const saved = JSON.parse(raw) as AppUser;
    const currentUser = users.find((user) => user.id === saved.id || user.username === saved.username) ?? null;
    return { users, currentUser };
  } catch {
    return { users, currentUser: null };
  }
}

function persistRegisteredUsers(users: AppUser[]) {
  const registered = users.filter((user) => !user.id.startsWith("demo-"));
  window.localStorage.setItem(AUTH_USERS_KEY, JSON.stringify(registered));
}

function persistCurrentUser(user: AppUser | null) {
  if (!user) {
    window.localStorage.removeItem(AUTH_CURRENT_USER_KEY);
    return;
  }
  window.localStorage.setItem(AUTH_CURRENT_USER_KEY, JSON.stringify(user));
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const initialAuth = useMemo(loadInitialAuth, []);
  const [users, setUsers] = useState<AppUser[]>(initialAuth.users);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(initialAuth.currentUser);

  const value = useMemo<AuthContextValue>(
    () => ({
      users,
      currentUser,
      login(username, password, role) {
        const cleanUsername = username.trim();
        const user = users.find((item) => item.username === cleanUsername && item.password === password);
        if (!user) return { ok: false, message: "账号或密码不正确，请检查后再试。" };
        if (role && user.role !== role) {
          return { ok: false, message: `这个账号属于${ROLE_LABEL[user.role]}，请使用对应入口登录。` };
        }
        setCurrentUser(user);
        persistCurrentUser(user);
        return { ok: true, user };
      },
      registerUser(payload) {
        const name = payload.name.trim();
        const username = payload.username.trim();
        const password = payload.password;
        if (!name) return { ok: false, message: "昵称不能为空。" };
        if (!username) return { ok: false, message: "账号不能为空。" };
        if (password.length < 6) return { ok: false, message: "密码至少需要 6 位。" };
        if (password !== payload.confirmPassword) return { ok: false, message: "两次输入的密码不一致。" };
        if (users.some((user) => user.username === username)) {
          return { ok: false, message: "这个账号已经存在，请换一个账号。" };
        }

        const user: AppUser = {
          id: `user-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          role: payload.role,
          name,
          username,
          password,
          avatar: defaultAvatar(payload.role),
          familyId: DEFAULT_FAMILY_ID,
        };
        const nextUsers = [...users, user];
        setUsers(nextUsers);
        persistRegisteredUsers(nextUsers);
        setCurrentUser(user);
        persistCurrentUser(user);
        return { ok: true, user };
      },
      logout() {
        setCurrentUser(null);
        persistCurrentUser(null);
      },
    }),
    [currentUser, users]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return value;
}
