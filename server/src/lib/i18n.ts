import type { Request } from 'express';

/**
 * Übersetzung der Server-Meldungen. Der Code schreibt Meldungen auf Deutsch;
 * die Oberfläche schickt ihre Sprache im Header "X-KK-Lang" mit, die Fehlerbehandlung übersetzt dann.
 * Neue Meldungen hier eintragen – test/i18n.test.ts prüft, dass keine vergessen wird.
 */
export const LANGUAGES = ['de', 'ar'] as const;
export type Language = (typeof LANGUAGES)[number];

export function requestLanguage(req: Request): Language {
  return req.get('x-kk-lang') === 'ar' ? 'ar' : 'de';
}

const AR: Record<string, string> = {
  'Anfrage von fremder Seite abgelehnt.': 'تم رفض طلب من موقع غريب.',
  'Benutzername fehlt.': 'اسم المستخدم مفقود.',
  'Benutzername oder Passwort ist falsch.': 'اسم المستخدم أو كلمة المرور غير صحيحة.',
  'Betreuer melden sich bitte auf der Betreuer-Seite an.': 'يرجى من المشرفين تسجيل الدخول في صفحة المشرفين.',
  'Bitte einen Kartentyp wählen.': 'يرجى اختيار نوع البطاقة.',
  'Bitte einen Namen angeben.': 'يرجى إدخال اسم.',
  'Bitte einen Titel angeben.': 'يرجى إدخال عنوان.',
  'Bitte melde dich an.': 'يرجى تسجيل الدخول.',
  'Bitte mindestens eine richtige Antwort eintragen.': 'يرجى إدخال إجابة صحيحة واحدة على الأقل.',
  'Bitte mindestens zwei Antwortmöglichkeiten eintragen.': 'يرجى إدخال خيارين للإجابة على الأقل.',
  'Dafür fehlt die Berechtigung.': 'ليست لديك صلاحية لذلك.',
  'Das aktuelle Passwort ist falsch.': 'كلمة المرور الحالية غير صحيحة.',
  'Das ist ein Kinderkonto. Kinder melden sich in der Kinder-App an.': 'هذا حساب طفل. يسجّل الأطفال الدخول في تطبيق الأطفال.',
  'Das Passwort ist zu einfach.': 'كلمة المرور سهلة جدًا.',
  'Das Passwort ist zu lang.': 'كلمة المرور طويلة جدًا.',
  'Der Antwort-/Erklärungstext ist zu lang (max. 4000 Zeichen).': 'نص الإجابة أو الشرح طويل جدًا (4000 حرف كحد أقصى).',
  'Der Benutzername darf höchstens 32 Zeichen lang sein.': 'يجب ألا يزيد اسم المستخدم عن 32 حرفًا.',
  'Der Benutzername darf nur Kleinbuchstaben, Ziffern sowie . _ - enthalten.': 'يجب أن يحتوي اسم المستخدم على أحرف لاتينية صغيرة وأرقام و . _ - فقط.',
  'Der Benutzername muss mindestens 3 Zeichen lang sein.': 'يجب أن يتكون اسم المستخدم من 3 أحرف على الأقل.',
  'Der Name ist zu lang.': 'الاسم طويل جدًا.',
  'Der Titel ist zu lang.': 'العنوان طويل جدًا.',
  'Die Beschreibung ist zu lang.': 'الوصف طويل جدًا.',
  'Die Datei ist zu groß.': 'الملف كبير جدًا.',
  'Die Frage ist zu lang (max. 2000 Zeichen).': 'السؤال طويل جدًا (2000 حرف كحد أقصى).',
  'Die Kartenliste hat sich geändert. Bitte die Seite neu laden.': 'تغيّرت قائمة البطاقات. يرجى إعادة تحميل الصفحة.',
  'Die Rückseite braucht einen Text oder ein Bild.': 'يجب أن يحتوي ظهر البطاقة على نص أو صورة.',
  'Die Vorderseite braucht einen Text oder ein Bild.': 'يجب أن يحتوي وجه البطاقة على نص أو صورة.',
  'Diese Karte gibt es nicht mehr. Bitte neu laden.': 'هذه البطاقة لم تعد موجودة. يرجى إعادة التحميل.',
  'Dieser Benutzername ist schon vergeben.': 'اسم المستخدم هذا مستخدم بالفعل.',
  'Dieser Kartenstapel ist dir nicht zugeteilt.': 'مجموعة البطاقات هذه غير مخصّصة لك.',
  'Dieses Konto ist deaktiviert. Bitte wende dich an einen Betreuer.': 'هذا الحساب معطّل. يرجى التواصل مع أحد المشرفين.',
  'Du kannst dein eigenes Konto nicht löschen.': 'لا يمكنك حذف حسابك الخاص.',
  'Du kannst dir nicht selbst die Admin-Rechte entziehen oder dich deaktivieren.': 'لا يمكنك سحب صلاحيات المدير من نفسك أو تعطيل حسابك.',
  'Ein Bild wurde nicht gefunden. Bitte erneut hochladen.': 'لم يتم العثور على صورة. يرجى رفعها مرة أخرى.',
  'Eine Antwort ist zu lang.': 'إحدى الإجابات طويلة جدًا.',
  'Eine Antwortmöglichkeit ist zu lang.': 'أحد خيارات الإجابة طويل جدًا.',
  'Es läuft gerade kein Lerndurchgang. Bitte neu laden.': 'لا توجد جولة تعلّم جارية الآن. يرجى إعادة التحميل.',
  'Es muss mindestens ein aktiver Admin bleiben.': 'يجب أن يبقى مدير نشط واحد على الأقل.',
  'Höchstens 10 Antwortmöglichkeiten.': '10 خيارات للإجابة كحد أقصى.',
  'Höchstens 20 richtige Schreibweisen.': '20 صيغة صحيحة كحد أقصى.',
  'Interner Fehler. Bitte später erneut versuchen.': 'خطأ داخلي. يرجى المحاولة لاحقًا.',
  'Keine Bilddatei erhalten.': 'لم يتم استلام ملف صورة.',
  'Mindestens eine Antwortmöglichkeit muss richtig sein.': 'يجب أن يكون خيار واحد على الأقل صحيحًا.',
  'Name fehlt.': 'الاسم مفقود.',
  'Nur Bilder im Format PNG, JPG, WEBP oder GIF sind erlaubt.': 'يُسمح فقط بالصور بصيغة PNG أو JPG أو WEBP أو GIF.',
  'Passwort fehlt.': 'كلمة المرور مفقودة.',
  'Titel fehlt.': 'العنوان مفقود.',
  'Unbekannte Schnittstelle.': 'واجهة غير معروفة.',
  'Ungültige Anfrage.': 'طلب غير صالح.',
  'Ungültige Eingabe.': 'إدخال غير صالح.',
  'Ungültige Rolle.': 'دور غير صالح.',
  'Ungültiges Bild.': 'صورة غير صالحة.',
  'Ungültige Sprache.': 'لغة غير صالحة.',
  'Zu viele Anmeldeversuche. Bitte in einigen Minuten erneut versuchen.': 'محاولات تسجيل دخول كثيرة جدًا. يرجى المحاولة بعد بضع دقائق.',
};

