import { HttpError } from "@/core/api/http-client";

const CODE_MESSAGES: Record<string, { en: string; fa: string }> = {
  CHAT_MESSAGE_TOO_LONG: {
    en: "Message is too long.",
    fa: "پیام خیلی طولانی است.",
  },
  CHAT_RATE_LIMITED: {
    en: "You are sending messages too quickly. Please wait.",
    fa: "پیام‌ها را خیلی سریع می‌فرستید. کمی صبر کنید.",
  },
  CHAT_DRAFT_CONFLICT: {
    en: "Draft was updated elsewhere. Reloaded the latest version.",
    fa: "پیش‌نویس جای دیگری به‌روز شده. آخرین نسخه بارگذاری شد.",
  },
  CHAT_DRAFT_NOT_FOUND: {
    en: "No draft found.",
    fa: "پیش‌نویسی یافت نشد.",
  },
  CHAT_INVALID_CURSOR: {
    en: "Invalid list position. Refresh and try again.",
    fa: "موقعیت فهرست نامعتبر است. تازه کنید و دوباره تلاش کنید.",
  },
  CHAT_BLOCKED: {
    en: "Messaging is blocked with this user.",
    fa: "پیام‌رسانی با این کاربر مسدود است.",
  },
  CHAT_EMPLOYEE_REQUIRED: {
    en: "Your account needs an employee profile for Messenger. Refresh and try again, or ask an admin to link your user to an employee.",
    fa: "برای پیام‌رسان، حساب شما باید به پروفایل کارمند متصل باشد. صفحه را تازه کنید یا از مدیر بخواهید کاربر را به کارمند وصل کند.",
  },
  CHAT_NOT_MEMBER: {
    en: "You are not a member of this conversation.",
    fa: "شما عضو این گفتگو نیستید.",
  },
  CHAT_FORBIDDEN: {
    en: "You do not have permission for this action.",
    fa: "اجازه انجام این کار را ندارید.",
  },
  FORBIDDEN: {
    en: "You do not have permission for this action.",
    fa: "اجازه انجام این کار را ندارید.",
  },
  UNAUTHORIZED: {
    en: "Please sign in again.",
    fa: "لطفاً دوباره وارد شوید.",
  },
  NOT_FOUND: {
    en: "Item not found.",
    fa: "مورد یافت نشد.",
  },
};

export function chatErrorMessage(err: unknown, lang: "en" | "fa" = "en"): string {
  if (err instanceof HttpError) {
    if (err.code && CODE_MESSAGES[err.code]) {
      return CODE_MESSAGES[err.code][lang];
    }
    if (err.status === 401) return CODE_MESSAGES.UNAUTHORIZED[lang];
    if (err.status === 403) return CODE_MESSAGES.FORBIDDEN[lang];
    if (err.status === 404) return CODE_MESSAGES.NOT_FOUND[lang];
    if (err.status === 409 && err.code === "CHAT_DRAFT_CONFLICT") {
      return CODE_MESSAGES.CHAT_DRAFT_CONFLICT[lang];
    }
    if (err.status === 429) return CODE_MESSAGES.CHAT_RATE_LIMITED[lang];
    if (err.status >= 500) {
      return lang === "fa"
        ? "خطای سرور. لطفاً دوباره تلاش کنید."
        : "Server error. Please try again.";
    }
  }
  return lang === "fa" ? "خطایی رخ داد." : "Something went wrong.";
}

export function isDraftConflict(err: unknown): boolean {
  return err instanceof HttpError && err.code === "CHAT_DRAFT_CONFLICT";
}
