# مستندات فنی PMASS (نگاه خودمون)

> سند مرجع برای تیم توسعه و استقرار — بر اساس وضعیت فعلی ریپو (Frontend: Next.js **15.5.21** / Backend: Go **1.23**).

---

## ۱. API Endpoints

### خلاصه
بک‌اند یک API یکپارچه روی مسیر `/api/v1/...` است (به‌علاوه `/health`). احراز هویت با JWT انجام می‌شود؛ دسترسی‌ها با نقش و permission کنترل می‌شوند و داده‌های شرکتی با `tenant_id` جدا می‌شوند. در پروداکشن، nginx درخواست‌های `/api` را مستقیم به سرویس Go می‌فرستد.

### توضیح مفصل

#### قوانین کلی
| موضوع | رفتار فعلی |
|--------|------------|
| پایه URL | `/api/v1/...` |
| Health | `GET /health` — پینگ دیتابیس، بدون توکن |
| احراز هویت | `Authorization: Bearer <access_token>` |
| محدودیت نرخ | مسیرهای auth حدود ۱۰ درخواست/دقیقه/IP؛ بقیه حدود ۳۰/دقیقه/IP |
| بدنه JSON | سقف حدود ۱ MiB در API |
| کش پاسخ | هدر `Cache-Control: no-store` روی پاسخ‌های API |
| چندمستأجری | ادمین پلتفرم بدون workspace شرکتی؛ کاربران tenant روی داده همان شرکت |

**سطوح دسترسی (خلاصه):**
- **Public** — بدون JWT
- **Auth** — فقط لاگین معتبر
- **Perm(...)** — لاگین + permission مشخص
- **Platform admin** — مدیریت tenantها و درخواست‌های دسترسی

---

#### Health
| Method | Path | توضیح | Auth |
|--------|------|--------|------|
| GET | `/health` | وضعیت سرویس و اتصال DB | Public |

---

#### احراز هویت و پروفایل
| Method | Path | توضیح | Auth |
|--------|------|--------|------|
| GET | `/api/v1/auth/status` | نیاز به bootstrap؟ وضعیت پلتفرم | Public |
| POST | `/api/v1/auth/bootstrap` | ساخت اولین ادمین پلتفرم | Public |
| POST | `/api/v1/auth/login` | لاگین (پورتال‌محور) | Public |
| POST | `/api/v1/auth/refresh` | تمدید access با refresh | Public |
| POST | `/api/v1/auth/logout` | ابطال نشست refresh | Public |
| POST | `/api/v1/auth/forgot-password` | شروع بازیابی رمز | Public |
| POST | `/api/v1/auth/reset-password` | تکمیل بازیابی رمز | Public |
| POST | `/api/v1/auth/change-password` | تغییر رمز | Auth |
| GET | `/api/v1/auth/me` | کاربر جاری | Auth |
| GET/PUT/PATCH | `/api/v1/auth/profile` | خواندن/به‌روزرسانی پروفایل | Auth |
| GET | `/api/v1/auth/permissions` | کاتالوگ permissionها | Auth |
| POST | `/api/v1/auth/passkeys/login/begin` | شروع لاگین WebAuthn | Public |
| POST | `/api/v1/auth/passkeys/login/finish` | پایان لاگین WebAuthn | Public |
| POST | `/api/v1/auth/passkeys/register/begin` | شروع ثبت Passkey | Auth |
| POST | `/api/v1/auth/passkeys/register/finish` | پایان ثبت Passkey | Auth |
| GET | `/api/v1/auth/passkeys` | لیست Passkeyها | Auth |
| DELETE | `/api/v1/auth/passkeys/{id}` | حذف Passkey | Auth |

---

#### پلتفرم، Tenant و درخواست دسترسی
| Method | Path | توضیح | Auth |
|--------|------|--------|------|
| GET | `/api/v1/company-id-available?slug=` | آزاد بودن اسلاگ شرکت | Public |
| POST | `/api/v1/access-requests` | ثبت درخواست دسترسی شرکت | Public |
| GET | `/api/v1/access-requests` | لیست درخواست‌ها | Platform admin |
| GET | `/api/v1/access-requests/{id}` | جزئیات درخواست | Platform admin |
| PATCH/PUT | `/api/v1/access-requests/{id}` | به‌روزرسانی/رد | Platform admin |
| POST | `/api/v1/access-requests/{id}/provision` | ساخت tenant از درخواست | Platform admin |
| GET/POST | `/api/v1/tenants` | لیست / ساخت tenant | Platform admin |
| GET/PATCH | `/api/v1/tenants/{id}` | خواندن / به‌روزرسانی | Platform admin |