const AR_NOUNS: Record<string, string> = {
  Eintrag: 'الإدخال', Betreuer: 'المشرف', Kind: 'الطفل', Kartenstapel: 'مجموعة البطاقات', Karte: 'البطاقة', Bild: 'الصورة',
};

/** Meldungen mit eingesetzten Werten */
const AR_PATTERNS: [RegExp, (...m: string[]) => string][] = [
  [/^Das Passwort muss mindestens (\d+) Zeichen lang sein\.$/, (n) => `يجب أن تتكون كلمة المرور من ${n} أحرف على الأقل.`],
  [/^Zu viele Fehlversuche\. Das Konto ist vorübergehend gesperrt – bitte in (\d+) Minuten erneut versuchen\.$/,
    (n) => `محاولات فاشلة كثيرة جدًا. الحساب مقفل مؤقتًا – يرجى المحاولة مرة أخرى بعد ${n} دقيقة.`],
  [/^(\S+) nicht gefunden\.$/, (what) => `${AR_NOUNS[what] ?? what}: غير موجود.`],
];

/** Gibt undefined zurück, wenn es keine Übersetzung gibt. */
export function translateArabic(message: string): string | undefined {
  if (AR[message]) return AR[message];
  for (const [re, fn] of AR_PATTERNS) {
    const m = re.exec(message);
    if (m) return fn(...m.slice(1));
  }
  return undefined;
}

export function translate(message: string, lang: Language, status: number): string {
  if (lang === 'de') return message;
  // Unbekannte Meldungen (z. B. Standardtexte der Prüf-Bibliothek) nicht auf Deutsch/Englisch durchreichen
  return translateArabic(message) ?? (status >= 500 ? AR['Interner Fehler. Bitte später erneut versuchen.']! : AR['Ungültige Eingabe.']!);
}
