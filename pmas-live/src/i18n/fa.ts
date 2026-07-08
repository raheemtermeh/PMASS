import { notFound } from 'next/navigation';

type Locale = 'en' | 'fa';

type NavLabels = {
  [key: string]: string;
};

type RouteTitles = {
  [key: string]: string;
};

type RouteSubtitles = {
  [key: string]: string;
};

type Login = {
  title: string;
  subtitle: string;
  companyLogin: string;
  platformAdmin: string;
  companyId: string;
  email: string;
  password: string;
};

type Sidebar = {
  expand: string;
  collapse: string;
  signOut: string;
};

type Auth = {
  loading: string;
  error: string;
};

export const navLabels: NavLabels = {
  "product-manager": "مدیر محصول",
  profile: "پروفایل",
  executive: "کنترل اجرایی",
  uiux: "طراحی UI/UX",
  engineering: "مهندسی",
  infrastructure: "زیرساخت",
  marketing: "بازاریابی",
  "graph-view": "شبکه گراف",
  finance: "دارایی مالی",
  legalhr: "حقوق و کارکنان",
  settings: "تنظیمات سیستم",
  "admin-users": "مدیریت کاربر",
  "platform-tenants": "شرکت‌ها",
};

export const routeTitles: RouteTitles = {
  executive: "اتاق کنترل اجرایی",
  uiux: "فضای کار UI/UX",
  engineering: "پلتفرم هسته مهندسی",
  infrastructure: "دروازه زیرساخت",
  marketing: "فضای کار بازاریابی",
  "graph-view": "توپولوژی شبکه",
  finance: "تل Telemetry مالی",
  legalhr: "رعایت قوانین حقوقی و نیروی کار",
  settings: "تنظیمات سیستم",
  "admin-users": "مدیریت کاربر",
  "platform-tenants": "تأمین شرکت‌ها",
  "product-manager": "مدیر محصول",
  profile: "پروفایل کاربر",
};

export const routeSubtitles: RouteSubtitles = {
  executive: "تل Telemetry پروژه‌های جهانی",
  uiux: "مدیریت توکن‌های طراحی و دارایی‌ها",
  engineering: "زیرسیستم‌ها و خطوط CI/CD",
  infrastructure: "تل Telemetry خوشه‌ها و استقرار",
  marketing: "تل Telemetry کمپین‌ها و قیف",
  "graph-view": "گراف وابستگی‌های بین وظیفه‌ای",
  finance: "تل Telemetry هزینه‌ها و هزینه‌های جاری",
  legalhr: "کنترل‌های رعایت قوانین نیروی کار",
  settings: "Vault اعتبارنامه‌های یکپارچه‌سازی",
  "admin-users": "ایجاد کارمندان و اختصاص دسترسی‌های فضای کاری",
  "platform-tenants": "ایجاد فضاهای کاری معزول‌شده برای شرکت‌های مشتری",
  "product-manager": "پلی‌بوک‌ها و نقشه توانایی‌ها فقط بر اساس دسترسی شما",
  profile: "هویّت، اطلاعات تماس و امنیت حساب کاربری شما",
};

export const login: Login = {
  title: "PMAS Live",
  subtitle: "به فضای کاری شرکت خود وارد شوید.",
  companyLogin: "ورود شرکت",
  platformAdmin: "مدیر ارشد پلتفرم",
  companyId: "شناسه شرکت",
  email: "آدرس ایمیل",
  password: "کلمه‌ی عبور",
};

export const sidebar: Sidebar = {
  expand: "گسترش sidebar",
  collapse: "بستن sidebar",
  signOut: "خروج از حساب",
};

export const auth: Auth = {
  loading: "PMAS Live در حال بارگذاری",
  error: "عدم دسترسی به API سرور. لطفا سرور را بر روی پورت 8080 اجرا کنید.",
};