---

#### کاربران و نقش‌ها
| Method | Path | توضیح | Auth |
|--------|------|--------|------|
| GET/POST | `/api/v1/users` | لیست / ساخت کاربر workspace | Perm(`users`) |
| PUT/PATCH/DELETE | `/api/v1/users/{id}` | ویرایش / حذف لاگین | Perm(`users`) |
| GET/POST | `/api/v1/roles` | لیست / ساخت نقش | Perm(`users`) |
| GET/PUT/PATCH/DELETE | `/api/v1/roles/{id}` | CRUD نقش | Perm(`users`) |

---

#### سازمان (شرکت، دپارتمان، تیم، کارمند)
| Method | Path | توضیح |
|--------|------|--------|
| GET/PUT/PATCH/DELETE | `/api/v1/company` | پروفایل شرکت |
| GET/POST | `/api/v1/departments` | لیست / ساخت دپارتمان |
| GET/PUT/PATCH/DELETE | `/api/v1/departments/{id}` | CRUD دپارتمان |
| PUT | `/api/v1/departments/{id}/manager` | تعیین مدیر |
| GET/POST | `/api/v1/teams` | لیست / ساخت تیم |
| GET | `/api/v1/teams/memberships` | همه عضویت‌ها |
| GET/PUT/PATCH/DELETE | `/api/v1/teams/{id}` | CRUD تیم |
| POST | `/api/v1/teams/{id}/move` | جابه‌جایی تیم |
| POST | `/api/v1/teams/{id}/status` | تغییر وضعیت |
| GET | `/api/v1/teams/{id}/dependencies` | وابستگی‌ها |
| GET | `/api/v1/teams/{id}/members` | اعضا |
| PUT | `/api/v1/teams/{id}/lead` | تعیین لید |
| GET/POST | `/api/v1/employees` | لیست / ساخت کارمند |
| GET/PUT/PATCH/DELETE | `/api/v1/employees/{id}` | CRUD کارمند |
| POST | `/api/v1/employees/{id}/activate` | فعال‌سازی |
| POST/DELETE | `/api/v1/employees/{id}/teams/{teamId}` | تخصیص / حذف از تیم |

> کارکنان: خواندن با `product.view`، نوشتن با `employee.manage` (بر اساس متد HTTP).

---

#### محصول، پایپلاین و استیج
| Method | Path | توضیح |
|--------|------|--------|
| GET/POST | `/api/v1/products` | لیست / ساخت |
| GET | `/api/v1/products/summary` | خلاصه دسته‌ای (جلوگیری از N+1) |
| GET/PUT/PATCH/DELETE | `/api/v1/products/{id}` | CRUD |
| PUT | `/api/v1/products/{id}/owner` | مالک |
| PUT | `/api/v1/products/{id}/manager` | مدیر |
| POST | `.../restore` ، `soft-delete` ، `hold` ، `resume` | چرخه عمر |
| GET/POST | `/api/v1/products/{id}/members` | اعضا |
| DELETE | `/api/v1/products/{id}/members/{empId}` | حذف عضو |
| POST | `.../start` ، `move-next` ، `move-prev` ، `complete-stage` ، `reject-stage` ، `reopen-stage` | جریان پایپلاین |
| GET | `/api/v1/products/{id}/stage-instances` | نمونه‌های استیج |
| GET | `/api/v1/products/{id}/projects` | پروژه‌های تو در تو |
| POST | `/api/v1/pipelines` | ساخت پایپلاین |
| GET/PUT/PATCH/DELETE | `/api/v1/pipelines/{id}` | CRUD |
| POST | `/api/v1/pipelines/{id}/archive` ، `restore` | آرشیو / بازگردانی |
| POST | `/api/v1/pipelines/{id}/stages` | افزودن استیج |
| PUT/PATCH/DELETE | `/api/v1/stages/{id}` | ویرایش / حذف استیج |
| POST | `/api/v1/stages/reorder` | مرتب‌سازی استیج‌ها |

> محصولات: عمدتاً `product.view` — پایپلاین/استیج: `product.update`.

---

#### برنامه‌ریزی (پروژه، فیچر، تسک)
| Method | Path | توضیح |
|--------|------|--------|
| GET/POST | `/api/v1/projects` | لیست / ساخت |
| GET/PUT/PATCH/DELETE | `/api/v1/projects/{id}` | CRUD |
| POST | `.../restore` ، `soft-delete` | چرخه نرم |
| GET/POST | `/api/v1/projects/{id}/members` | اعضا |
| DELETE | `/api/v1/projects/{id}/members/{empId}` | حذف عضو |
| GET/POST | `/api/v1/features` | لیست / ساخت |
| GET/PUT/PATCH/DELETE | `/api/v1/features/{id}` | CRUD |
| POST | `.../restore` | بازگردانی |
| PUT | `/api/v1/features/{id}/status` | وضعیت |
| GET/PUT | `/api/v1/features/{id}/dependencies` | وابستگی‌ها |
| GET/POST | `/api/v1/features/{id}/members` | اعضا |
| DELETE | `/api/v1/features/{id}/members/{empId}` | حذف عضو |
| GET | `/api/v1/tasks/my` | تسک‌های من |
| GET/POST | `/api/v1/tasks` | لیست / ساخت |
| GET/PUT/PATCH/DELETE | `/api/v1/tasks/{id}` | CRUD / آرشیو |
| PUT | `/api/v1/tasks/{id}/assign` | تخصیص |
| POST | `.../complete` ، `reject` ، `pause` ، `resume` ، `reopen` ، `restore` ، `soft-delete` | اکشن‌های تسک |
| PUT | `/api/v1/tasks/{id}/dependencies` | وابستگی تسک |
| GET/POST | `/api/v1/tasks/{id}/checklist` | چک‌لیست |
| PUT | `/api/v1/tasks/{id}/checklist/reorder` | مرتب‌سازی |
| PUT/PATCH/DELETE | `/api/v1/tasks/{id}/checklist/{itemId}` | آیتم چک‌لیست |

> Permissionهای رایج: `project.create` ، `feature.create` ، `task.create` (و کنترل‌های مرتبط در لایه سرویس).

---

#### همکاری، داشبورد و جستجو
| Method | Path | توضیح | Auth |
|--------|------|--------|------|
| GET/POST | `/api/v1/comments` | لیست / ایجاد | Auth |
| PATCH/DELETE | `/api/v1/comments/{id}` | ویرایش / حذف | Auth |
| GET/POST | `/api/v1/attachments` | لیست / ثبت پیوست | Auth |
| GET | `/api/v1/activities` | فید فعالیت (`entity_type` ، `entity_id`) | Auth |
| GET | `/api/v1/notifications` | اعلان‌ها | Auth |
| POST | `/api/v1/notifications/{id}/read` | علامت خوانده‌شده | Auth |
| GET | `/api/v1/dashboard` | تجمیع command-center | Perm(`product.view`) |
| GET | `/api/v1/search?q=` | جستجو | Auth |

---

#### ماژول‌های دامنه / Ops (الگوی CRUD)
| دامنه | مسیرهای اصلی | Permission |
|--------|----------------|------------|
| Graph | `GET /api/v1/graph/topology` ؛ CRUD `/graph/members` ، `/graph/edges` | `graph-view` |
| UI/UX | CRUD `/uiux/tokens` ، `/uiux/assets` ؛ `POST .../assets/push` | `uiux` |
| Engineering | CRUD `/engineering/subsystems` ؛ `POST .../pipeline/trigger` | `engineering` |
| Marketing | CRUD `/marketing/campaigns` | `marketing` |
| Operations | CRUD `/operations/items` ؛ `POST .../resolve` | `executive` |
| Finance | CRUD `/finance/entries` | `finance` |
| Legal/HR | CRUD `/legalhr/controls` | `legalhr` |
| Infrastructure | CRUD `/infrastructure/nodes` | `infrastructure` |
| Credentials | CRUD `/credentials` | `settings` |
| Work items | CRUD `/work-items` | Auth + چک سکشن در handler |
| UI layouts | `GET/PUT /ui-layouts/{key}` | Auth |

---

#### نحوه اتصال فرانت به API
1. در مرورگر، اگر `NEXT_PUBLIC_API_URL` خالی باشد، درخواست‌ها همان‌origin به `/api/...` می‌روند.
2. در توسعه، Next با `rewrites` درخواست را به `API_INTERNAL_URL` / بک‌اند لوکال پروکسی می‌کند.
3. در پروداکشن با Docker، nginx روی پورت **3185** مسیر `/api` و `/health` را به `api:8080` و UI را به `web:3000` می‌فرستد.
4. کلاینت HTTP توکن Bearer را از Zustand می‌گیرد؛ در صورت 401 یک‌بار refresh و retry می‌کند و پاسخ‌های `{ success, data }` را unwrap می‌کند.

---

## ۲. تکنولوژی‌ها

### خلاصه
استک اصلی: **Go + Postgres (Supabase)** برای API، **Next.js (App Router) + React + TypeScript** برای UI، **nginx** به‌عنوان gateway، و **Loki/Promtail/Grafana** برای لاگ و مشاهده‌پذیری. فرانت با React Query و Zustand مدیریت داده و نشست را انجام می‌دهد.

### توضیح مفصل

| لایه | تکنولوژی | نسخه / نکته | نقش |
|------|-----------|-------------|-----|
| Backend runtime | Go | **1.23** (`toolchain go1.23.0`) | API، دامنه، میدلور |
| Auth | JWT v5 + WebAuthn | `jwt/v5` ، `go-webauthn` | Access/Refresh + Passkey |
| DB driver | `lib/pq` | 1.12.x | اتصال Postgres |
| Crypto | `golang.org/x/crypto` | 0.28.x | هش رمز و موارد امنیتی |
| Database | PostgreSQL / Supabase | از طریق `DATABASE_URL` / `SUPABASE_DB_URL` | داده پایدار + migration |
| Frontend | Next.js | **15.5.21** (standalone) | UI، App Router، build کانتینری |
| UI library | React / React DOM | **19.0.1** | رندر کلاینت |
| Data fetching | TanStack React Query | **5.101.x** | کش و همگام‌سازی کلاینت |
| State | Zustand | **5.0.x** | auth store و state سبک |
| Charts | Recharts | **3.9.x** | نمودارهای داشبورد |
| Language | TypeScript | ^5 | تایپ فرانت |
| Lint | ESLint + eslint-config-next | هم‌نسخه با Next | کیفیت کد |
| Node (Docker) | 20-alpine | در Dockerfile فرانت | بیلد و اجرا |
| Gateway | nginx | 1.27-alpine | پروکسی یکپارچه روی :3185 |
| Observability | Loki 3 + Promtail 3 + Grafana | Grafana معمولاً روی سیستم دولوپر | لاگ متمرکز |
| Packaging | Docker Compose | `api` / `web` / `gateway` (+ logs) | استقرار |

**معماری منطقی (کوتاه):**
- بک‌اند ترکیبی از handlerهای کلاسیک و لایه VSM (domain / application / postgres / delivery) دارد.
- فرانت زیر `pmas-live/src` با `app` (صفحات)، `features`، `core` (api/auth)، و `shared` (مسیرها و permission) سازماندهی شده.
- چندمستأجری با `tenant_id` در JWT و جداسازی در کوئری‌ها پیاده شده؛ پورتال‌های platform / employee / welcome از هم جدا هستند.

---

## ۳. خوبی‌ها و بدی‌های ضروری نسخه‌ها

### خلاصه
نسخه‌های فعلی برای امنیت و نگهداری منطقی انتخاب شده‌اند (مخصوصاً بعد از پچ Next به 15.5.21). هزینه اصلی این است که بعضی نسخه‌ها «آخرین major» نیستند و بعضی وابستگی‌ها هنوز جا برای سخت‌گیری امنیتی/عملکردی دارند.

### توضیح مفصل

#### Next.js **15.5.21**
| خوبی‌ها | محدودیت‌ها / بدی‌ها |
|---------|---------------------|
| پچ امنیتی Maintenance LTS؛ پوشش CVEهای مهم (RSC/RCE، SSRF در rewrite، و چند مورد DoS/auth) | خط ۱۵ دیگر Active LTS اصلی نیست؛ آینده پچ‌ها محدودتر از ۱۶ است |
| سازگاری خوب با App Router و `output: "standalone"` فعلی ما | پرش به ۱۶ قابلیت‌های جدید می‌آورد ولی ریسک رگرسیون و تست بیشتر دارد |
| نیازی به بازنویسی فرایند اپ نبود | بعضی فیچرهای جدید فقط در ۱۶ پایدارتر/غنی‌ترند |

#### React **19.0.1**
| خوبی‌ها | محدودیت‌ها / بدی‌ها |
|---------|---------------------|
| پچ حداقلی روی آسیب‌پذیری‌های بحرانی مسیر RSC نسبت به 19.0.0 | روی شاخه 19.0 مانده‌ایم؛ پچ‌های جدیدتر روی 19.1/19.2 هم هستند |
| هم‌خوان با peer dependencyهای Next 15.5 | اگر بعداً به 19.2.x برویم، باید regression UI را تست کنیم |

#### Go **1.23**
| خوبی‌ها | محدودیت‌ها / بدی‌ها |
|---------|---------------------|
| پایدار، مناسب سرویس‌های بلندمدت، toolchain مشخص در `go.mod` | نسخه‌های جدیدتر Go امکانات و بهینه‌سازی runtime بیشتری دارند |
| ایمیج بیلد با `golang:1.23-alpine` هم‌راستا است | باید دوره‌ای CVE toolchain و base image را چک کنیم |

#### Node **20** (در Docker فرانت)
| خوبی‌ها | محدودیت‌ها / بدی‌ها |
|---------|---------------------|
| LTS بالغ و رایج در محیط‌های سازمانی | Node 22 LTS جدیدتر است؛ مهاجرت باید زمان‌بندی شود |
| سازگار با اکوسیستم Next فعلی | باید EOL Node 20 را در تقویم نگهداری ببینیم |

#### Postgres / Supabase + `lib/pq`
| خوبی‌ها | محدودیت‌ها / بدی‌ها |
|---------|---------------------|
| استقرار شناخته‌شده، SSL پیش‌فرض منطقی، schema با migration | درایور کلاسیک `lib/pq`؛ اکوسیستم جدیدتر گاهی `pgx` را ترجیح می‌دهد |
| Pool کنترل‌شده (MaxOpen 10 و ...) | سقف pool برای ترافیک بالا ممکن است گلوگاه شود |

#### nginx **1.27** + Loki/Promtail **3**
| خوبی‌ها | محدودیت‌ها / بدی‌ها |
|---------|---------------------|
| gateway ساده و قابل‌اطمینان؛ لاگ‌ها از اینترنت عمومی جدا (Grafana روی PC) | observability فعلاً بیشتر لاگ‌محور است، نه متریک/تریس کامل |
| جداسازی `api` / `web` / `gateway` تمیز است | rate-limit فعلی در‌حافظهٔ پروسه API است (بین instanceها مشترک نیست) |

#### JWT در کلاینت (localStorage/sessionStorage) به‌جای کوکی HttpOnly
| خوبی‌ها | محدودیت‌ها / بدی‌ها |
|---------|---------------------|
| پیاده‌سازی ساده برای SPA/CSR سنگین فعلی | در برابر XSS، توکن در دسترس اسکریپت صفحه است |
| refresh و retry در کلاینت کنترل‌پذیر است | الگوی کوکی HttpOnly + SameSite معمولاً از نظر امنیتی سخت‌گیرانه‌تر است |

---

## ۴. خوبی‌ها، نقاط قوت و ضعف برنامه

### خلاصه
نقطه قوت اصلی PMASS مدل دامنه غنی (سازمان → محصول → پایپلاین → برنامه‌ریزی) با مرزبندی tenant و permission است. نقطه ضعف اصلی بیشتر سمت تجربه فنی اجراست: کلاینت سنگین، وابستگی زیاد به CSR، و هزینه احراز هویت روی تقریباً هر درخواست API.

### توضیح مفصل

#### نقاط قوت
1. **مدل کسب‌وکار واضح:** از شرکت و تیم تا محصول، استیج، پروژه، فیچر و تسک مسیر منسجمی دارد؛ اکشن‌های چرخه عمر (hold/resume، complete/reject و ...) در API سطح اول هستند.
2. **چندمستأجری واقعی:** جداسازی platform admin و workspace شرکتی؛ provision از access-request تا tenant.
3. **کنترل دسترسی لایه‌ای:** JWT + نقش + permission + scope شرکت؛ نه فقط «لاگین کردی پس همه‌چیز باز است».
4. **امنیت عملیاتی قابل‌قبول:** rate limit، سقف body، هدرهای امنیتی، CSP در Next، `poweredByHeader: false`، لاگ بدون وابستگی به Grafana عمومی.
5. **استقرار تمیز:** Docker standalone برای وب، nginx به‌عنوان درگاه واحد، اسکریپت‌ها و observability جدا.
6. **بهینه‌سازی‌های عمدی در بک‌اند:** مثلاً `products/summary` برای جلوگیری از N+1؛ endpoint تجمیعی `/dashboard`.
7. **DX فرانت:** React Query با `staleTime` معقول، refresh تک‌پروازی روی 401، i18n (en/fa)، route guard بر اساس permission.

#### نقاط ضعف / ریسک
1. **تقریباً همه‌چیز Client Component است:** فایده RSC و کاهش JS اولیه کمتر استفاده شده؛ First Load بعضی صفحات (مثل `/home`) سنگین است.
2. **هر درخواست authenticated یک round-trip تازه به DB برای claims دارد:** امن است، ولی روی ترافیک بالا latency و فشار DB می‌آورد.
3. **توکن در storage مرورگر:** الگوی XSS-حساس‌تر نسبت به session کوکی HttpOnly.
4. **صفحات جزئیات (محصول/برنامه‌ریزی) چند `useQuery` موازی دارند:** کارکرد درست است، ولی fan-out شبکه و waterfall احتمالی وجود دارد.
5. **بدون `next/image` و تقریباً بدون `next/dynamic`:** فرصت‌های code-splitting و بهینه‌سازی تصویر استفاده نشده‌اند.
6. **Recharts وابستگی سنگینی به باندل کلاینت اضافه می‌کند.**
7. **API عمداً `no-store` است:** برای داده حساس درست است، ولی کش HTTP لبه‌ای تقریباً وجود ندارد.
8. **ماژول‌های legacy CRUD کنار VSM:** دو سبک پیاده‌سازی؛ هزینه نگهداری و یکنواختی API را بالا می‌برد.
9. **Rate limit درون‌حافظه‌ای:** در مقیاس چند-instance یا restart، رفتار یکنواخت نیست.
10. **آواتار به‌صورت data URL:** می‌تواند payload پروفایل/`me` را بی‌دلیل بزرگ کند.

#### جمع‌بندی صادقانه
برای یک سیستم مدیریت محصول/سازمان چندمستأجری، ستون فقرات دامنه و امنیت «خوب و قابل اتکا» است. گلوگاه بعدی بیشتر **پرفورمنس ادراک‌شده UI** و **هزینه احراز هویت سمت سرور** است تا کمبود فیچر پایه.

---

## ۵. توصیه‌ها برای سرعت و پرفورمنس

### خلاصه
بیشترین بازده را از این سه جبهه می‌گیریم: (۱) کم کردن کار تکراری احراز هویت و DB، (۲) سبک‌کردن باندل و درخواست‌های فرانت، (۳) تجمیع داده در API به‌جای چند درخواست موازی از UI. تغییرات زیر بدون عوض کردن «فرایند کسب‌وکار» قابل انجام‌اند.

### توضیح مفصل

#### اولویت بالا (اثر زیاد / ریسک متوسط یا کم)
1. **کش کوتاه‌عمر claims در auth middleware**  
   مثلاً ۳۰–۶۰ ثانیه in-memory/Redis برای `(user_id, session_version)` با invalidate روی logout/change-password/role-change. امنیت `session_version` حفظ می‌شود، DB کمتر داغ می‌شود.

2. **Endpointهای تجمیعی برای صفحات سنگین**  
   الگوی `/dashboard` و `/products/summary` را برای `ProductDetail` و `Planning` هم بیاوریم: یک پاسخ شامل اعضا/استیج‌ها/پروژه‌ها به‌جای ۵–۱۰ round-trip.

3. **Code-splitting واقعی در فرانت**  
   - `next/dynamic` برای نمودارها، ویزاردها، گراف، و تب‌های سنگین  
   - جدا کردن Recharts از مسیر اولیه `/home` تا وقتی کاربر واقعاً به چارت نیاز دارد

4. **کاهش Client Componentهای غیرضروری**  
   layoutها، شل‌های استاتیک، و صفحات متنی را به Server Component نزدیک کنیم؛ فقط بخش تعاملی `"use client"` بماند.

5. **پروفایل و آواتار**  
   آواتار را از data URL به object storage / URL ثابت منتقل کنیم تا `me` و لیست کاربران سبک شود.

#### اولویت متوسط
6. **تنظیم دقیق‌تر React Query**  
   برای داده‌های کم‌تغییر (نقش‌ها، کاتالوگ permission، توپولوژی نسبتاً ثابت) `staleTime` بالاتر؛ برای فید اعلان کوتاه‌تر. از prefetch روی hover/route هم استفاده کنیم.

7. **ایندکس و کوئری DB**  
   روی فیلترهای پرتکرار (`tenant_id`، `product_id`، `entity_type+entity_id` در activities، تسک‌های my) ایندکس و `EXPLAIN` دوره‌ای.

8. **Pool و مشاهده فشار DB**  
   MaxOpen=10 را با متریک اتصال واقعی بازبینی کنیم؛ اگر همزمانی بالا رفت، یا pool را تنظیم کنیم یا claim-cache را اول بیاوریم.

9. **فشرده‌سازی و کش استاتیک در nginx**  
   برای `/_next/static` کش طولانی + gzip/brotli؛ API همان `no-store` بماند.

10. **Pagination اجباری و سقف صفحه**  
   در لیست‌های بزرگ (تسک، activity، notification، search) همیشه limit/cursor؛ از «همه‌چیز را یکجا» پرهیز کنیم.

#### اولویت پایین‌تر ولی ارزشمند
11. **متریک و تریس کنار لاگ**  
   Prometheus/OpenTelemetry برای latency پراکنده‌ترین endpointها — الان بیشتر لاگ داریم تا پروفایل عملکرد.

12. **ارزیابی مهاجرت تدریجی به Next 16 (Active LTS)**  
   بعد از پایدار شدن تست‌ها؛ صرفاً برای پرفورمنس عجله نکنیم، برای نگهداری بلندمدت برنامه‌ریزی کنیم.

13. **HttpOnly cookie برای refresh (یا کل session)**  
   بیشتر امنیت است تا سرعت، ولی با کاهش منطق پیچیده refresh در کلاینت، پایداری نشست بهتر می‌شود.

14. **یکسان‌سازی تدریجی handlerهای legacy با لایه VSM**  
   هزینه نگهداری کمتر → فرصت بهینه‌سازی کوئری بیشتر و API یکدست‌تر.

#### چیزهایی که عمداً پیشنهاد نمی‌کنیم (فعلاً)
- خاموش کردن `Cache-Control: no-store` روی کل API بدون طراحی دقیق (ریسک نشت داده حساس).
- پرش یک‌شبه به React 19.2 یا Next 16 بدون مسیر تست رگرسیون.
- بزرگ کردن بی‌حساب DB pool قبل از کم کردن round-tripهای تکراری auth.

---

## پیوست: نقشه سریع ریپو

| مسیر | نقش |
|------|-----|
| `cmd/api/main.go` | ورود API، رجیستر مسیرهای اصلی |
| `internal/delivery/http/wire.go` | سیم‌کشی VSM (سازمان/محصول/برنامه/...) |
| `internal/handlers/` | auth، tenant، CRUDهای دامنه |
| `internal/middleware/` | امنیت، auth، لاگ درخواست |
| `pmas-live/` | فرانت Next.js |
| `deploy/` | nginx، observability |
| `docker-compose.yml` | `api` + `web` + `gateway` |

---

*آخرین به‌روزرسانی سند: هم‌راستا با ارتقای امنیتی Next به 15.5.21 و وضعیت فعلی کدبیس PMASS.*
